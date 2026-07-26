import { useEffect, useState } from "react";
import { AlertCircle, ImageOff } from "lucide-react";

import type { HistoryItem } from "@/features/generation/api";
import { errorMessage } from "@/features/generation/error-copy";
import { aspectRatioStyle } from "@/features/generation/size-presets";
import { actionLabel, formatRelative, paramsBadge } from "../format";

// 缩略图的宽高比直接 = 真实输出尺寸；走 inline style.aspectRatio 而非
// Tailwind 任意值类（aspect-[w/h] 模板字符串 JIT 扫不到）。auto / 老
// 数据落到非 'WxH' 时由 aspectRatioStyle 兜底成 1:1。

const useElapsedSeconds = (sinceIso: string, active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 1000));
};

// Custom two-arc spinner — calmer than Loader2's full ring
const QuietSpinner = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    className="animate-spin text-text-secondary"
    style={{ animationDuration: "1.6s" }}
    aria-hidden
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.14"
      strokeWidth="1.5"
    />
    <path
      d="M21 12 a9 9 0 0 0 -9 -9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const PendingMedia = () => (
  <>
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-y-0 -left-1/3 w-1/3 animate-[shimmer_2.4s_ease-in-out_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(55,53,47,0.045), transparent)",
        }}
      />
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
      <QuietSpinner />
      <div className="text-xs text-text-tertiary tracking-[0.04em]">
        正在生成…
      </div>
    </div>
  </>
);

const FailedMedia = ({ code }: { code: string | null }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 bg-error-bg/40 ring-1 ring-inset ring-error/15">
    <AlertCircle size={22} strokeWidth={1.5} className="text-error mb-0.5" />
    <div className="text-sm font-medium text-text-primary">生成失败</div>
    <div className="text-xs text-text-secondary text-center line-clamp-2 max-w-[88%]">
      {errorMessage(code) || "请重试"}
    </div>
  </div>
);

export const HistoryCard = ({
  item,
  onClick,
}: {
  item: HistoryItem;
  onClick: () => void;
}) => {
  const isFailed = item.status === "failed";
  const isPending = item.status === "pending" || item.status === "running";
  const aspectStyle = aspectRatioStyle(item.params.size);
  const elapsed = useElapsedSeconds(item.created_at, isPending);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left flex flex-col rounded-lg border border-border-default bg-bg-primary overflow-hidden transition-all duration-200 hover:shadow-popover hover:-translate-y-0.5 animate-[cardIn_300ms_ease-out_both]"
    >
      <div
        className="relative bg-bg-secondary overflow-hidden"
        style={aspectStyle}
      >
        {isPending ? (
          <PendingMedia />
        ) : isFailed ? (
          <FailedMedia code={item.error_code} />
        ) : item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-tertiary">
            <ImageOff size={20} />
          </div>
        )}
        {item.output_count > 1 && item.thumbnail_url && (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-sm bg-black/60 text-white text-xs">
            ×{item.output_count}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="text-sm text-text-primary line-clamp-2 leading-snug">
          {item.prompt || "（空 prompt）"}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary tabular-nums">
          <span>{actionLabel(item.action)}</span>
          <span>·</span>
          <span>{paramsBadge(item.params)}</span>
          <span className="ml-auto">
            {isPending ? (
              <>
                <span className="text-text-secondary">已等待 {elapsed}s</span>
                <span className="ml-1.5">· 通常 30–60s</span>
              </>
            ) : (
              formatRelative(item.created_at)
            )}
          </span>
        </div>
      </div>
    </button>
  );
};
