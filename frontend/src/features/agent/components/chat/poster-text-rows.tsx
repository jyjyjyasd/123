import { useEffect, useRef, useState } from "react";
import {
  autoResizeTextarea,
  getEffectiveLines,
  splitLabelAndValue,
  splitPipeSegments,
} from "./chat-utils";

export interface PosterTextRowsProps {
  lines: string[];
  accent: string;
  bg: string;
  updateParams?: (params: Record<string, unknown>) => Promise<void>;
  copyText?: string | null;
}

export function PosterTextRows({
  lines,
  accent,
  bg,
  updateParams,
  copyText,
}: PosterTextRowsProps) {
  const effectiveLines = getEffectiveLines(lines, copyText);
  const [editedLines, setEditedLines] = useState<string[]>(effectiveLines);
  const isSavingRef = useRef(false);

  const linesJoined = lines.join("\n");
  useEffect(() => {
    if (isSavingRef.current) return;
    setEditedLines(effectiveLines);
  }, [linesJoined, copyText]);

  const handleSegmentChange = (lineIdx: number, segmentIdx: number, newValue: string) => {
    const nextLines = [...editedLines];
    const line = nextLines[lineIdx];
    const parsed = splitLabelAndValue(line);
    if (parsed) {
      const segments = splitPipeSegments(parsed.value);
      segments[segmentIdx] = newValue;
      nextLines[lineIdx] = `${parsed.label}：${segments.join(" | ")}`;
    } else {
      const segments = splitPipeSegments(line);
      segments[segmentIdx] = newValue;
      nextLines[lineIdx] = segments.join(" | ");
    }
    setEditedLines(nextLines);
  };

  const handleSave = async () => {
    if (!updateParams) return;
    const allSegments: string[] = [];
    editedLines.forEach((line) => {
      const parsed = splitLabelAndValue(line);
      const segments = splitPipeSegments(parsed?.value ?? line);
      allSegments.push(...segments);
    });

    isSavingRef.current = true;
    try {
      await updateParams({
        stream_a: {
          copy: allSegments.join(" | "),
        },
      });
    } finally {
      isSavingRef.current = false;
    }
  };

  const isChanged = JSON.stringify(editedLines) !== JSON.stringify(effectiveLines);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {editedLines.map((line, idx) => {
        const parsed = splitLabelAndValue(line);
        const label = parsed?.label ?? `文案 ${idx + 1}`;
        let segments = splitPipeSegments(parsed?.value ?? line);
        if (segments.length === 0) {
          segments = [""];
        }

        return (
          <div
            key={`${label}-${idx}`}
            style={{
              border: "1px solid rgba(55,53,47,0.08)",
              borderRadius: 10,
              background: "#fff",
              overflow: "hidden",
            }}
          >
            {label !== "真实文案" && !label.startsWith("文案") && (
              <div
                style={{
                  padding: "9px 12px",
                  borderBottom: "1px solid rgba(55,53,47,0.06)",
                  background: bg,
                  color: accent,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                padding: 12,
              }}
            >
              {segments.map((segment, segmentIdx) => (
                <textarea
                  key={`${label}-${segmentIdx}`}
                  rows={1}
                  value={segment}
                  onChange={(e) => {
                    handleSegmentChange(idx, segmentIdx, e.target.value);
                    autoResizeTextarea(e.target);
                  }}
                  placeholder="请输入文案..."
                  ref={(el) => autoResizeTextarea(el)}
                  style={{
                    minWidth: 0,
                    borderRadius: 8,
                    background: "rgba(55,53,47,0.03)",
                    border: "1px solid rgba(55,53,47,0.08)",
                    padding: "8px 10px",
                    fontSize: 13,
                    lineHeight: "1.6",
                    color: "#37352f",
                    outline: "none",
                    transition: "all 0.15s",
                    resize: "none",
                    overflow: "hidden",
                    display: "block",
                    width: "100%",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = accent;
                    e.currentTarget.style.background = "#fff";
                    autoResizeTextarea(e.currentTarget);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(55,53,47,0.08)";
                    e.currentTarget.style.background = "rgba(55,53,47,0.03)";
                    handleSave();
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {isChanged && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={() => setEditedLines(lines)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid rgba(55,53,47,0.12)",
              background: "#fff",
              color: "#787774",
              cursor: "pointer",
              fontWeight: 500,
              transition: "background 0.12s",
            }}
          >
            重置
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 6,
              border: "none",
              background: accent,
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            确认修改
          </button>
        </div>
      )}
    </div>
  );
}
