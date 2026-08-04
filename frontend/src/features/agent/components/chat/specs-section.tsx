import type { SectionStyle } from "./section-styles";

export interface SpecsSectionProps {
  style: SectionStyle;
  activeRatio: string;
  activeRes: string;
  onUpdate?: (params: Record<string, unknown>) => void;
}

const RATIO_LABELS: Record<string, string> = {
  "1:1": "方图 1:1",
  "4:3": "横向 PPT 4:3",
  "3:4": "小红书 3:4",
  "16:9": "宽屏 16:9",
  "9:16": "海报 9:16",
  "3:2": "摄影 3:2",
  "2:3": "杂志 2:3",
};

export function SpecsSection({
  style,
  activeRatio,
  activeRes,
  onUpdate,
}: SpecsSectionProps) {
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
              return (
                <button
                  key={r}
                  onClick={() => onUpdate?.({ aspect_ratio: r })}
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
                  {RATIO_LABELS[r] || r}
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
                  onClick={() => onUpdate?.({ resolution: res })}
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
