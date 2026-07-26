// features/agent/section-parser.ts
// 移植自 prd page.tsx parseSectionedMessage + stripJsonBlock
// 将 LLM 的 [[SECTION:xxx]]...[[/SECTION]] 结构解析为前端可渲染的数据

export interface MessageSection {
  key: string;
  title: string;
  lines: string[];
}

export interface ParsedMessage {
  intro: string;
  sections: MessageSection[];
}

// 区段配置（与 prd sectionConfig 对应）
const SECTION_CONFIG: Record<string, { title: string }> = {
  visual: { title: "主视觉风格" },
  poster_text: { title: "印刷文案信息" },
  layout_plan: { title: "排版设计规划" },
  specs: { title: "尺寸与清晰度" },
  missing: { title: "AI 建议" },
};

/**
 * 去除 [JSON_START]...[JSON_END] 结构化块（不应显示给用户）。
 */
export function stripJsonBlock(content: string): string {
  return content.replace(/\[JSON_START\][\s\S]*?\[JSON_END\]/g, "").trim();
}

/**
 * 解析 [[SECTION:xxx]]...[[/SECTION]] 结构。
 * 移植自 prd parseSectionedMessage。
 */
export function parseSectionedMessage(content: string): ParsedMessage {
  const sectionRegex = /\[\[SECTION:([a-z_]+)\]\]([\s\S]*?)\[\[\/SECTION\]\]/g;
  const sections: MessageSection[] = [];
  let firstSectionIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(content)) !== null) {
    if (firstSectionIndex === -1) firstSectionIndex = match.index;
    const key = match[1];
    const config = SECTION_CONFIG[key];
    sections.push({
      key,
      title: config?.title ?? key,
      lines: match[2]
        .split("\n")
        .map((line) => line.trim().replace(/^[-*]\s*/, "").replace(/<br\s*\/?>/g, "\n"))
        .filter(Boolean),
    });
  }

  if (sections.length === 0) {
    return { intro: stripJsonBlock(content), sections: [] };
  }

  return {
    intro: content.slice(0, Math.max(firstSectionIndex, 0)).trim(),
    sections,
  };
}

/**
 * 从 sections 中提取风格推荐（🎨 前缀行）。
 * 移植自 prd parseStyleRecommendations。
 */
export function extractStyleRecommendations(
  lines: string[]
): Array<{ index: number; name: string; nameEn: string; description: string }> {
  return lines
    .filter((l) => /^\s*🎨\s*风格推荐\s*[:：]/.test(l))
    .map((l) => {
      const match = l.match(/^\s*🎨\s*风格推荐\s*[:：]\s*(\d+)\.\s*(.+?)\s*\((.+?)\)\s*\/\s*(.+)/);
      if (!match) return null;
      return {
        index: parseInt(match[1], 10),
        name: match[2].trim(),
        nameEn: match[3].trim(),
        description: match[4].trim(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 从 sections 中提取排版推荐（📐 前缀行）。
 * 移植自 prd parseLayoutRecommendations。
 */
export function extractLayoutRecommendations(
  lines: string[]
): Array<{ index: number; name: string; description: string }> {
  return lines
    .filter((l) => /^\s*📐\s*排版推荐\s*[:：]/.test(l))
    .map((l) => {
      const match = l.match(/^\s*📐\s*排版推荐\s*[:：]\s*(\d+)\.\s*(.+?)\s*\/\s*(.+)/);
      if (!match) return null;
      return {
        index: parseInt(match[1], 10),
        name: match[2].trim(),
        description: match[3].trim(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
