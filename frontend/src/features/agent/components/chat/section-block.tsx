import { useEffect, useState } from "react";
import {
  extractLayoutRecommendations,
  extractStyleRecommendations,
} from "../../section-parser";
import type { AgentSession } from "../../types";
import { splitLabelAndValue } from "./chat-utils";
import { LayoutPlanRows } from "./layout-plan-rows";
import { PosterTextRows } from "./poster-text-rows";
import { RecommendationChips } from "./recommendation-chips";
import { SECTION_STYLE } from "./section-styles";
import { SpecsSection } from "./specs-section";
import { VisualKnownField } from "./visual-known-field";

export interface SectionBlockProps {
  sectionKey: string;
  lines: string[];
  onSelectStyle?: (index: number, name: string) => void;
  onSelectLayout?: (index: number, name: string) => void;
  session?: AgentSession | null;
  updateParams?: (params: Record<string, unknown>) => Promise<void>;
  selectedStyleIndex?: number | null;
  selectedLayoutIndex?: number | null;
  onRefreshStyles?: () => void;
  isRefreshingStyles?: boolean;
}

export function SectionBlock({
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
}: SectionBlockProps) {
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
      <SpecsSection
        style={style}
        activeRatio={activeRatio}
        activeRes={activeRes}
        onUpdate={updateParams}
      />
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
                <VisualKnownField
                  key={idx}
                  accent={style.accent}
                  hasStyleRef={hasStyleRef}
                  value={localKnownText}
                  disabled={hasStyleRef || !updateParams}
                  onChangeValue={setLocalKnownText}
                  onSave={(newVal) => {
                    if (hasStyleRef || !updateParams) return;
                    if (newVal === initialKnownValue.trim() || !newVal) return;
                    void updateParams({
                      stream_b: { visual_description: newVal }
                    });
                  }}
                />
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
          <RecommendationChips
            recs={styleRecs}
            selectedIndex={selectedStyleIndex}
            accent={style.accent}
            bg={style.bg}
            onSelect={onSelectStyle}
          />
        )
      )}

      {layoutRecs.length > 0 && (
        <RecommendationChips
          recs={layoutRecs}
          selectedIndex={selectedLayoutIndex}
          accent={style.accent}
          bg={style.bg}
          onSelect={onSelectLayout}
        />
      )}
    </div>
  );
}
