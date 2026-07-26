import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { RowMasonry } from "@/components/layout/row-masonry";
import type { AdminGalleryFilter, AdminUser } from "../api";
import { useAdminGallery } from "../hooks";
import { AdminGalleryCard } from "./AdminGalleryCard";
import { AdminGenerationDrawer } from "./AdminGenerationDrawer";
import { UserPicker } from "./UserPicker";

type ActionKey = "all" | "generate" | "edit";
type StatusKey = "all" | "completed" | "failed" | "running";

const ACTION_OPTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "generate", label: "生成" },
  { key: "edit", label: "编辑" },
];

const STATUS_OPTIONS: Array<{ key: StatusKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "completed", label: "成功" },
  { key: "failed", label: "失败" },
  { key: "running", label: "进行中" },
];

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={
      active
        ? "px-2.5 py-1 rounded-md text-xs font-medium bg-[#37352F] text-white transition-colors duration-150"
        : "px-2.5 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-hover transition-colors duration-150"
    }
  >
    {children}
  </button>
);

const FilterRow = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) => (
  <div className="flex items-center gap-2">
    <div className="text-xs text-text-tertiary w-10 shrink-0">{label}</div>
    <div className="flex items-center gap-1 flex-wrap">
      {options.map((opt) => (
        <Chip
          key={opt.key}
          active={value === opt.key}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </Chip>
      ))}
    </div>
  </div>
);

export const AdminGallery = ({ enabled }: { enabled: boolean }) => {
  const [actionKey, setActionKey] = useState<ActionKey>("all");
  const [statusKey, setStatusKey] = useState<StatusKey>("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const filter = useMemo<AdminGalleryFilter>(() => {
    const f: AdminGalleryFilter = {};
    if (actionKey !== "all") f.action = actionKey;
    if (statusKey !== "all") f.status = statusKey === "running" ? "running" : statusKey;
    if (selectedUser) f.user_id = selectedUser.id;
    return f;
  }, [actionKey, statusKey, selectedUser]);

  const q = useAdminGallery(enabled, filter);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, error } = q;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Filter rows — quiet, single line each */}
      <div className="flex flex-col gap-2.5 rounded-md border border-border-default bg-bg-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-xs text-text-tertiary w-10 shrink-0">用户</div>
          <UserPicker value={selectedUser} onChange={setSelectedUser} />
        </div>
        <FilterRow
          label="动作"
          options={ACTION_OPTIONS}
          value={actionKey}
          onChange={(k) => setActionKey(k as ActionKey)}
        />
        <FilterRow
          label="状态"
          options={STATUS_OPTIONS}
          value={statusKey}
          onChange={(k) => setStatusKey(k as StatusKey)}
        />
      </div>

      {error && (
        <div className="rounded-md border border-border-default bg-bg-primary p-6 text-sm text-error">
          加载失败：{error.message}
        </div>
      )}

      {/* Skeleton — only on first load */}
      {isPending && items.length === 0 && (
        <RowMasonry
          items={Array.from({ length: 9 })}
          getKey={(_, i) => `skeleton-${i}`}
        >
          {(_, i) => (
            <div
              className="aspect-square bg-bg-secondary rounded-lg animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          )}
        </RowMasonry>
      )}

      {/* Empty state */}
      {!isPending && !error && items.length === 0 && (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-text-tertiary">
            <Sparkles size={28} strokeWidth={1.5} />
          </div>
          <div className="text-sm text-text-secondary">当前筛选下没有任务</div>
        </div>
      )}

      {/* Masonry — 行优先：顶行最新，左→右匹配 created_at DESC */}
      {items.length > 0 && (
        <RowMasonry items={items} getKey={(item) => item.id}>
          {(item) => (
            <AdminGalleryCard item={item} onClick={() => setActiveId(item.id)} />
          )}
        </RowMasonry>
      )}

      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <div className="text-center text-xs text-text-tertiary py-2">加载更多…</div>
      )}

      <AdminGenerationDrawer
        key={activeId ?? "closed"}
        generationId={activeId}
        onClose={() => setActiveId(null)}
      />
    </div>
  );
};
