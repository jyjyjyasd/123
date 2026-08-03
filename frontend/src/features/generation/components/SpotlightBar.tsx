import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import { ImageViewer } from "@/components/ui/ImageViewer";
import { prepareReferenceFiles, REFERENCE_INPUT_ACCEPT } from "@/lib/reference-files";
import { cn } from "@/lib/utils";
import type { ActionKind, SizeKey } from "../api";
import { MAX_REFERENCE_IMAGES } from "../api";
import { sizeDisplayName, type ResolutionKey, resolutionLabel } from "../size-presets";
import type { RefUpload } from "../use-reference-uploads";
import { ParamsRow } from "./ParamsRow";

const TEXTAREA_MAX_PX = 280;
const NOTICE_TIMEOUT_MS = 3000;

export const SpotlightBar = ({
  action,
  prompt,
  size,
  resolution,
  refUploads,
  canSubmit,
  isBusy,
  statusPhase,
  error,
  onPrompt,
  onSize,
  onResolution,
  onAddRefs,
  onRemoveRef,
  onRetryRef,
  onSubmit,
}: {
  action: ActionKind;
  prompt: string;
  size: SizeKey;
  resolution: ResolutionKey;
  refUploads: RefUpload[];
  canSubmit: boolean;
  isBusy: boolean;
  statusPhase: "idle" | "uploaded" | "queued" | "generating";
  error: string | null;
  onPrompt: (v: string) => void;
  onSize: (v: SizeKey) => void;
  onResolution: (v: ResolutionKey) => void;
  onAddRefs: (files: File[]) => void;
  onRemoveRef: (id: string) => void;
  onRetryRef: (id: string) => void;
  onSubmit: () => void;
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPreparingRefs, setIsPreparingRefs] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  const isInputBusy = isBusy || isPreparingRefs;
  const canAddMore = refUploads.length < MAX_REFERENCE_IMAGES;

  const previews = useMemo(
    () => refUploads.map((u) => ({ id: u.id, url: URL.createObjectURL(u.file) })),
    [refUploads],
  );

  useEffect(() => {
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!showSettings) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (settingsBtnRef.current?.contains(target)) return;
      setShowSettings(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showSettings]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && showSettings) {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  useEffect(() => {
    const handleDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault();
      if (!isInputBusy) setDragOver(true);
    };
    const handleDragLeave = (e: globalThis.DragEvent) => {
      e.preventDefault();
      if (e.relatedTarget === null) {
        setDragOver(false);
      }
    };
    const handleDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        void handleAddFiles(Array.from(files));
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [isInputBusy, refUploads]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [prompt]);

  async function handleAddFiles(incoming: File[]) {
    if (isInputBusy || incoming.length === 0) return;

    setIsPreparingRefs(true);
    try {
      const prepared = await prepareReferenceFiles(incoming);
      if (prepared.files.length === 0) {
        setNotice(prepared.notices[0] ?? "没有可用的参考图");
        return;
      }

      const remaining = MAX_REFERENCE_IMAGES - refUploads.length;
      if (remaining <= 0) {
        setNotice(`最多支持 ${MAX_REFERENCE_IMAGES} 张参考图`);
        return;
      }

      const accepted = prepared.files.slice(0, remaining);
      const nextNotice =
        prepared.notices[0] ??
        (accepted.length < prepared.files.length ? `仅加入前 ${accepted.length} 张参考图` : null);

      if (nextNotice) {
        setNotice(nextNotice);
      }
      onAddRefs(accepted);
    } catch {
      setNotice("PDF 解析失败，请换一份文件再试");
    } finally {
      setIsPreparingRefs(false);
    }
  };

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onPrompt(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (canSubmit) {
      onSubmit();
      setShowSettings(false);
    }
  };

  return (
    <div className="relative z-40 mx-auto w-full max-w-[800px]">
      {showSettings && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-3 w-full rounded-xl border border-border-default bg-white/95 p-5 shadow-modal backdrop-blur-xl animate-[slideUp_150ms_ease-out]"
        >
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            生成参数
          </div>
          <ParamsRow
            action={action}
            size={size}
            resolution={resolution}
            onSize={onSize}
            onResolution={onResolution}
            disabled={isInputBusy}
          />
        </div>
      )}

      <div
        className={cn(
          "relative flex flex-col rounded-2xl border bg-white/80 backdrop-blur-2xl transition-all duration-300",
          dragOver
            ? "border-accent bg-accent-bg ring-2 ring-accent/20"
            : "border-border-strong shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-text-primary focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
        )}
      >
        {dragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-white/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 font-medium text-accent">
              <ImagePlus size={20} />
              松开以上传参考图
            </div>
          </div>
        )}

        {(refUploads.length > 0 || notice) && (
          <div className="flex items-center gap-3 px-4 pb-1 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {refUploads.map((upload, idx) => {
                const previewUrl = previews.find((preview) => preview.id === upload.id)?.url ?? "";
                const isUploading = upload.status === "uploading";
                const isFailed = upload.status === "failed";
                const isReady = upload.status === "ready";
                const pct = Math.round(upload.progress * 100);

                return (
                  <div
                    key={upload.id}
                    className={cn(
                      "group relative h-14 w-14 overflow-hidden rounded-md border bg-bg-secondary",
                      isFailed ? "border-error" : "border-border-default",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isReady) setViewerIdx(idx);
                        if (isFailed) onRetryRef(upload.id);
                      }}
                      disabled={isUploading}
                      className={cn(
                        "block h-full w-full",
                        isReady && "cursor-zoom-in",
                        isFailed && "cursor-pointer",
                      )}
                    >
                      <img
                        src={previewUrl}
                        alt={`Reference ${idx + 1}`}
                        className={cn(
                          "h-full w-full object-cover transition-opacity",
                          isUploading && "opacity-50",
                          isFailed && "opacity-40 grayscale",
                        )}
                      />
                    </button>

                    {isUploading && (
                      <>
                        <div className="pointer-events-none absolute inset-0 bg-black/25" />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-white">{pct}%</span>
                        </div>
                        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-black/30">
                          <div
                            className="h-full bg-white transition-[width] duration-150 ease-out"
                            style={{ width: `${Math.max(4, upload.progress * 100)}%` }}
                          />
                        </div>
                      </>
                    )}

                    {isReady && (
                      <div className="pointer-events-none absolute bottom-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-success text-white shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]">
                        <CheckCircle2 size={11} strokeWidth={2.5} />
                      </div>
                    )}

                    {isFailed && (
                      <>
                        <div className="pointer-events-none absolute bottom-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-error text-white shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]">
                          <AlertCircle size={11} strokeWidth={2.5} />
                        </div>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-error/0 transition-colors group-hover:bg-error/20">
                          <RefreshCw
                            size={16}
                            strokeWidth={2.25}
                            className="text-error opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRef(upload.id);
                      }}
                      className={cn(
                        "absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-black/55 text-white transition-opacity hover:bg-black/75",
                        isFailed ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                      aria-label={`移除参考图 ${idx + 1}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}

              {canAddMore && refUploads.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border-strong text-text-tertiary transition-colors hover:border-text-primary hover:bg-bg-hover hover:text-text-primary"
                  aria-label="继续添加参考图"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              )}
            </div>

            <div className="min-w-0 text-xs text-text-secondary">
              {refUploads.length > 0 && (
                <>
                  <div className="font-medium tabular-nums text-text-primary">
                    参考图 {refUploads.length}{" "}
                    <span className="text-text-tertiary">/ {MAX_REFERENCE_IMAGES}</span>
                  </div>
                  <div>
                    {isPreparingRefs
                      ? "正在解析 PDF…"
                      : refUploads.some((u) => u.status === "uploading")
                        ? "正在上传…"
                        : refUploads.some((u) => u.status === "failed")
                          ? "有上传失败，点击图片重试"
                          : "将用于图生图编辑模式"}
                  </div>
                </>
              )}
              {notice && <div className="mt-0.5 text-[11px] text-warning">{notice}</div>}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 p-3">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              refUploads.length > 0
                ? refUploads.length > 1
                  ? "输入指令以合并或修改这些图片…"
                  : "输入指令以修改这张图片…"
                : "输入 Prompt 生成图像…"
            }
            disabled={isInputBusy}
            rows={1}
            className="spotlight-textarea min-h-[40px] max-h-[280px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          />

          <div className="flex flex-none items-center gap-1 pb-1 pr-1">
            <button
              ref={settingsBtnRef}
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                showSettings
                  ? "bg-bg-active text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              )}
              title="设置"
            >
              <Settings2 size={18} />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              title="上传参考图"
            >
              <ImagePlus size={18} />
            </button>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                onSubmit();
                setShowSettings(false);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-all",
                !canSubmit
                  ? "bg-bg-secondary text-text-tertiary"
                  : "bg-text-primary text-white shadow-sm hover:bg-black",
              )}
              title={
                isInputBusy
                  ? "处理中…"
                  : refUploads.some((u) => u.status === "uploading")
                    ? "等待参考图上传完成"
                    : refUploads.some((u) => u.status === "failed")
                      ? "请重试或移除失败的参考图"
                      : "发送"
              }
            >
              {isInputBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : action === "edit" ? (
                <Sparkles size={16} />
              ) : (
                <Send size={16} className="-ml-0.5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-1 rounded-md bg-bg-secondary px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-hover"
          >
            {sizeDisplayName(size)}
            {size !== "auto" && <> 路 {resolutionLabel(resolution)}</>}
          </button>
          {refUploads.length > 0 && (
            <span className="rounded-md bg-accent-bg px-2 py-0.5 text-[11px] font-medium text-accent tabular-nums">
              Edit 路 {refUploads.length} 图
            </span>
          )}
        </div>

        {(statusPhase !== "idle" || isPreparingRefs) && (
          <div className="px-4 pb-2 text-[11px] tabular-nums">
            {isPreparingRefs && <span className="text-text-secondary">正在解析 PDF…</span>}
            {!isPreparingRefs && statusPhase === "uploaded" && (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <CheckCircle2 size={12} strokeWidth={2.5} />
                已提交，加入队列…
              </span>
            )}
            {!isPreparingRefs && statusPhase === "queued" && (
              <span className="text-text-secondary">排队中…</span>
            )}
            {!isPreparingRefs && statusPhase === "generating" && (
              <span className="text-text-secondary">生成中…</span>
            )}
          </div>
        )}

        {error && (
          <div className="px-4 pb-3 text-xs text-error">
            {error}
          </div>
        )}

        {isBusy && (
          <div className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden rounded-b-2xl">
            {statusPhase === "uploaded" ? (
              <div className="h-full w-full bg-success/70 transition-[width] duration-200 ease-out" />
            ) : (
              <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-text-primary/40" />
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={REFERENCE_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            void handleAddFiles(Array.from(files));
          }
          e.target.value = "";
        }}
      />

      {viewerIdx !== null && previews.length > 0 && (
        <ImageViewer
          images={previews.map((preview, idx) => ({
            src: preview.url,
            alt: refUploads[idx]?.file.name ?? "",
          }))}
          index={viewerIdx}
          onIndexChange={setViewerIdx}
          onClose={() => setViewerIdx(null)}
          caption={refUploads[viewerIdx]?.file.name}
        />
      )}
    </div>
  );
};
