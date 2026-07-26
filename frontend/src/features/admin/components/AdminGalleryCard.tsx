import { AlertCircle, ImageOff, Loader2 } from "lucide-react";

import { errorMessage } from "@/features/generation/error-copy";
import { aspectRatioStyle } from "@/features/generation/size-presets";
import { actionLabel, formatRelative, paramsBadge } from "@/features/history/format";
import type { AdminGalleryItem } from "../api";

export const AdminGalleryCard = ({
  item,
  onClick,
}: {
  item: AdminGalleryItem;
  onClick?: () => void;
}) => {
  const isFailed = item.status === "failed";
  const isPending = item.status === "pending" || item.status === "running";
  const aspectStyle = aspectRatioStyle(item.params.size);

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
        {/* User chip — top-left, hairline border, monochrome */}
        <div className="absolute top-2 left-2 z-10 max-w-[70%] flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/85 backdrop-blur-[2px] border border-border-default text-xs text-text-primary tabular-nums truncate">
          <span className="inline-block w-1 h-1 rounded-full bg-text-tertiary shrink-0" aria-hidden />
          <span className="truncate">{item.work_id}</span>
        </div>

        {isPending ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
            <Loader2 size={20} className="animate-spin" strokeWidth={1.5} />
          </div>
        ) : isFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 bg-error-bg/40 ring-1 ring-inset ring-error/15">
            <AlertCircle size={20} strokeWidth={1.5} className="text-error" />
            <div className="text-xs text-text-secondary text-center line-clamp-2 max-w-[88%]">
              {errorMessage(item.error_code) || "已失败"}
            </div>
          </div>
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
          <span className="ml-auto">{formatRelative(item.created_at)}</span>
        </div>
      </div>
    </button>
  );
};
