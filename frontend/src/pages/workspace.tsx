import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { SpotlightBar } from "@/features/generation/components/SpotlightBar";
import { HistoryCard } from "@/features/history/components/HistoryCard";
import { HistoryDrawer } from "@/features/history/components/HistoryDrawer";
import { HISTORY_KEY } from "@/features/history/hooks";
import { useCreateGeneration, useGenerationPoll } from "@/features/generation/hooks";
import { useReferenceUploads } from "@/features/generation/use-reference-uploads";
import { errorMessage } from "@/features/generation/error-copy";
import { popReuse } from "@/features/generation/reuse";
import { DEFAULT_SIZE, DEFAULT_RESOLUTION, type ResolutionKey } from "@/features/generation/size-presets";
import type { ActionKind, SizeKey, HistoryItem } from "@/features/generation/api";
import { AgentWorkspace } from "@/features/agent/components/AgentWorkspace";

// ── 智能轮询展示卡片 ───────────────────────────────────────────────────
interface GenerationPollCardProps {
  jobId: string;
  onActive: (id: string) => void;
}

function GenerationPollCard({ jobId, onActive }: GenerationPollCardProps) {
  const poll = useGenerationPoll(jobId);

  if (!poll.data) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border-default rounded-lg bg-bg-secondary w-full max-w-[320px] h-[340px] animate-pulse">
        <div className="text-xs text-text-tertiary">正在获取任务状态...</div>
      </div>
    );
  }

  const currentHistoryItem: HistoryItem = {
    id: poll.data.id,
    action: poll.data.action,
    status: poll.data.status,
    prompt: poll.data.prompt,
    params: poll.data.params,
    thumbnail_url: poll.data.output_files?.[0]?.url ?? null,
    output_count: poll.data.output_files?.length ?? 0,
    error_code: poll.data.error_code,
    created_at: poll.data.created_at,
  };

  return (
    <div className="flex flex-col items-center justify-center py-4 w-full max-w-[320px]">
      <div style={{ fontSize: 11, fontWeight: 700, color: "#787774", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        {poll.data.status === "completed"
          ? "✨ 生成完成"
          : poll.data.status === "failed"
            ? "❌ 生成失败"
            : "⏳ 正在生成中..."}
      </div>
      <div className="w-full">
        <HistoryCard item={currentHistoryItem} onClick={() => onActive(poll.data.id)} />
      </div>
    </div>
  );
}

// ── 快速生成面板（原 WorkspacePage 内容提取为子组件）────────────────────────
function QuickGeneratePanel() {
  const [initialReuse] = useState(() => popReuse());
  const [prompt, setPrompt] = useState(initialReuse?.prompt ?? "");
  const [size, setSize] = useState<SizeKey>(initialReuse?.size ?? DEFAULT_SIZE);
  const [resolution, setResolution] = useState<ResolutionKey>(
    initialReuse?.resolution ?? DEFAULT_RESOLUTION,
  );
  const refUploads = useReferenceUploads();

  // action 派生自 refUploads：UI 与 state 永远一致；任意 1 张（含上传中/失败）即进入 edit 模式
  const action: ActionKind = refUploads.items.length > 0 ? "edit" : "generate";

  // size=auto 仅 edit 端支持；用户在 edit 选了 auto 后清掉所有参考图回到 generate
  // 时，自动回落到默认方图 — 否则提交会被后端拒。
  useEffect(() => {
    if (action === "generate" && size === "auto") {
      setSize(DEFAULT_SIZE);
    }
  }, [action, size]);

  const [jobIds, setJobIds] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Transient "✓ uploaded" pulse — also covers the gap between mutation
  // success and the first poll response (~few hundred ms) so the busy
  // indicator doesn't flicker off.
  const [justUploaded, setJustUploaded] = useState(false);

  const qc = useQueryClient();
  const create = useCreateGeneration();
  const poll = useGenerationPoll(activeJobId);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // When polling finishes, refresh history so it appears in the grid/drawer
  useEffect(() => {
    if (poll.data?.status === "completed" || poll.data?.status === "failed") {
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    }
  }, [poll.data?.status, qc]);

  // Auto-clear the "✓ uploaded" pulse after 1.2s
  useEffect(() => {
    if (!justUploaded) return;
    const t = window.setTimeout(() => setJustUploaded(false), 1200);
    return () => window.clearTimeout(t);
  }, [justUploaded]);

  const isBusy =
    create.isPending ||
    justUploaded ||
    poll.data?.status === "pending" ||
    poll.data?.status === "running";
  // Submit-side status (after the user clicks send). Reference-image upload
  // progress is shown per-thumbnail by SpotlightBar and is independent.
  type StatusPhase = "idle" | "uploaded" | "queued" | "generating";
  const statusPhase: StatusPhase = justUploaded
    ? "uploaded"
    : poll.data?.status === "running"
      ? "generating"
      : poll.data?.status === "pending"
        ? "queued"
        : "idle";

  const canSubmit =
    !!prompt.trim() &&
    !isBusy &&
    refUploads.allReady &&
    !refUploads.hasUploading &&
    !refUploads.hasFailed;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        action,
        prompt: prompt.trim(),
        size,
        resolution,
        reference_file_ids: action === "edit" ? refUploads.readyFileIds : undefined,
      },
      {
        onSuccess: ({ job_id }) => {
          setActiveJobId(job_id);
          setJobIds((prev) => [job_id, ...prev].slice(0, 3));
          setJustUploaded(true);
          setPrompt("");
          refUploads.clear();
        },
      },
    );
  };

  // Called from HistoryDrawer when user clicks "复用"。
  // 注意：参考图无法跨会话恢复，所以复用一个 edit 任务时只填回文案/参数，
  // mode 由 refImages 派生 —— 用户需要重新上传参考图才会进入 edit 模式。
  // resolution 在老历史里可能缺失（v0.7 像素 size 时代），用 DEFAULT 兜底。
  const handleReuse = useCallback(
    (payload: { prompt: string; size: SizeKey; resolution: ResolutionKey | null }) => {
      setPrompt(payload.prompt);
      setSize(payload.size);
      setResolution(payload.resolution ?? DEFAULT_RESOLUTION);
      setActiveId(null);
    },
    [],
  );

  // 监听顶部导航栏触发的历史记录复用事件
  useEffect(() => {
    const onReuseEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const { prompt, size, resolution } = customEvent.detail;
        setPrompt(prompt);
        setSize(size);
        setResolution(resolution ?? DEFAULT_RESOLUTION);
        setActiveId(null);
      }
    };
    window.addEventListener("pf:reuse-trigger", onReuseEvent);
    return () => window.removeEventListener("pf:reuse-trigger", onReuseEvent);
  }, []);

  return (
    <div className="relative h-full bg-[#fbfaf7] overflow-hidden flex flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-48 px-6 py-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]">
          {/* Welcome state if no active job */}
          {jobIds.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="text-text-tertiary">
                <Sparkles size={48} strokeWidth={1.5} className="animate-pulse" style={{ color: "#9a713b" }} />
              </div>
              <div>
                <p className="text-xs text-text-secondary max-w-sm leading-relaxed">
                  在下方输入提示词并点击生成。您的海报将呈现在这里，生成历史记录请通过顶部的历史按键查看。
                </p>
              </div>
            </div>
          )}

          {/* Current generation cards (up to 3) */}
          {jobIds.length > 0 && (
            <div className="flex flex-wrap items-start justify-center gap-8 py-6 w-full">
              {jobIds.map((id) => (
                <GenerationPollCard key={id} jobId={id} onActive={setActiveId} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 left-0 w-full px-6 pointer-events-none">
        <div className="pointer-events-auto">
          <SpotlightBar
            action={action}
            prompt={prompt}
            size={size}
            resolution={resolution}
            refUploads={refUploads.items}
            canSubmit={canSubmit}
            isBusy={isBusy}
            statusPhase={statusPhase}
            error={create.error ? errorMessage(create.error.code, create.error.message) : null}
            onPrompt={setPrompt}
            onSize={setSize}
            onResolution={setResolution}
            onAddRefs={refUploads.add}
            onRemoveRef={refUploads.remove}
            onRetryRef={refUploads.retry}
            onSubmit={submit}
          />
        </div>
      </div>

      <HistoryDrawer
        key={activeId ?? "closed"}
        jobId={activeId}
        onClose={() => setActiveId(null)}
        onReuse={handleReuse}
      />
    </div>
  );
}

// ── 主 WorkspacePage ──────────────────────────────────────────────────────────
const WorkspacePage = () => {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "agent" ? "agent" : "quick";

  return (
    <div className="relative h-full overflow-hidden">
      <div style={{ height: "100%" }}>
        <div style={{ display: activeTab === "quick" ? "block" : "none", height: "100%" }}>
          <QuickGeneratePanel />
        </div>
        <div style={{ display: activeTab === "agent" ? "block" : "none", height: "100%" }}>
          <AgentWorkspace />
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
