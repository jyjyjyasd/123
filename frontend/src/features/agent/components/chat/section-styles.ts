export interface SectionStyle {
  label: string;
  accent: string;
  bg: string;
}

export const SECTION_STYLE: Record<string, SectionStyle> = {
  visual: { label: "主视觉风格", accent: "#487ca5", bg: "rgba(72,124,165,0.06)" },
  poster_text: { label: "印刷文案信息", accent: "#82629b", bg: "rgba(130,98,155,0.06)" },
  layout_plan: { label: "排版设计规划", accent: "#9a713b", bg: "rgba(154,113,59,0.06)" },
  specs: { label: "尺寸与清晰度", accent: "#4f8277", bg: "rgba(79,130,119,0.06)" },
  missing: { label: "AI 建议", accent: "#787774", bg: "rgba(120,119,116,0.06)" },
};
