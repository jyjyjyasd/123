import { useCallback, useState } from "react";

import { HttpError } from "@/lib/api";
import { uploadReferenceFile } from "./api";
import { errorMessage } from "./error-copy";

export type RefUploadStatus = "uploading" | "ready" | "failed";

/**
 * Per-file upload record. Created the moment the user picks/drops a file;
 * the actual POST /api/uploads runs in the background and mutates `status`,
 * `progress`, and (on success) `fileId`.
 */
export type RefUpload = {
  id: string; // client-generated tempId, stable across re-renders
  file: File;
  fileId?: string;
  progress: number; // 0..1
  status: RefUploadStatus;
  errorMsg?: string;
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// LAN can finish a 10MB upload in ~100ms — too fast for the progress bar to
// register visually. Hold the "uploading" state for at least this long so
// the user always sees a progress bar fill (and a moment at 100%) before
// the green ✓ takes over.
const MIN_UPLOADING_VISIBLE_MS = 600;

/**
 * Owns the upload-side state for reference images: each file is uploaded
 * the moment it's picked (POST /api/uploads), with per-file progress and
 * retry. Submit code reads `readyFileIds` to assemble the generation
 * request; `allReady` blocks the submit button until uploads finish.
 *
 * Removing an item from the list does NOT call DELETE on the server —
 * orphan uploads are reaped by the existing 7-day GC (see CLAUDE.md §8).
 */
export const useReferenceUploads = () => {
  const [items, setItems] = useState<RefUpload[]>([]);

  const startUpload = useCallback((tempId: string, file: File) => {
    const startedAt = Date.now();
    const settle = (next: (i: RefUpload) => RefUpload) => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_UPLOADING_VISIBLE_MS - elapsed);
      const apply = () =>
        setItems((prev) => prev.map((i) => (i.id === tempId ? next(i) : i)));
      if (wait > 0) window.setTimeout(apply, wait);
      else apply();
    };

    uploadReferenceFile(file, {
      onProgress: (loaded, total) => {
        if (total <= 0) return;
        const p = Math.min(1, loaded / total);
        setItems((prev) =>
          prev.map((i) => (i.id === tempId ? { ...i, progress: p } : i)),
        );
      },
    })
      .then((res) => {
        // Snap to 100% immediately so the bar visibly fills, then settle to
        // "ready" after the minimum-visible window expires.
        setItems((prev) =>
          prev.map((i) => (i.id === tempId ? { ...i, progress: 1 } : i)),
        );
        settle((i) => ({
          ...i,
          fileId: res.file_id,
          progress: 1,
          status: "ready" as const,
          errorMsg: undefined,
        }));
      })
      .catch((err: unknown) => {
        const code = err instanceof HttpError ? err.code : "unknown";
        const msg = err instanceof HttpError ? err.message : "上传失败";
        settle((i) => ({
          ...i,
          status: "failed" as const,
          errorMsg: errorMessage(code, msg),
        }));
      });
  }, []);

  const add = useCallback(
    (files: File[]) => {
      const fresh: RefUpload[] = files.map((file) => ({
        id: newId(),
        file,
        progress: 0,
        status: "uploading" as const,
      }));
      setItems((prev) => [...prev, ...fresh]);
      for (const item of fresh) startUpload(item.id, item.file);
    },
    [startUpload],
  );

  const remove = useCallback((tempId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== tempId));
  }, []);

  const retry = useCallback(
    (tempId: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === tempId
            ? { ...i, status: "uploading" as const, progress: 0, errorMsg: undefined }
            : i,
        ),
      );
      const item = items.find((i) => i.id === tempId);
      if (item) startUpload(tempId, item.file);
    },
    [items, startUpload],
  );

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const readyFileIds = items
    .filter((i) => i.status === "ready" && i.fileId)
    .map((i) => i.fileId as string);

  // True when the user can submit: either no refs at all, or every ref is ready.
  const allReady = items.every((i) => i.status === "ready");
  const hasFailed = items.some((i) => i.status === "failed");
  const hasUploading = items.some((i) => i.status === "uploading");

  return {
    items,
    add,
    remove,
    retry,
    clear,
    readyFileIds,
    allReady,
    hasFailed,
    hasUploading,
  };
};
