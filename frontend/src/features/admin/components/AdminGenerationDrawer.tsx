import { useEffect, useState, type SyntheticEvent } from "react";
import { ChevronLeft, ChevronRight, Download, X, AlertCircle } from "lucide-react";

import { ImageViewer } from "@/components/ui/ImageViewer";
import { errorMessage } from "@/features/generation/error-copy";
import { actionLabel, formatRelative, paramsBadge } from "@/features/history/format";
import { useAdminGenerationDetail } from "../hooks";

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

const initial = (name: string): string => {
  const ch = name.trim().charAt(0);
  return ch || "·";
};

export const AdminGenerationDrawer = ({
  generationId,
  onClose,
}: {
  generationId: string | null;
  onClose: () => void;
}) => {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [viewer, setViewer] = useState<ViewerOpen | null>(null);
  const detail = useAdminGenerationDetail(generationId);

  // Lock body scroll + Esc.
  // viewer 打开时让它独占 Esc，避免连级一起关闭。
  useEffect(() => {
    if (!generationId) return;
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
  }, [generationId, onClose, viewer]);

  if (!generationId) return null;

  const gen = detail.data ?? null;
  const files = gen?.output_files ?? [];
  const currentFile = files[carouselIdx] ?? null;
  const isFailed = gen?.status === "failed";

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[100] animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-none"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-auto flex flex-col bg-bg-primary rounded-xl shadow-modal overflow-hidden animate-[slideUp_200ms_ease-out]"
          style={{
            width: imgDims
              ? `clamp(420px, calc(70vh * ${imgDims.w / imgDims.h}), 90vw)`
              : "560px",
            maxHeight: "90vh",
          }}
        >
          {/* Header — user identity + meta */}
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-default flex-none">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-8 w-8 rounded-full bg-bg-tertiary text-text-secondary flex items-center justify-center text-sm font-medium tabular-nums shrink-0"
                aria-hidden
              >
                {gen ? initial(gen.name || gen.work_id) : "·"}
              </div>
              <div className="min-w-0 flex flex-col">
                <div className="text-sm font-medium text-text-primary truncate">
                  {gen ? gen.name : "加载中…"}
                </div>
                <div className="text-xs text-text-tertiary truncate tabular-nums">
                  {gen
                    ? `${gen.work_id} · ${actionLabel(gen.action)} · ${formatRelative(gen.created_at)}`
                    : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-text-secondary hover:bg-bg-hover shrink-0"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto">
            {detail.isPending && (
              <div className="aspect-video bg-bg-secondary animate-pulse" />
            )}
            {detail.error && (
              <div className="p-4 text-sm text-error">
                加载失败：{detail.error.message}
              </div>
            )}

            {gen && (
              <>
                {/* Hero image / failed banner */}
                {currentFile ? (
                  <div
                    className="relative bg-bg-secondary w-full"
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
                      className="block w-full h-full object-contain cursor-zoom-in"
                    />
                    {files.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setCarouselIdx((i) => (i - 1 + files.length) % files.length)
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-text-primary/85 text-white hover:bg-text-primary shadow-popover transition-transform hover:scale-105"
                          aria-label="上一张"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCarouselIdx((i) => (i + 1) % files.length)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-text-primary/85 text-white hover:bg-text-primary shadow-popover transition-transform hover:scale-105"
                          aria-label="下一张"
                        >
                          <ChevronRight size={20} />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-text-primary/70 text-white text-xs backdrop-blur-sm">
                          {carouselIdx + 1} / {files.length}
                        </div>
                      </>
                    )}
                  </div>
                ) : isFailed ? (
                  <div className="px-4 pt-4">
                    <div className="rounded-md border border-error/20 bg-error-bg/40 px-4 py-4 flex items-start gap-3">
                      <AlertCircle size={18} strokeWidth={1.5} className="text-error mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="text-sm font-medium text-text-primary">
                          {errorMessage(gen.error_code) || "任务失败"}
                        </div>
                        {gen.error_message && (
                          <div className="text-xs text-text-secondary break-words whitespace-pre-wrap">
                            {gen.error_message}
                          </div>
                        )}
                        {gen.error_code && (
                          <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                            code: {gen.error_code}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-bg-secondary flex items-center justify-center text-text-tertiary text-sm">
                    {gen.status === "pending" || gen.status === "running"
                      ? "进行中…"
                      : "无输出"}
                  </div>
                )}

                {/* Meta */}
                <div className="px-4 py-4 flex flex-col gap-4">
                  <Field label="Prompt">
                    <div className="text-sm text-text-primary whitespace-pre-wrap break-words">
                      {gen.prompt || <span className="text-text-tertiary">（空）</span>}
                    </div>
                  </Field>

                  {gen.revised_prompt && (
                    <Field label="改写后">
                      <div className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                        {gen.revised_prompt}
                      </div>
                    </Field>
                  )}

                  <Field label="参数">
                    <div className="text-sm text-text-secondary tabular-nums">
                      {paramsBadge(gen.params)}
                    </div>
                  </Field>

                  {gen.reference_files.length > 0 && (
                    <Field
                      label={
                        gen.reference_files.length > 1
                          ? `参考图 ×${gen.reference_files.length}`
                          : "参考图"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {gen.reference_files.map((rf, idx) => (
                          <button
                            key={rf.file_id}
                            type="button"
                            onClick={() => setViewer({ kind: "reference", index: idx })}
                            className="block w-16 h-16 rounded-md overflow-hidden border border-border-default bg-bg-secondary hover:opacity-90 transition-opacity cursor-zoom-in"
                            aria-label={`查看参考图 ${idx + 1}`}
                            title={`查看参考图 ${idx + 1}`}
                          >
                            <img
                              src={rf.url}
                              alt={`参考图 ${idx + 1}`}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}

                  {/* For failed tasks where image already shows error block,
                      still surface error_code/message in fields for completeness
                      when image area was the carousel (rare but possible). */}
                  {isFailed && currentFile && (
                    <Field label="错误">
                      <div className="text-sm text-error">
                        {errorMessage(gen.error_code, gen.error_message ?? undefined)}
                      </div>
                    </Field>
                  )}

                  <Field label="时间">
                    <div className="text-xs text-text-tertiary tabular-nums">
                      创建：{formatAbsolute(gen.created_at)}
                      {gen.completed_at && (
                        <> · 完成：{formatAbsolute(gen.completed_at)}</>
                      )}
                    </div>
                  </Field>
                </div>
              </>
            )}
          </div>

          {gen && viewer?.kind === "output" && files.length > 0 && (
            <ImageViewer
              images={files.map((f) => ({
                src: f.url,
                downloadUrl: f.url,
                alt: gen.prompt || "",
              }))}
              index={viewer.index}
              onIndexChange={(i) => {
                setViewer({ kind: "output", index: i });
                setCarouselIdx(i);
              }}
              onClose={() => setViewer(null)}
              caption={`${gen.work_id} · ${actionLabel(gen.action)} · ${paramsBadge(gen.params)}`}
            />
          )}
          {gen && viewer?.kind === "reference" && gen.reference_files.length > 0 && (
            <ImageViewer
              images={gen.reference_files.map((rf) => ({
                src: rf.url,
                downloadUrl: rf.url,
                alt: "参考图",
              }))}
              index={viewer.index}
              onIndexChange={(i) => setViewer({ kind: "reference", index: i })}
              onClose={() => setViewer(null)}
              caption={`${gen.work_id} · 参考图${
                gen.reference_files.length > 1 ? ` ×${gen.reference_files.length}` : ""
              }`}
            />
          )}

          {gen && currentFile && (
            <footer className="flex-none border-t border-border-default px-4 py-3 flex items-center gap-3">
              <a
                href={currentFile.url}
                download
                className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-bg-hover"
              >
                <Download size={14} />
                下载当前
              </a>
              <div className="text-xs text-text-tertiary ml-auto tabular-nums">
                ID {gen.id.slice(0, 8)}
              </div>
            </footer>
          )}
        </div>
      </div>
    </>
  );
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="grid grid-cols-[64px_1fr] gap-3 items-start">
    <div className="text-xs text-text-tertiary pt-0.5">{label}</div>
    <div className="min-w-0">{children}</div>
  </div>
);
