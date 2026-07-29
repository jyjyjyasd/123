export interface PresetLayoutTag {
  id: string;
  name: string;        // 标签显示名称
  description: string; // 界面特征短描述
  prompt: string;      // 预置排版提示词
}

export const PRESET_LAYOUT_TAGS: PresetLayoutTag[] = [
  {
    id: "minimal-magazine",
    name: "极简杂志流",
    description: "大字压角，大量留白，高级质感",
    prompt: "使用极简杂志风排版，标题采用高对比度粗体压角布局，正文网格对齐，画面保持50%以上留白，营造高级质感。"
  },
  {
    id: "split-diagonal",
    name: "对角线双栏",
    description: "文左下图右上，动态斜线视觉延伸",
    prompt: "采用对角线分割构图，主体图置于右上区域，文本主次分明排列于左下，线条感强，视觉引导流畅。"
  },
  {
    id: "centered-card",
    name: "居中卡片式",
    description: "核心信息悬浮卡片居中，层次分明",
    prompt: "采用中心悬浮卡片排版，核心文案与图标居中对齐，背景使用虚化衬托，层次分明，信息聚焦。"
  },
  {
    id: "surrounding-frame",
    name: "环绕相框构图",
    description: "四角与边缘包裹文案，中央突出产品",
    prompt: "采用边框环绕构图，主标题与辅助信息分布在四周边缘形成相框效果，中央留出核心视觉展示区。"
  },
  {
    id: "bold-typography",
    name: "大字号巨幅冲撞",
    description: "巨型文字底纹与主体物穿插重叠",
    prompt: "使用巨型文字排版作为底纹，与主体物形成前后穿插重叠层级，展现强烈的现代视觉冲击力。"
  },
  {
    id: "ecommerce-banner",
    name: "电商黄金三段",
    description: "主标题 + 卖点标签 + CTA行动按钮",
    prompt: "采用标准电商Banner构图，从上至下清晰划分为主标题区、核心卖点标签区及底部行动点(CTA)区，比例和谐。"
  }
];
