import { useRef, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { useHistory } from "@/features/history/hooks";
import { HistoryCard } from "./HistoryCard";

export function GlobalHistoryDrawer({
  onClose,
  onSelectJob,
}: {
  onClose: () => void;
  onSelectJob: (jobId: string) => void;
}) {
  const q = useHistory();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = q;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[100] animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        style={{ backdropFilter: "blur(2px)" }}
      />
      {/* Drawer Container */}
      <div
        className="fixed right-0 top-0 bottom-0 w-[460px] max-w-[90vw] bg-[#fff] z-[110] shadow-modal border-l border-border-default flex flex-col animate-[slideLeft_200ms_ease-out]"
      >
        <header className="h-14 flex items-center justify-between px-6 border-b border-border-default flex-none">
          <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <span>⚡</span>
            <span>快速生成历史画廊</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-text-secondary hover:bg-bg-hover shrink-0"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isPending && items.length === 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-bg-secondary rounded-lg animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-24 text-center">
              <div className="text-text-tertiary mb-3">
                <Sparkles size={32} strokeWidth={1.5} className="mx-auto" />
              </div>
              <div className="text-sm text-text-secondary">暂无历史生成记录</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {items.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  onClick={() => onSelectJob(item.id)}
                />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && (
            <div className="text-center text-xs text-text-tertiary py-3">
              加载更多…
            </div>
          )}
        </div>
      </div>
    </>
  );
}
