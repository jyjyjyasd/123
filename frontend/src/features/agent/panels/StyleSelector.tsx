// features/agent/panels/StyleSelector.tsx
// 风格选择区：消费 DesignStore.style_recommendations 和 active_style
// 从 AgentWorkspace.tsx Stage 1 Card 的 section 2 提取

import { useEffect, useRef, useState } from "react";
import { useDesignStore } from "../design-store";
import { StyleTagPopover } from "../components/StyleTagPopover";
import type { PresetStyleTag } from "../data/preset-style-tags";
import type { StyleRecommendation } from "../types";

interface StyleSelectorProps {
  hasStyleRef: boolean;
  visualDescription: string;
  onSendMessage?: (msg: string) => Promise<void>;
  onSelectStyle: (rec: StyleRecommendation, source: 'custom' | 'recommendation') => void;
  onSelectTag: (tag: PresetStyleTag) => void;
}

function resolveFriendlyStyleName(raw: string): string {
  if (!raw) return "";
  const t = raw.trim();
  if (t.length <= 40) return t;
  if (t.includes(".")) {
    const first = t.split(".")[0].trim();
    if (first.length <= 60) return first;
  }
  return t.slice(0, 60) + "...";
}

export function StyleSelector({
  hasStyleRef,
  visualDescription,
  onSendMessage,
  onSelectStyle,
  onSelectTag,
}: StyleSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshStyles = async () => {
    setIsRefreshing(true);
    if (onSendMessage) await onSendMessage("由于当前画面没有上传特定的图片或物料等参考图，请重新推荐 4 种不同方向的海报设计风格方案供我选择。");
    setIsRefreshing(false);
  };
  const activeStyle = useDesignStore((s) => s.active_style);
  const styleRecommendations = useDesignStore((s) => s.style_recommendations);
  const confirmedSource = useDesignStore((s) => s.confirmed_style_source);
  const confirmedId = useDesignStore((s) => s.confirmed_style_id);
  
  const styleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // isCurrentActive: true 当未确认，或明确确认为 custom（包括 agent 整理的默认文本视为 custom 的起点，如果没有选中别的）
  const isCurrentActive = confirmedSource === null || confirmedSource === 'custom' || confirmedSource === 'agent_input';

  // candidatesList: 所有风格推荐卡片（不含当前正在使用的那个）
  const candidatesList: StyleRecommendation[] = [];
  if (activeStyle && !isCurrentActive && confirmedSource !== 'tag') {
    const isPresent = styleRecommendations.some(
      (r) => r.name === activeStyle.name
    );
    if (!isPresent) {
      candidatesList.push(activeStyle);
    }
  }
  candidatesList.push(...styleRecommendations);

  const REF_INDICATOR = "参考图片";
  const rawVal = hasStyleRef ? REF_INDICATOR : (visualDescription || "");
  const friendlyVal = hasStyleRef ? REF_INDICATOR : resolveFriendlyStyleName(rawVal);
  const isNoStyle = ["not-provided", "not provided", "未提供", "暂无", "无", "暂无明确指定视觉风格"].some(kw => friendlyVal.trim().toLowerCase().includes(kw)) || !friendlyVal;
  
  // Custom input always shows either user's text or agent's extracted text.
  // When activeStyle is from custom input, it will be the activeStyle.name, otherwise it's the friendlyVal.
  // 参考图片权重最高：上传参考图后输入框强制显示 "参考图片"，删除后才恢复原有逻辑。
  const styleVal = hasStyleRef
    ? REF_INDICATOR
    : (confirmedSource === 'custom' && activeStyle) ? activeStyle.name : (isNoStyle ? "" : friendlyVal);

  // 同步 textarea DOM value：解决 defaultValue 只在首次挂载生效、用户上传/删除参考图后文字不更新的 bug
  useEffect(() => {
    const el = styleTextareaRef.current;
    if (el) {
      el.value = styleVal;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [styleVal]);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        风格方案选择
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 当前风格 (Current Style) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#787774", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            当前风格
          </div>
          <div
            onClick={() => {
              if (isRefreshing) return;
              if (hasStyleRef) {
                const val = REF_INDICATOR;
                const item: StyleRecommendation = {
                  index: 99,
                  name: val,
                  name_en: val,
                  visual_description: val,
                };
                onSelectStyle(item, 'custom');
                return;
              }
              if (!isCurrentActive) {
                // Clicking the custom input makes it active
                const val = styleTextareaRef.current?.value.trim() || styleVal;
                const item: StyleRecommendation = {
                  index: 99,
                  name: val.length > 30 ? val.slice(0, 27) + "..." : val,
                  name_en: val,
                  visual_description: val,
                };
                onSelectStyle(item, 'custom');
                setTimeout(() => styleTextareaRef.current?.focus(), 0);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: isCurrentActive ? "rgba(55,53,47,0.04)" : "#fff",
              border: isCurrentActive ? "1.5px solid #37352f" : "1px solid rgba(55,53,47,0.12)",
              boxShadow: isCurrentActive ? "0 0 10px rgba(55, 53, 47, 0.25)" : "none",
              borderRadius: 6,
              textAlign: "left" as const,
              transition: "all 0.15s",
              width: "100%",
              cursor: hasStyleRef ? "pointer" : (isCurrentActive ? "text" : "pointer"),
              opacity: isRefreshing ? 0.6 : 1,
              minHeight: 42,
            }}
          >
            <div
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
              onClick={(e) => {
                if (!hasStyleRef) {
                  e.stopPropagation();
                }
              }}
            >
              <textarea
                ref={(el) => {
                  (styleTextareaRef as any).current = el;
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                defaultValue={styleVal}
                placeholder="未提供风格描述，可在此自主填写"
                readOnly={!isCurrentActive || hasStyleRef}
                onFocus={(e) => {
                  e.target.style.outline = "none";
                  e.target.style.border = "none";
                  if (hasStyleRef) return;
                  if (!isCurrentActive) {
                    const val = e.target.value.trim() || styleVal;
                    const item: StyleRecommendation = {
                      index: 99,
                      name: val.length > 30 ? val.slice(0, 27) + "..." : val,
                      name_en: val,
                      visual_description: val,
                    };
                    onSelectStyle(item, 'custom');
                  }
                }}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && (val !== styleVal || confirmedSource !== 'custom')) {
                    const item: StyleRecommendation = {
                      index: 99,
                      name: val.length > 30 ? val.slice(0, 27) + "..." : val,
                      name_en: val,
                      visual_description: val,
                    };
                    onSelectStyle(item, 'custom');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const val = (e.target as HTMLTextAreaElement).value.trim();
                    if (val) {
                      const item: StyleRecommendation = {
                        index: 99,
                        name: val.length > 30 ? val.slice(0, 27) + "..." : val,
                        name_en: val,
                        visual_description: val,
                      };
                      onSelectStyle(item, 'custom');
                    }
                  }
                }}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  resize: "none" as const,
                  fontSize: 12,
                  lineHeight: "1.5",
                  color: "#37352f",
                  background: "transparent",
                  fontFamily: "inherit",
                  padding: 0,
                  margin: 0,
                  minHeight: isCurrentActive ? 18 : "auto",
                }}
              />
            </div>
            {isCurrentActive && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#37352f" }}>✓</span>
            )}
          </div>
        </div>

        {/* 推荐风格 (Recommended Styles) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "#787774", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              推荐风格
            </div>
            {!hasStyleRef && (
              <button
                onClick={handleRefreshStyles}
                disabled={isRefreshing}
                style={{
                  fontSize: 11,
                  color: "#37352f",
                  background: "transparent",
                  border: "none",
                  cursor: isRefreshing ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: 4,
                  opacity: isRefreshing ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isRefreshing) e.currentTarget.style.background = "rgba(55,53,47,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {isRefreshing ? (
                  <>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        border: "1.5px solid #37352f",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    刷新中...
                  </>
                ) : (
                  <>↻ 刷新风格</>
                )}
              </button>
            )}
          </div>

          {isRefreshing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            candidatesList.length > 0 && (
              <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {candidatesList.map((rec) => {
                  const isSelected = confirmedSource === 'recommendation' && confirmedId === rec.name;

                  return (
                    <button
                      key={`${rec.index}-${rec.name}`}
                      onClick={() => onSelectStyle(rec, 'recommendation')}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 10px",
                        background: isSelected ? "rgba(55,53,47,0.04)" : "#fff",
                        border: isSelected ? "1.5px solid #37352f" : "1px solid rgba(55,53,47,0.12)",
                        boxShadow: isSelected ? "0 0 10px rgba(55, 53, 47, 0.25)" : "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        textAlign: "left" as const,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#37352f";
                        e.currentTarget.style.background = "rgba(55,53,47,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "rgba(55,53,47,0.12)";
                          e.currentTarget.style.background = "#fff";
                        }
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#37352f" }}>
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
                <StyleTagPopover
                  onSelectTag={onSelectTag}
                  selectedTagId={confirmedSource === 'tag' ? confirmedId : null}
                  disabled={isRefreshing}
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
