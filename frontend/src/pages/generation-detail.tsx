import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from "lucide-react";

import { ImageViewer } from "@/components/ui/ImageViewer";
import { fetchGeneration } from "@/features/generation/api";
import { errorMessage } from "@/features/generation/error-copy";
import { actionLabel, formatRelative, paramsBadge } from "@/features/history/format";

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

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-3xl border border-black/5 bg-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.06)] backdrop-blur-sm">
    <div className="border-b border-black/5 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
      {title}
    </div>
    <div className="px-5 py-5">{children}</div>
  </section>
);

const GenerationDetailPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [viewer, setViewer] = useState<ViewerOpen | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const detail = useQuery({
    queryKey: ["generation-page", jobId],
    queryFn: () => fetchGeneration(jobId!),
    enabled: !!jobId,
  });

  useEffect(() => {
    setCarouselIdx(0);
    setImgDims(null);
  }, [jobId]);

  if (!jobId) {
    return <Navigate to="/" replace />;
  }

  const gen = detail.data ?? null;
  const outputs = gen?.output_files ?? [];
  const refs = gen?.reference_files ?? [];
  const currentFile = outputs[carouselIdx] ?? null;
  const isFailed = gen?.status === "failed";

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(194,169,120,0.22),_transparent_34%),linear-gradient(180deg,_#f8f4eb_0%,_#f5f1e8_52%,_#efe6d9_100%)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-black/5 bg-white/75 px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.05)] backdrop-blur-sm">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
              Poster Result Page
            </div>
            <div className="mt-1 text-lg font-semibold text-text-primary">
              {gen ? `${actionLabel(gen.action)} 路 ${formatRelative(gen.created_at)}` : "生成详情"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/?tab=quick"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              <ChevronLeft size={14} />
              返回工作区
            </Link>
            {gen && (
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-sm text-white transition-colors hover:bg-black"
              >
                继续生成
                <ExternalLink size={14} />
              </Link>
            )}
          </div>
        </header>

        {detail.isPending && (
          <div className="rounded-3xl border border-black/5 bg-white/80 px-6 py-20 text-center text-sm text-text-secondary shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            正在加载生成详情…
          </div>
        )}

        {detail.error && (
          <div className="rounded-3xl border border-error/20 bg-white/85 px-6 py-10 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <div className="flex items-start gap-3 text-error">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">{detail.error.message}</div>
            </div>
          </div>
        )}

        {gen && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <Section title="Visual">
              {currentFile ? (
                <div className="space-y-4">
                  <div
                    className="relative overflow-hidden rounded-[28px] bg-[#f3eee4]"
                    style={{
                      aspectRatio: imgDims ? `${imgDims.w} / ${imgDims.h}` : "1 / 1",
                    }}
                  >
                    <img
                      src={currentFile.url}
                      alt={gen.prompt || "poster"}
                      onLoad={onImgLoad}
                      onClick={() => setViewer({ kind: "output", index: carouselIdx })}
                      className="h-full w-full cursor-zoom-in object-contain"
                    />
                    {outputs.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCarouselIdx((i) => (i - 1 + outputs.length) % outputs.length)}
                          className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-primary/85 text-white shadow-lg transition-transform hover:scale-105"
                          aria-label="上一张"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCarouselIdx((i) => (i + 1) % outputs.length)}
                          className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-primary/85 text-white shadow-lg transition-transform hover:scale-105"
                          aria-label="下一张"
                        >
                          <ChevronRight size={18} />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-text-primary/75 px-3 py-1 text-xs text-white backdrop-blur-sm">
                          {carouselIdx + 1} / {outputs.length}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={currentFile.url}
                      download
                      className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-sm text-white transition-colors hover:bg-black"
                    >
                      <Download size={14} />
                      下载当前图
                    </a>
                    <div className="rounded-full bg-[#efe7da] px-3 py-2 text-xs text-text-secondary">
                      {paramsBadge(gen.params)}
                    </div>
                    <div className="rounded-full bg-[#f4efe6] px-3 py-2 text-xs text-text-tertiary">
                      {actionLabel(gen.action)}
                    </div>
                  </div>
                </div>
              ) : isFailed ? (
                <div className="rounded-[28px] border border-error/15 bg-error-bg/50 px-6 py-8">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="mt-0.5 shrink-0 text-error" />
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-text-primary">
                        {errorMessage(gen.error_code) || "生成失败"}
                      </div>
                      {gen.error_message && (
                        <div className="whitespace-pre-wrap break-words text-sm text-text-secondary">
                          {gen.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-[28px] bg-[#f3eee4] text-sm text-text-tertiary">
                  {gen.status === "pending" || gen.status === "running" ? "生成中…" : "暂无输出"}
                </div>
              )}
            </Section>

            <div className="flex flex-col gap-6">
              <Section title="Prompt">
                <div className="space-y-4">
                  <div className="whitespace-pre-wrap break-words text-sm leading-7 text-text-primary">
                    {gen.prompt || "（空）"}
                  </div>
                  {gen.revised_prompt && (
                    <div className="rounded-2xl bg-[#f6f0e5] px-4 py-4 text-sm leading-7 text-text-secondary">
                      {gen.revised_prompt}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Metadata">
                <div className="space-y-4 text-sm text-text-secondary">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-text-tertiary">状态</span>
                    <span className="font-medium text-text-primary">{gen.status}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-text-tertiary">创建时间</span>
                    <span className="text-right tabular-nums text-text-primary">
                      {formatAbsolute(gen.created_at)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-text-tertiary">完成时间</span>
                    <span className="text-right tabular-nums text-text-primary">
                      {formatAbsolute(gen.completed_at)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-text-tertiary">参数</span>
                    <span className="text-right text-text-primary">{paramsBadge(gen.params)}</span>
                  </div>
                  {gen.error_code && (
                    <div className="rounded-2xl bg-error-bg/40 px-4 py-3 text-xs text-error">
                      code: {gen.error_code}
                    </div>
                  )}
                </div>
              </Section>

              {refs.length > 0 && (
                <Section title="References">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {refs.map((rf, idx) => (
                      <button
                        key={rf.file_id}
                        type="button"
                        onClick={() => setViewer({ kind: "reference", index: idx })}
                        className="overflow-hidden rounded-2xl border border-black/6 bg-[#f3eee4] transition-opacity hover:opacity-90"
                      >
                        <img
                          src={rf.url}
                          alt={`reference-${idx + 1}`}
                          className="aspect-square h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        )}
      </div>

      {gen && viewer?.kind === "output" && outputs.length > 0 && (
        <ImageViewer
          images={outputs.map((f) => ({
            src: f.url,
            downloadUrl: f.url,
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

      {gen && viewer?.kind === "reference" && refs.length > 0 && (
        <ImageViewer
          images={refs.map((rf) => ({
            src: rf.url,
            downloadUrl: rf.url,
            alt: "reference",
          }))}
          index={viewer.index}
          onIndexChange={(index) => setViewer({ kind: "reference", index })}
          onClose={() => setViewer(null)}
          caption={`参考图${refs.length > 1 ? ` ×${refs.length}` : ""}`}
        />
      )}
    </div>
  );
};

export default GenerationDetailPage;
