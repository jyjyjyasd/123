import { useState, useEffect, useRef } from "react";
import {
  extractLayoutRecommendations,
  extractStyleRecommendations,
  parseSectionedMessage,
  cleanIntroText,
} from "../section-parser";
import type { AgentSession, ClarifyMessage } from "../types";

interface ChatBubbleProps {
  message: ClarifyMessage;
  isStreaming?: boolean;
  streamingText?: string;
  onSelectStyle?: (index: number, name: string) => void;
  onSelectLayout?: (index: number, name: string) => void;
  session?: AgentSession | null;
  updateParams?: (params: any) => Promise<void>;
  selectedStyleIndex?: number | null;
  selectedLayoutIndex?: number | null;
  onRefreshStyles?: () => void;
  isRefreshingStyles?: boolean;
  hideSections?: boolean;
}

const SECTION_STYLE: Record<string, { label: string; accent: string; bg: string }> = {
  visual: { label: "主视觉风格", accent: "#487ca5", bg: "rgba(72,124,165,0.06)" },
  poster_text: { label: "印刷文案信息", accent: "#82629b", bg: "rgba(130,98,155,0.06)" },
  layout_plan: { label: "排版设计规划", accent: "#9a713b", bg: "rgba(154,113,59,0.06)" },
  specs: { label: "尺寸与清晰度", accent: "#4f8277", bg: "rgba(79,130,119,0.06)" },
  missing: { label: "AI 建议", accent: "#787774", bg: "rgba(120,119,116,0.06)" },
};

function splitLabelAndValue(line: string): { label: string; value: string } | null {
  const match = line.match(/^([^:：]+)[:：]\s*([\s\S]*)$/);
  if (!match) return null;
  const label = match[1].trim();
  if (label.length > 8 || label.includes("|") || label.includes("｜")) {
    return null;
  }
  return { label, value: match[2].trim() };
}

