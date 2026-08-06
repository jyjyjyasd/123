// features/agent/panels/LayoutSelector.tsx
// 排版选择区：消费 DesignStore.layout_recommendations 和 active_layout
// 从 AgentWorkspace.tsx Stage 1 Card 的 section 3 提取

import { useEffect, useRef, useState } from "react";
import { useDesignStore } from "../design-store";
import { LayoutTagPopover } from "../components/LayoutTagPopover";
import type { PresetLayoutTag } from "../data/preset-layout-tags";
import type { LayoutRecommendation } from "../types";

interface LayoutSelectorProps {
  hasLayoutRef: boolean;
  layoutDescription: string;
  layoutRefNotes?: string | null;
  onSendMessage?: (msg: string) => Promise<void>;
  onSelectLayout: (rec: LayoutRecommendation, source: 'custom' | 'recommendation') => void;
  onSelectTag: (tag: PresetLayoutTag) => void;
}

export function LayoutSelector({
  hasLayoutRef,
  layoutDescription,
  layoutRefNotes,
  onSendMessage,
  onSelectLayout,
  onSelectTag,
}: LayoutSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshLayouts = async () => {
    setIsRefreshing(true);
    if (onSendMessage) await onSendMessage("由于当前画面没有提供排版参考图，请重新推荐 4 种不同方向的海报排版方案供我选择。");
    setIsRefreshing(false);
  };
  const activeLayout = useDesignStore((s) => s.active_layout);
  const layoutRecommendations = useDesignStore((s) => s.layout_recommendations);
  const confirmedSource = useDesignStore((s) => s.confirmed_layout_source);
  const confirmedId = useDesignStore((s) => s.confirmed_layout_id);

  const layoutTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // isCurrentActive: true 当未确认，或明确确认为 custom（包括 agent 整理的默认文本视为 custom 的起点，如果没有选中别的）
  const isCurrentActive = confirmedSource === null || confirmedSource === 'custom' || confirmedSource === 'agent_input';

  // candidatesList
  const candidatesList: LayoutRecommendation[] = [];
  if (activeLayout && !isCurrentActive && confirmedSource !== 'tag') {
    const isPresent = layoutRecommendations.some(
      (r) => r.name === activeLayout.name
    );
    if (!isPresent) {
      candidatesList.push(activeLayout);
    }
  }
  candidatesList.push(...layoutRecommendations);

  const isUserInput = confirmedSource === 'custom' || confirmedSource === 'agent_input';
  const fallbackLayout = (isUserInput && activeLayout?.description) || layoutDescription || "";

  const REF_INDICATOR = "参考图片";
  const rawLayoutVal = hasLayoutRef ? REF_INDICATOR : (fallbackLayout || "");
  const trimmedVal = rawLayoutVal.trim();
  
  // 选中任意来源（custom/recommendation/tag/agent_input）后，统一展示 activeLayout.name（中文排版名），
  // 与 StyleSelector 保持对称，避免选中推荐后回退到英文/原始描述。
  // 参考图片权重最高：上传参考图后输入框强制显示 "参考图片"，删除后才恢复原有逻辑。
  const layoutVal = hasLayoutRef
    ? REF_INDICATOR
    : activeLayout ? activeLayout.name : (trimmedVal || "");

  // 同步 textarea DOM value：解决 defaultValue 只在首次挂载生效、用户上传/删除参考图后文字不更新的 bug
  useEffect(() => {
    const el = layoutTextareaRef.current;
    if (el) {
      el.value = layoutVal;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [layoutVal]);

  if (layoutRecommendations.length === 0 && !hasLayoutRef && !trimmedVal) return null;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        排版方案选择
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 当前排版 (Current Layout) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#787774", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            当前排版
          </div>
          <div
            onClick={() => {
              if (isRefreshing) return;
              if (hasLayoutRef) {
                const val = REF_INDICATOR;
                const desc = layoutRefNotes || (layoutDescription !== REF_INDICATOR ? layoutDescription : "");
                const item: LayoutRecommendation = {
                  index: 99,
                  name: val,
                  description: desc,
                };
                onSelectLayout(item, 'custom');
                return;
              }
              if (!isCurrentActive) {
                const val = layoutTextareaRef.current?.value.trim() || layoutVal;
                const item: LayoutRecommendation = {
                  index: 99,
                  name: val,
                  description: val,
                };
                onSelectLayout(item, 'custom');
                setTimeout(() => layoutTextareaRef.current?.focus(), 0);
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
              cursor: hasLayoutRef ? "pointer" : (isCurrentActive ? "text" : "pointer"),
              opacity: isRefreshing ? 0.6 : 1,
              minHeight: 42,
            }}
          >
            <div
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
              onClick={(e) => {
                if (!hasLayoutRef) {
                  e.stopPropagation();
                }
              }}
            >
              <textarea
                ref={(el) => {
                  (layoutTextareaRef as any).current = el;
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                defaultValue={layoutVal}
                placeholder="未提供排版描述，可在此自主填写"
                readOnly={!isCurrentActive || hasLayoutRef}
                onFocus={(e) => {
                  e.target.style.outline = "none";
                  e.target.style.border = "none";
                  if (hasLayoutRef) return;
                  if (!isCurrentActive) {
                    const val = e.target.value.trim() || layoutVal;
                    const item: LayoutRecommendation = {
                      index: 99,
                      name: val,
                      description: val,
                    };
                    onSelectLayout(item, 'custom');
                  }
                }}
                onBlur={(e) => {
                  if (hasLayoutRef) return;
                  const val = e.target.value.trim();
                  if (val && (val !== layoutVal || confirmedSource !== 'custom')) {
                    const item: LayoutRecommendation = {
                      index: 99,
                      name: val,
                      description: val,
                    };
                    onSelectLayout(item, 'custom');
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

        {/* 推荐排版 (Recommended Layouts) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "#787774", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              推荐排版
            </div>
            {!hasLayoutRef && (
              <button
                onClick={handleRefreshLayouts}
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
                  <>↻ 刷新排版</>
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
                      onClick={() => onSelectLayout(rec, 'recommendation')}
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
                <LayoutTagPopover
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
