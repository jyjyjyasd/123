import type { ActionKind, SizeKey } from "./api";
import type { ResolutionKey } from "./size-presets";

export type ReusePayload = {
  action: ActionKind;
  prompt: string;
  size: SizeKey;
  // 老历史可能缺 resolution；workspace 复用时用 DEFAULT 兜底
  resolution: ResolutionKey | null;
};

const KEY = "pf:reuse";

export const stashReuse = (payload: ReusePayload): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage may be unavailable; degrade to no-op */
  }
};

export const popReuse = (): ReusePayload | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as ReusePayload;
  } catch {
    return null;
  }
};
