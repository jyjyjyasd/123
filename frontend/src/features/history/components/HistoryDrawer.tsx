import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImageViewer } from "@/components/ui/ImageViewer";
import { fetchGeneration } from "@/features/generation/api";
import type { SizeKey } from "@/features/generation/api";
import type { ResolutionKey } from "@/features/generation/size-presets";
import { errorMessage } from "@/features/generation/error-copy";
import { actionLabel, formatRelative, paramsBadge } from "../format";
import { useDeleteGeneration } from "../hooks";

type ViewerKind = "output" | "reference";
type ViewerOpen = { kind: ViewerKind; index: number };

const formatAbsolute = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[64px_1fr] items-start gap-3">
    <div className="pt-0.5 text-xs text-text-tertiary">{label}</div>
    <div className="min-w-0">{children}</div>
  </div>
);

export const HistoryDrawer = ({
  jobId,
  onClose,
  onReuse,
}: {
  jobId: string | null;
  onClose: () => void;
  onReuse?: (payload: { prompt: string; size: SizeKey; resolution: ResolutionKey | null }) => void;
}) => {
  const del = useDeleteGeneration();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [viewer, setViewer] = useState<ViewerOpen | null>(null);

  const detail = useQuery({
    queryKey: ["generation", jobId],
    queryFn: () => fetchGeneration(jobId!),
    enabled: !!jobId,
  });

  useEffect(() => {
    setImgDims(null);
    setCarouselIdx(0);
    setConfirmDelete(false);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (viewer) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [jobId, onClose, viewer]);

  if (!jobId) return null;

  const gen = detail.data ?? null;
  const outputs = gen?.output_files ?? [];
  const references = gen?.reference_files ?? [];
  const currentFile = outputs[carouselIdx] ?? null;
  const isFailed = gen?.status === "failed";

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    }
  };

  const handleReuse = () => {
    if (!gen || !onReuse) return;
    onReuse({
      prompt: gen.prompt,
      size: gen.params.size,
      resolution: gen.params.resolution ?? null,
    });
  };

  const handleDelete = () => {
    if (!gen) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    del.mutate(gen.id, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />

      <div
        className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-6"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-auto flex max-h-[90vh] flex-col overflow-hidden rounded-xl bg-bg-primary shadow-modal animate-[slideUp_200ms_ease-out]"
          style={{
            width: imgDims
              ? `clamp(420px, calc(70vh * ${imgDims.w / imgDims.h}), 90vw)`
              : "560px",
          }}
        >
          <header className="flex h-11 items-center justify-between border-b border-border-default px-4">
            <div className="truncate text-sm font-medium text-text-primary">
              {gen ? `${actionLabel(gen.action)} 路 ${formatRelative(gen.created_at)}` : "加载中…"}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-hover"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto">
            {detail.isPending && <div className="aspect-video animate-pulse bg-bg-secondary" />}

            {detail.error && (
              <div className="p-4 text-sm text-error">加载失败：{detail.error.message}</div>
            )}

            {gen && (
              <>
                {currentFile ? (
                  <div
                    className="relative w-full bg-bg-secondary"
                    style={{
                      aspectRatio: imgDims ? `${imgDims.w} / ${imgDims.h}` : "1 / 1",
                      maxHeight: "65vh",
                    }}
                  >
                    <img
                      src={currentFile.url}
                      alt=""
                      onLoad={onImgLoad}
                      onClick={() => setViewer({ kind: "output", index: carouselIdx })}
                      className="block h-full w-full cursor-zoom-in object-contain"
                    />
                    {outputs.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCarouselIdx((i) => (i - 1 + outputs.length) % outputs.length)}
                          className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-primary/85 text-white shadow-popover transition-transform hover:scale-105 hover:bg-text-primary"
                          aria-label="上一张"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCarouselIdx((i) => (i + 1) % outputs.length)}
                          className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-primary/85 text-white shadow-popover transition-transform hover:scale-105 hover:bg-text-primary"
                          aria-label="下一张"
                        >
                          <ChevronRight size={20} />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-text-primary/70 px-3 py-1 text-xs text-white backdrop-blur-sm">
                          {carouselIdx + 1} / {outputs.length}
                        </div>
                      </>
                    )}
                  </div>
                ) : isFailed ? (
                  <div className="px-4 pt-4">
                    <div className="flex items-start gap-3 rounded-md border border-error/20 bg-error-bg/40 px-4 py-4">
                      <AlertCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-error" />
                      <div className="min-w-0 space-y-1.5">
                        <div className="text-sm font-medium text-text-primary">
                          {errorMessage(gen.error_code) || "任务失败"}
                        </div>
                        {gen.error_message && (
                          <div className="whitespace-pre-wrap break-words text-xs text-text-secondary">
                            {gen.error_message}
                          </div>
                        )}
                        {gen.error_code && (
                          <div className="mt-0.5 text-xs tabular-nums text-text-tertiary">
                            code: {gen.error_code}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-bg-secondary text-sm text-text-tertiary">
                    {gen.status === "pending" || gen.status === "running" ? "进行中…" : "无输出"}
                  </div>
                )}

                <div className="flex flex-col gap-4 px-4 py-4">
                  <Field label="Prompt">
                    <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
                      {gen.prompt || <span className="text-text-tertiary">（空）</span>}
                    </div>
                  </Field>

                  {gen.revised_prompt && (
                    <Field label="改写后">
                      <div className="whitespace-pre-wrap break-words text-sm text-text-secondary">
                        {gen.revised_prompt}
                      </div>
                    </Field>
                  )}

                  <Field label="参数">
                    <div className="text-sm tabular-nums text-text-secondary">
                      {paramsBadge(gen.params)}
                    </div>
                  </Field>

                  {references.length > 0 && (
                    <Field label={references.length > 1 ? `参考图 ×${references.length}` : "参考图"}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {references.map((rf, idx) => (
                          <button
                            key={rf.file_id}
                            type="button"
                            onClick={() => setViewer({ kind: "reference", index: idx })}
                            className="block h-16 w-16 cursor-zoom-in overflow-hidden rounded-md border border-border-default bg-bg-secondary transition-opacity hover:opacity-90"
                          >
                            <img
                              src={rf.url}
                              alt={`参考图 ${idx + 1}`}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}

                  <Field label="时间">
                    <div className="text-xs tabular-nums text-text-tertiary">
                      创建：{formatAbsolute(gen.created_at)}
                      {gen.completed_at && <> 路 完成：{formatAbsolute(gen.completed_at)}</>}
                    </div>
                  </Field>
                </div>
              </>
            )}
          </div>

          {gen && viewer?.kind === "output" && outputs.length > 0 && (
            <ImageViewer
              images={outputs.map((file) => ({
                src: file.url,
                downloadUrl: file.url,
                alt: gen.prompt || "",
              }))}
              index={viewer.index}
              onIndexChange={(index) => {
                setViewer({ kind: "output", index });
                setCarouselIdx(index);
              }}
              onClose={() => setViewer(null)}
              caption={`${actionLabel(gen.action)} 路 ${paramsBadge(gen.params)}`}
            />
          )}

          {gen && viewer?.kind === "reference" && references.length > 0 && (
            <ImageViewer
              images={references.map((file) => ({
                src: file.url,
                downloadUrl: file.url,
                alt: "参考图",
              }))}
              index={viewer.index}
              onIndexChange={(index) => setViewer({ kind: "reference", index })}
              onClose={() => setViewer(null)}
              caption={`参考图${references.length > 1 ? ` ×${references.length}` : ""}`}
            />
          )}

          {gen && (
            <footer className="flex flex-none items-center gap-3 border-t border-border-default px-4 py-3">
              <Button type="button" size="md" onClick={handleReuse} className="flex-1">
                <RotateCcw size={14} className="mr-1.5" />
                复用
              </Button>
              <Link
                to={`/generation/${gen.id}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                详情页
              </Link>
              {currentFile && (
                <a
                  href={currentFile.url}
                  download
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  <Download size={14} />
                  下载
                </a>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={del.isPending}
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-error-bg " +
                  (confirmDelete ? "font-medium text-error" : "text-text-secondary hover:text-error")
                }
              >
                <Trash2 size={14} />
                {del.isPending ? "删除中…" : confirmDelete ? "再点一次确认" : "删除"}
              </button>
            </footer>
          )}
        </div>
      </div>
    </>
  );
};
