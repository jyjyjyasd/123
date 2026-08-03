// features/agent/panels/CopyEditor.tsx
// 文案编辑区：多段编辑、密度选择、AI 刷新
// 从 AgentWorkspace.tsx Stage 1 Card 的 section 1 提取
// 内部同时更新 DesignStore（setCopyRaw → dirty_copy）和 formData（通过 onCopyChange 回调）

import { useState } from "react";
import { RotateCw, RotateCcw, Trash2 } from "lucide-react";
import { useDesignStore } from "../design-store";
import { splitLabelAndValue, splitPipeSegments, autoResizeTextarea, getEffectiveLines } from "../copy-utils";
import type { MessageSection } from "../section-parser";

type Density = "疏" | "中" | "密";

interface CopyEditorProps {
  copyRaw: string;
  textSection: MessageSection | undefined;
  isStreaming: boolean;
  isGenerating: boolean;
  /** 文案刷新回调：传入密度和当前文案，返回刷新后的文案 */
  onRefreshCopy?: (density: string, currentCopy: string) => Promise<string>;
  onCopyChange: (copy: string) => void;
  onUpdateParams: (params: any) => Promise<void>;
}

export function CopyEditor({
  copyRaw,
  textSection,
  isStreaming,
  isGenerating,
  onRefreshCopy,
  onCopyChange,
  onUpdateParams,
}: CopyEditorProps) {
  const [selectedDensity, setSelectedDensity] = useState<Density>("中");
  const [isRefreshingCopy, setIsRefreshingCopy] = useState(false);
  
  
  const [copyHistory] = useState<Record<number, string>>({});
  const [pendingExtraCopyFields, setPendingExtraCopyFields] = useState<string[]>([]);

  const handleRefreshCopy = async () => {
    if (!onRefreshCopy) return;
    setIsRefreshingCopy(true);
    try {
      const refreshed = await onRefreshCopy(selectedDensity, copyRaw);
      if (refreshed) {
        updateCopy(refreshed);
        onUpdateParams({ stream_a: { copy: refreshed } });
      }
    } finally {
      setIsRefreshingCopy(false);
    }
  };

  const handleUndoCopy = (globalSegIdx: number, lineIdx: number, segmentIdx: number) => {
    if (copyHistory[globalSegIdx]) {
      const allLines = copyRaw.split(" | ");
      if (allLines[lineIdx]) {
        const segs = allLines[lineIdx].split("/");
        if (segs[segmentIdx]) {
          segs[segmentIdx] = copyHistory[globalSegIdx];
          allLines[lineIdx] = segs.join("/");
          const newCopy = allLines.join(" | ");
          updateCopy(newCopy);
        }
      }
    }
  };
  // 同步更新 DesignStore（dirty_copy = true）和 formData（保持兼容）
  const updateCopy = (newCopy: string) => {
    useDesignStore.getState().setCopyRaw(newCopy);
    onCopyChange(newCopy);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          海报印刷文案
        </div>
        {/* Notion 风格胶囊段落选择器 & 刷新按钮 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Segmented capsule track */}
          <div
            style={{
              display: "flex",
              background: "rgba(55, 53, 47, 0.06)",
              padding: 2,
              borderRadius: 9999,
              alignItems: "center",
            }}
          >
            {(["疏", "中", "密"] as const).map((d) => {
              const isSelected = selectedDensity === d;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDensity(d)}
                  style={{
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? "#37352f" : "#6b6a67",
                    background: isSelected ? "#ffffff" : "transparent",
                    borderRadius: 9999,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: isSelected ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
                    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                    outline: "none",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {/* 刷新按钮 */}
          <button
            onClick={handleRefreshCopy}
            disabled={isRefreshingCopy || isStreaming || isGenerating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: isRefreshingCopy ? "#9b9a97" : "#37352f",
              background: "#ffffff",
              border: "1px solid rgba(55, 53, 47, 0.15)",
              borderRadius: 9999,
              cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              transition: "all 0.15s ease",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!isRefreshingCopy && !isStreaming && !isGenerating) {
                e.currentTarget.style.background = "rgba(55, 53, 47, 0.04)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isRefreshingCopy && !isStreaming && !isGenerating) {
                e.currentTarget.style.background = "#ffffff";
              }
            }}
          >
            <RotateCw
              size={12}
              style={{
                animation: isRefreshingCopy ? "spin 1s linear infinite" : "none",
                transition: "transform 0.15s ease",
              }}
            />
            文案刷新
          </button>
        </div>
      </div>
      {(() => {
        let rawCopyLines = textSection
          ? textSection.lines.filter((line) => !/^\s*🎨\s*风格推荐\s*[:：]/.test(line) && !/^\s*📐\s*排版推荐\s*[:：]/.test(line))
          : ["真实文案："];
        if (rawCopyLines.length > 1 && (rawCopyLines[0] === "真实文案：" || rawCopyLines[0] === "真实文案:")) {
          rawCopyLines = rawCopyLines.slice(1);
        }
        const effectiveLines = getEffectiveLines(rawCopyLines, copyRaw);
        const handleSegmentChange = (lineIdx: number, segmentIdx: number, newValue: string) => {
          const nextLines = [...effectiveLines];
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
          const allSegments: string[] = [];
          nextLines.forEach((l) => {
            const p = splitLabelAndValue(l);
            const segments = splitPipeSegments(p?.value ?? l);
            allSegments.push(...segments);
          });
          updateCopy(allSegments.join(" | "));
        };
        const handleBlur = () => {
          
          onUpdateParams({
            stream_a: {
              copy: copyRaw,
            },
          });
        };
        const handleRemoveSegment = (lineIdx: number, segmentIdx: number) => {
          const nextLines = [...effectiveLines];
          const line = nextLines[lineIdx];
          const parsed = splitLabelAndValue(line);
          let currentSegments: string[] = [];
          if (parsed) {
            currentSegments = splitPipeSegments(parsed.value);
          } else {
            currentSegments = splitPipeSegments(line);
          }
          // 移除该项
          currentSegments = currentSegments.filter((_, idx) => idx !== segmentIdx);
          // 如果这一行的切片被删空了，将这一行整体从行列表中剔除
          if (currentSegments.length === 0) {
            nextLines.splice(lineIdx, 1);
          } else {
            if (parsed) {
              nextLines[lineIdx] = `${parsed.label}：${currentSegments.join(" | ")}`;
            } else {
              nextLines[lineIdx] = currentSegments.join(" | ");
            }
          }
          const allSegments: string[] = [];
          nextLines.forEach((l) => {
            const p = splitLabelAndValue(l);
            const segments = splitPipeSegments(p?.value ?? l);
            allSegments.push(...segments);
          });
          const newCopyStr = allSegments.join(" | ");
          updateCopy(newCopyStr);
          onUpdateParams({
            stream_a: {
              copy: newCopyStr,
            },
          });
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isRefreshingCopy ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      background: "rgba(55,53,47,0.01)",
                      border: "1px solid rgba(55,53,47,0.06)",
                      borderRadius: 6,
                      height: 38,
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  >
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ width: i % 2 === 0 ? "30%" : "50%", height: 12, background: "rgba(55,53,47,0.08)", borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              (() => {
                let segmentCounter = 0;
                return effectiveLines.map((line, idx) => {
                  const parsed = splitLabelAndValue(line);
                  const label = parsed?.label ?? `文案 ${idx + 1}`;
                  let segments = splitPipeSegments(parsed?.value ?? line);
                  if (segments.length === 0) {
                    segments = [""];
                  }
                  return (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid rgba(55,53,47,0.06)",
                        borderRadius: 8,
                        background: "#fff",
                        overflow: "hidden",
                      }}
                    >
                      {label !== "真实文案" && !label.startsWith("文案") && (
                        <div
                          style={{
                            padding: "6px 10px",
                            borderBottom: "1px solid rgba(55,53,47,0.04)",
                            background: "rgba(55,53,47,0.04)",
                            color: "#37352f",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {label}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          padding: 10,
                        }}
                      >
                        {segments.map((segment, segmentIdx) => {
                          const currentGlobalIdx = segmentCounter;
                          segmentCounter++;
                          const hasHistory = copyHistory[currentGlobalIdx] !== undefined;
                          return (
                            <div
                              key={segmentIdx}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 4,
                                position: "relative",
                                width: "100%",
                              }}
                            >
                              <textarea
                                rows={1}
                                value={segment}
                                disabled={isRefreshingCopy || isStreaming || isGenerating}
                                onChange={(e) => {
                                  handleSegmentChange(idx, segmentIdx, e.target.value);
                                  autoResizeTextarea(e.target);
                                }}
                                onFocus={(e) => {
                                  
                                  e.currentTarget.style.borderColor = "#37352f";
                                  e.currentTarget.style.background = "#fff";
                                  autoResizeTextarea(e.currentTarget);
                                }}
                                placeholder="请输入文案..."
                                ref={(el) => autoResizeTextarea(el)}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  borderRadius: 6,
                                  background: "rgba(55,53,47,0.03)",
                                  border: "1px solid rgba(55,53,47,0.08)",
                                  padding: `6px ${hasHistory ? 48 : 26}px 6px 8px`,
                                  fontSize: 12,
                                  color: "#37352f",
                                  outline: "none",
                                  transition: "all 0.15s",
                                  resize: "none",
                                  overflow: "hidden",
                                  lineHeight: 1.5,
                                  display: "block",
                                  width: "100%",
                                  cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "text",
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = "rgba(55,53,47,0.08)";
                                  e.currentTarget.style.background = "rgba(55,53,47,0.03)";
                                  handleBlur();
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  right: 6,
                                  top: 6,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                {hasHistory && (
                                  <button
                                    type="button"
                                    disabled={isRefreshingCopy || isStreaming || isGenerating}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUndoCopy(currentGlobalIdx, idx, segmentIdx);
                                    }}
                                    title="退回优化前的文案"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",
                                      padding: "4px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderRadius: 4,
                                      transition: "all 0.15s",
                                      color: "#787774",
                                      opacity: (isRefreshingCopy || isStreaming || isGenerating) ? 0.5 : 1,
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isRefreshingCopy && !isStreaming && !isGenerating) {
                                        e.currentTarget.style.background = "rgba(55,53,47,0.05)";
                                        e.currentTarget.style.color = "#37352f";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                      e.currentTarget.style.color = "#787774";
                                    }}
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isRefreshingCopy || isStreaming || isGenerating}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSegment(idx, segmentIdx);
                                  }}
                                  title="删除此行文案"
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",
                                    padding: "4px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 4,
                                    transition: "all 0.15s",
                                    color: "#787774",
                                    opacity: (isRefreshingCopy || isStreaming || isGenerating) ? 0.5 : 1,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isRefreshingCopy && !isStreaming && !isGenerating) {
                                      e.currentTarget.style.background = "rgba(224, 62, 62, 0.08)";
                                      e.currentTarget.style.color = "#e03e3e";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = "#787774";
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })())}
            {/* 用户新增的 pending 文案栏 */}
            {pendingExtraCopyFields.map((field, extraIdx) => (
              <div
                key={`extra-${extraIdx}`}
                style={{
                  border: "1px solid rgba(55,53,47,0.08)",
                  borderRadius: 8,
                  background: "#fff",
                  overflow: "hidden",
                  padding: 10,
                  position: "relative",
                }}
              >
                <textarea
                  rows={1}
                  autoFocus={extraIdx === pendingExtraCopyFields.length - 1}
                  value={field}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPendingExtraCopyFields((prev) =>
                      prev.map((f, i) => (i === extraIdx ? val : f))
                    );
                    autoResizeTextarea(e.target);
                  }}
                  onFocus={(e) => {
                    
                    e.currentTarget.style.borderColor = "#37352f";
                    e.currentTarget.style.background = "#fff";
                    autoResizeTextarea(e.currentTarget);
                  }}
                  onBlur={(e) => {
                    const val = e.currentTarget.value.trim();
                    e.currentTarget.style.borderColor = "rgba(55,53,47,0.08)";
                    e.currentTarget.style.background = "rgba(55,53,47,0.03)";
                    if (val) {
                      const newCopy = copyRaw
                        ? copyRaw + " | " + val
                        : val;
                      updateCopy(newCopy);
                      setPendingExtraCopyFields((prev) =>
                        prev.filter((_, i) => i !== extraIdx)
                      );
                      onUpdateParams({ stream_a: { copy: newCopy } });
                    } else {
                      setPendingExtraCopyFields((prev) =>
                        prev.filter((_, i) => i !== extraIdx)
                      );
                    }
                    
                  }}
                  placeholder="请输入文案..."
                  ref={(el) => autoResizeTextarea(el)}
                  style={{
                    flex: 1,
                    width: "100%",
                    borderRadius: 6,
                    background: "rgba(55,53,47,0.03)",
                    border: "1px solid rgba(55,53,47,0.08)",
                    padding: "6px 26px 6px 8px",
                    fontSize: 12,
                    color: "#37352f",
                    outline: "none",
                    transition: "all 0.15s",
                    resize: "none",
                    overflow: "hidden",
                    lineHeight: 1.5,
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPendingExtraCopyFields((prev) =>
                      prev.filter((_, i) => i !== extraIdx)
                    )
                  }
                  title="删除此栏"
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    borderRadius: 4,
                    color: "#c0bdb9",
                    fontSize: 14,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#e03e3e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#c0bdb9";
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {/* 新增文案栏按鈕 */}
            <button
              type="button"
              onClick={() =>
                setPendingExtraCopyFields((prev) => [...prev, ""])
              }
              disabled={isStreaming}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px dashed rgba(55,53,47,0.15)",
                background: "transparent",
                color: "#9b9a97",
                fontSize: 12,
                fontWeight: 500,
                cursor: isStreaming ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                opacity: isStreaming ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isStreaming) {
                  e.currentTarget.style.borderColor = "rgba(55,53,47,0.35)";
                  e.currentTarget.style.color = "#37352f";
                  e.currentTarget.style.background = "rgba(55,53,47,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(55,53,47,0.15)";
                e.currentTarget.style.color = "#9b9a97";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>新增文案栏</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