function splitPipeSegments(text: string): string[] {
  return text
    .split(/\s*[|｜]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 自动伸展 textarea 高度 */
function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function getEffectiveLines(rawLines: string[], copyText?: string | null): string[] {
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

function PosterTextRows({
  lines,
  accent,
  bg,
  updateParams,
  copyText,
}: {
  lines: string[];
  accent: string;
  bg: string;
  updateParams?: (params: any) => Promise<void>;
  copyText?: string | null;
}) {
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

function LayoutPlanRows({
  lines,
}: {
  lines: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lines.map((line, idx) => {
        const lastPipeIdx = Math.max(line.lastIndexOf('|'), line.lastIndexOf('｜'));
        let headlineRaw = line;
        let detailText = "";
        if (lastPipeIdx !== -1) {
          headlineRaw = line.slice(0, lastPipeIdx).trim();
          detailText = line.slice(lastPipeIdx + 1).trim();
        }
        const parsedHeadline = splitLabelAndValue(headlineRaw);
        const title = parsedHeadline?.label ?? headlineRaw ?? `规划 ${idx + 1}`;
        const summary = parsedHeadline?.value ?? "";
        const detailSegments = [
          ...(summary ? [summary] : []),
          ...(detailText ? [detailText] : [])
        ].filter(Boolean);

        return (
          <div
            key={`${title}-${idx}`}
            style={{
              border: "1px solid rgba(55,53,47,0.08)",
              borderRadius: 10,
              background: "#fff",
              padding: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: detailSegments.length > 0 ? 10 : 0,
              }}
            >
              <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#37352f", lineHeight: "1.5" }}>
                {title}
              </div>
            </div>

            {detailSegments.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {detailSegments.map((detail, detailIdx) => (
                  <div
                    key={`${title}-detail-${detailIdx}`}
                    style={{
                      minWidth: 0,
                      borderRadius: 8,
                      background: "rgba(55,53,47,0.03)",
                      padding: "8px 10px",
                      fontSize: 12,
                      lineHeight: "1.65",
                      color: "#4a4a47",
                    }}
                  >
                    {detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionBlock({
  sectionKey,
  lines,
  onSelectStyle,
  onSelectLayout,
  session,
  updateParams,
  selectedStyleIndex,
  selectedLayoutIndex,
  onRefreshStyles,
  isRefreshingStyles,
}: {
  sectionKey: string;
  lines: string[];
  onSelectStyle?: (index: number, name: string) => void;
  onSelectLayout?: (index: number, name: string) => void;
  session?: AgentSession | null;
  updateParams?: (params: any) => Promise<void>;
  selectedStyleIndex?: number | null;
  selectedLayoutIndex?: number | null;
  onRefreshStyles?: () => void;
  isRefreshingStyles?: boolean;
}) {
  const style = SECTION_STYLE[sectionKey] ?? SECTION_STYLE.missing;

  const isFullPrompt = (val: string) => {
    if (!val) return false;
    return val.length > 30 && !/[\u4e00-\u9fa5]/.test(val);
  };

  const resolveFriendlyStyleName = (val: string) => {
    if (!val) return "";
    if (!isFullPrompt(val)) return val;

    if (session?.stream_b?.style_recommendations) {
      for (const rec of session.stream_b.style_recommendations) {
        if (rec.visual_description && val.toLowerCase().includes(rec.visual_description.toLowerCase().trim())) {
          return rec.name;
        }
        if (rec.name_en && val.toLowerCase().includes(rec.name_en.toLowerCase().trim())) {
          return rec.name;
        }
      }
    }

    const recs = extractStyleRecommendations(lines);
    for (const rec of recs) {
      if (rec.description && val.toLowerCase().includes(rec.description.toLowerCase().trim())) {
        return rec.name;
      }
      if (rec.nameEn && val.toLowerCase().includes(rec.nameEn.toLowerCase().trim())) {
        return rec.name;
      }
    }

    return "";
  };

  // 提取已知风格文本并维护本地编辑状态
  const isVisual = sectionKey === "visual";
  const knownLine = isVisual ? lines.find(l => {
    const p = splitLabelAndValue(l);
    return p && p.label === "已知";
  }) : null;
  const parsedKnown = knownLine ? splitLabelAndValue(knownLine) : null;
  const rawKnownValue = (parsedKnown?.value ?? "").replace(/^最终采用\s*/, "").trim();
  const friendlyKnownValue = resolveFriendlyStyleName(rawKnownValue);
  const isKnownNoStyle = ["not-provided", "not provided", "未提供", "暂无", "无"].includes(friendlyKnownValue.trim().toLowerCase()) || !friendlyKnownValue;
  const initialKnownValue = isKnownNoStyle ? "" : friendlyKnownValue;

  const [localKnownText, setLocalKnownText] = useState(initialKnownValue);

  useEffect(() => {
    setLocalKnownText(initialKnownValue);
  }, [initialKnownValue]);

  if (sectionKey === "specs") {
    const activeRatio = session?.aspect_ratio ?? "1:1";
    const activeRes = session?.resolution ?? "1k";

    return (
      <div
        style={{
          border: "1px solid rgba(55,53,47,0.09)",
          borderLeft: `3px solid ${style.accent}`,
          background: "transparent",
          borderRadius: 6,
          padding: "12px",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: style.accent,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {style.label}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>尺寸</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"] as const).map((r) => {
                const isActive = activeRatio === r;
                const labels: Record<string, string> = {
                  "1:1": "方图 1:1",
                  "4:3": "横向 PPT 4:3",
                  "3:4": "小红书 3:4",
                  "16:9": "宽屏 16:9",
                  "9:16": "海报 9:16",
                  "3:2": "摄影 3:2",
                  "2:3": "杂志 2:3",
                };
                return (
                  <button
                    key={r}
                    onClick={() => updateParams?.({ aspect_ratio: r })}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1px solid",
                      borderColor: isActive ? style.accent : "rgba(55,53,47,0.12)",
                      background: isActive ? style.accent : "#fff",
                      color: isActive ? "#fff" : "#37352f",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {labels[r] || r}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>清晰度</div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["1k", "2k", "4k"] as const).map((res) => {
                const isActive = activeRes === res;
                return (
                  <button
                    key={res}
                    onClick={() => updateParams?.({ resolution: res })}
                    style={{
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1px solid",
                      borderColor: isActive ? style.accent : "rgba(55,53,47,0.12)",
                      background: isActive ? style.accent : "#fff",
                      color: isActive ? "#fff" : "#37352f",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {res.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const styleRecs = extractStyleRecommendations(lines);
  const layoutRecs = extractLayoutRecommendations(lines);
  let normalLines = lines.filter(
    (line) => !/^\s*🎨\s*风格推荐\s*[:：]/.test(line) && !/^\s*📐\s*排版推荐\s*[:：]/.test(line)
  );
  if (sectionKey === "poster_text" && normalLines.length > 1 && (normalLines[0] === "真实文案：" || normalLines[0] === "真实文案:")) {
    normalLines = normalLines.slice(1);
  }

  const showStructuredPosterText = sectionKey === "poster_text" && normalLines.length > 0;
  const showStructuredLayoutPlan = sectionKey === "layout_plan" && normalLines.length > 0;
  const showDefaultLines = !showStructuredPosterText && !showStructuredLayoutPlan;

  return (
    <div
      style={{
        border: "1px solid rgba(55,53,47,0.09)",
        borderLeft: `3px solid ${style.accent}`,
        background: "transparent",
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: style.accent,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {style.label}
        </div>
        {sectionKey === "visual" && onRefreshStyles && (
          <button
            onClick={onRefreshStyles}
            disabled={isRefreshingStyles}
            style={{
              fontSize: 11,
              color: style.accent,
              background: "transparent",
              border: "none",
              cursor: isRefreshingStyles ? "not-allowed" : "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 6px",
              borderRadius: 4,
              transition: "background 0.15s",
              opacity: isRefreshingStyles ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isRefreshingStyles) e.currentTarget.style.background = style.bg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {isRefreshingStyles ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    border: `1.5px solid ${style.accent}`,
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                刷新中...
              </>
            ) : (
              <>🔄 刷新风格</>
            )}
          </button>
        )}
      </div>

      {showStructuredPosterText && (
        <PosterTextRows
          lines={normalLines}
          accent={style.accent}
          bg={style.bg}
          updateParams={updateParams}
          copyText={session?.stream_a?.copy}
        />
      )}

      {showStructuredLayoutPlan && (
        <LayoutPlanRows lines={normalLines} />
      )}

      {showDefaultLines &&
        normalLines.map((line, idx) => {
          const parsed = splitLabelAndValue(line);
          if (parsed) {
            const isVisualKnown = sectionKey === "visual" && parsed.label === "已知";
            if (isVisualKnown) {
              const hasStyleRef = !!session?.stream_b?.style_reference_image;
              return (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ fontWeight: 600, color: "#37352f", fontSize: 13, marginTop: 2 }}>已知：</span>
                    <textarea
                      key={hasStyleRef ? "ref" : localKnownText}
                      defaultValue={hasStyleRef ? "风格参考图" : localKnownText}
                      placeholder="未提供风格描述，可在此自主填写..."
                      disabled={hasStyleRef || !updateParams}
                      onChange={(e) => {
                        setLocalKnownText(e.target.value);
                        autoResizeTextarea(e.target);
                        const v = e.target.value.trim().toLowerCase();
                        const isNoVal = ["not-provided", "not provided", "未提供", "暂无", "无"].includes(v);
                        e.target.style.color = isNoVal ? "#8e8e8e" : "#4a4a47";
                      }}
                      onBlur={async (e) => {
                        const newVal = e.target.value.trim();
                        if (hasStyleRef || !updateParams) return;
                        if (newVal === initialKnownValue.trim() || !newVal) return;
                        await updateParams({
                          stream_b: { visual_description: newVal }
                        });
                      }}
                      rows={1}
                      ref={(el) => {
                        autoResizeTextarea(el);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        lineHeight: "1.6",
                        color: (hasStyleRef || ["not-provided", "not provided", "未提供", "暂无", "无"].includes((hasStyleRef ? "风格参考图" : localKnownText).trim().toLowerCase())) ? "#8e8e8e" : "#4a4a47",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        resize: "none",
                        padding: 0,
                        margin: 0,
                        fontFamily: "inherit",
                        borderBottom: "1px dashed rgba(55,53,47,0.2)",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = style.accent;
                      }}
                      onBlurCapture={(e) => {
                        e.currentTarget.style.borderBottomColor = "rgba(55,53,47,0.2)";
                      }}
                    />
                  </div>
                </div>
              );
            }
            const isValNoStyle = ["not-provided", "not provided", "未提供", "暂无", "无"].includes(parsed.value.trim().toLowerCase());
            return (
              <div key={idx} style={{ fontSize: 13, lineHeight: "1.6", color: "#37352f", marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: "#37352f" }}>{parsed.label}：</span>
                <span style={{ color: isValNoStyle ? "#8e8e8e" : "#4a4a47" }}>{parsed.value}</span>
              </div>
            );
          }
          return (
            <div key={idx} style={{ fontSize: 13, lineHeight: "1.6", color: "#4a4a47", marginBottom: 2 }}>
              {line}
            </div>
          );
        })}

      {sectionKey === "visual" && isRefreshingStyles ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                background: "rgba(55,53,47,0.01)",
                border: "1px solid rgba(55,53,47,0.06)",
                borderRadius: 6,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(55,53,47,0.08)", marginTop: 2 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ width: "40%", height: 12, background: "rgba(55,53,47,0.08)", borderRadius: 3 }} />
                <div style={{ width: "80%", height: 10, background: "rgba(55,53,47,0.05)", borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        styleRecs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {styleRecs.map((rec) => {
              const isSelected = selectedStyleIndex === rec.index;
              return (
                <button
                  key={rec.index}
                  onClick={() => onSelectStyle?.(rec.index, rec.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px",
                    background: isSelected ? style.bg : "#fff",
                    border: isSelected ? `2px solid ${style.accent}` : "1px solid rgba(55,53,47,0.12)",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = style.accent;
                    e.currentTarget.style.background = style.bg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "rgba(55,53,47,0.12)";
                      e.currentTarget.style.background = "#fff";
                    }
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: style.accent }}>
                    {isSelected ? "✓" : `${rec.index}.`}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f" }}>
                      {rec.name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {layoutRecs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {layoutRecs.map((rec) => {
            const isSelected = selectedLayoutIndex === rec.index;
            return (
              <button
                key={rec.index}
                onClick={() => onSelectLayout?.(rec.index, rec.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  background: isSelected ? style.bg : "#fff",
                  border: isSelected ? `2px solid ${style.accent}` : "1px solid rgba(55,53,47,0.12)",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = style.accent;
                  e.currentTarget.style.background = style.bg;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(55,53,47,0.12)";
                    e.currentTarget.style.background = "#fff";
                  }
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: style.accent }}>
                  {isSelected ? "✓" : `${rec.index}.`}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f" }}>{rec.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatBubble({
  message,
  isStreaming = false,
  streamingText = "",
  onSelectStyle,
  onSelectLayout,
  session,
  updateParams,
  selectedStyleIndex,
  selectedLayoutIndex,
  onRefreshStyles,
  isRefreshingStyles,
  hideSections = false,
}: ChatBubbleProps) {
  const isUser = message.role === "user";
  const content = isStreaming ? streamingText : message.content;

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div
          style={{
            maxWidth: "80%",
            background: "#ffffff",
            color: "#37352f",
            borderRadius: "12px 12px 2px 12px",
            padding: "10px 14px",
            border: "1px solid rgba(55,53,47,0.08)",
            boxShadow: "0 8px 20px rgba(55,53,47,0.04)",
            fontSize: 14,
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  const { intro, sections } = parseSectionedMessage(content);
  const cleanIntro = cleanIntroText(intro);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid #37352f",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "#37352f",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          AI
        </div>
        <span style={{ fontSize: 11, color: "#9b9a97" }}>AI 设计助理</span>
        {isStreaming && (
          <span style={{ fontSize: 11, color: "#37352f" }}>
            <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span> 思考中…
          </span>
        )}
      </div>

      <div style={{ paddingLeft: 30 }}>
        {cleanIntro && (
          <p
            style={{
              fontSize: 14,
              lineHeight: "1.7",
              color: "#4a4a47",
              margin: "0 0 12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {cleanIntro}
          </p>
        )}

        {!hideSections && sections.map((section, idx) => (
          <SectionBlock
            key={`${section.key}-${idx}`}
            sectionKey={section.key}
            lines={section.lines}
            onSelectStyle={onSelectStyle}
            onSelectLayout={onSelectLayout}
            session={session}
            updateParams={updateParams}
            selectedStyleIndex={selectedStyleIndex}
            selectedLayoutIndex={selectedLayoutIndex}
            onRefreshStyles={onRefreshStyles}
            isRefreshingStyles={isRefreshingStyles}
          />
        ))}

        {isStreaming && sections.length === 0 && !cleanIntro && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#9b9a97", fontSize: 13 }}>
            <span
              className="animate-spin"
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                border: "2px solid #9b9a97",
                borderTopColor: "#487ca5",
                borderRadius: "50%",
              }}
            />
            AI 正在分析需求…
          </div>
        )}
      </div>
    </div>
  );
}
