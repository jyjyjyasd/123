// features/agent/design-store.ts
// DesignStore：所有设计数据（文案/风格/排版/尺寸/分辨率）的单源真理
// 带脏标记——用户手动编辑过的字段不会被 AI 新推荐覆盖

import { create } from "zustand";
import type { StyleRecommendation, LayoutRecommendation, DesignJson, CopySegment } from "./types";

interface DesignState {
  // ── 数据字段 ──
  copy_raw: string;
  copy_segments: CopySegment[];
  visual_description_en: string;
  layout_description: string;
  active_style: StyleRecommendation | null;
  active_layout: LayoutRecommendation | null;
  active_ratio: string;        // "1:1" / "16:9" 等
  active_resolution: string;   // "1k" / "2k" / "4k"
  style_recommendations: StyleRecommendation[];
  layout_recommendations: LayoutRecommendation[];

  // ── 脏标记：true = 用户手动修改过，AI 新推荐不覆盖 ──
  dirty_copy: boolean;
  dirty_style_selection: boolean;
  dirty_layout_selection: boolean;

  // ── 方法 ──
  setCopyRaw(text: string): void;
  setActiveStyle(style: StyleRecommendation): void;
  setActiveLayout(layout: LayoutRecommendation): void;
  setActiveRatio(ratio: string): void;
  setActiveResolution(resolution: string): void;
  setStyleRecommendations(recs: StyleRecommendation[]): void;
  setLayoutRecommendations(recs: LayoutRecommendation[]): void;
  clearActiveStyle(): void;
  clearActiveLayout(): void;
  // 接受推荐（重置脏标记）
  applyStyleRecommendation(index: number): void;
  applyLayoutRecommendation(index: number): void;
  // 注入 AI 推荐（跳过 dirty 字段）
  ingestFromDesignJson(json: DesignJson): void;
  // 新 clarifying 轮次开始时调用，重置所有脏标记
  resetAllDirty(): void;
  // 用 session.stream_a/stream_b 兜底初始化（老会话或 design_json 为 null 时）
  initFromLegacy(opts: { copy?: string; styleRecs?: StyleRecommendation[]; layoutRecs?: LayoutRecommendation[]; ratio?: string; resolution?: string }): void;
}

export const useDesignStore = create<DesignState>((set) => ({
  // 初始值
  copy_raw: "",
  copy_segments: [],
  visual_description_en: "",
  layout_description: "",
  active_style: null,
  active_layout: null,
  active_ratio: "1:1",
  active_resolution: "1k",
  style_recommendations: [],
  layout_recommendations: [],
  dirty_copy: false,
  dirty_style_selection: false,
  dirty_layout_selection: false,

  // 手动编辑 → dirty = true
  setCopyRaw: (text) => set({ copy_raw: text, dirty_copy: true }),
  setActiveStyle: (style) => set({ active_style: style, dirty_style_selection: true }),
  setActiveLayout: (layout) => set({ active_layout: layout, dirty_layout_selection: true }),
  setActiveRatio: (ratio) => set({ active_ratio: ratio }),
  setActiveResolution: (res) => set({ active_resolution: res }),
  setStyleRecommendations: (recs) => set({ style_recommendations: recs }),
  setLayoutRecommendations: (recs) => set({ layout_recommendations: recs }),
  clearActiveStyle: () => set({ active_style: null, dirty_style_selection: false }),
  clearActiveLayout: () => set({ active_layout: null, dirty_layout_selection: false }),

  // 接受推荐 → dirty = false
  applyStyleRecommendation: (index) =>
    set((s) => ({
      active_style: s.style_recommendations[index] ?? s.active_style,
      dirty_style_selection: false,
    })),
  applyLayoutRecommendation: (index) =>
    set((s) => ({
      active_layout: s.layout_recommendations[index] ?? s.active_layout,
      dirty_layout_selection: false,
    })),

  // AI 新推荐到达：不改 dirty 字段；推荐列表永远更新
  ingestFromDesignJson: (json) =>
    set((s) => ({
      copy_raw:       s.dirty_copy            ? s.copy_raw    : json.copy.raw,
      copy_segments:  s.dirty_copy            ? s.copy_segments: json.copy.segments,
      visual_description_en: json.visual.description_en,   // 不受 dirty 控制
      layout_description:    json.layout.description,       // 不受 dirty 控制
      active_style:   s.dirty_style_selection ? s.active_style  : (json.recommendations.styles[0] ?? null),
      active_layout:  s.dirty_layout_selection? s.active_layout : (json.recommendations.layouts[0] ?? null),
      // 推荐列表永远更新（供 Panel 展示所有推荐选项）
      style_recommendations:  json.recommendations.styles,
      layout_recommendations: json.recommendations.layouts,
    })),

  // 新 clarifying 轮次 → 重置脏标记（之前编辑语境已失效）
  resetAllDirty: () =>
    set({ dirty_copy: false, dirty_style_selection: false, dirty_layout_selection: false }),

  // 老会话兜底
  initFromLegacy: (opts) =>
    set((s) => ({
      copy_raw:              opts.copy ?? s.copy_raw,
      style_recommendations: opts.styleRecs ?? s.style_recommendations,
      layout_recommendations:opts.layoutRecs ?? s.layout_recommendations,
      active_ratio:          opts.ratio ?? s.active_ratio,
      active_resolution:     opts.resolution ?? s.active_resolution,
    })),
}));
