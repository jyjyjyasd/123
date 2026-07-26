import { resolutionLabel, sizeDisplayName } from "@/features/generation/size-presets";

export const paramsBadge = (p: { size: string; resolution?: string | null }): string => {
  const name = sizeDisplayName(p.size);
  if (p.size === "auto" || !p.resolution) return name;
  return `${name} 路 ${resolutionLabel(p.resolution)}`;
};

export const actionLabel = (action: string): string =>
  action === "edit" ? "编辑" : "生成";

export const formatRelative = (iso: string): string => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;

  const diffMs = Date.now() - time;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;

  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
};
