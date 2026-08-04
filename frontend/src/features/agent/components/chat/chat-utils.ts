export function splitLabelAndValue(line: string): { label: string; value: string } | null {
  const match = line.match(/^([^:：]+)[:：]\s*([\s\S]*)$/);
  if (!match) return null;
  const label = match[1].trim();
  if (label.length > 8 || label.includes("|") || label.includes("｜")) {
    return null;
  }
  return { label, value: match[2].trim() };
}

export function splitPipeSegments(text: string): string[] {
  return text
    .split(/\s*[|｜]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 自动伸展 textarea 高度 */
export function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

export function getEffectiveLines(rawLines: string[], copyText?: string | null): string[] {
  if (!copyText) return rawLines;
  const copySegments = splitPipeSegments(copyText);
  let segmentIdx = 0;

  if (rawLines.length === 0) {
    return [copySegments.join(" | ")];
  }

  return rawLines.map((line, idx) => {
    const isLastLine = idx === rawLines.length - 1;
    const parsed = splitLabelAndValue(line);
    if (parsed) {
      const lineSegments = splitPipeSegments(parsed.value);
      const updatedLineSegments = lineSegments.map(() => {
        const val = copySegments[segmentIdx] ?? "";
        segmentIdx++;
        return val;
      });
      if (isLastLine && segmentIdx < copySegments.length) {
        updatedLineSegments.push(...copySegments.slice(segmentIdx));
        segmentIdx = copySegments.length;
      }
      return `${parsed.label}：${updatedLineSegments.join(" | ")}`;
    } else {
      const lineSegments = splitPipeSegments(line);
      const updatedLineSegments = lineSegments.map(() => {
        const val = copySegments[segmentIdx] ?? "";
        segmentIdx++;
        return val;
      });
      if (isLastLine && segmentIdx < copySegments.length) {
        updatedLineSegments.push(...copySegments.slice(segmentIdx));
        segmentIdx = copySegments.length;
      }
      return updatedLineSegments.join(" | ");
    }
  });
}
