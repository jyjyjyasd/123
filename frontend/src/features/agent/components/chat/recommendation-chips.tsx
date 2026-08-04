export interface RecommendationChipsProps {
  recs: Array<{ index: number; name: string }>;
  selectedIndex?: number | null;
  accent: string;
  bg: string;
  onSelect?: (index: number, name: string) => void;
}

export function RecommendationChips({
  recs,
  selectedIndex,
  accent,
  bg,
  onSelect,
}: RecommendationChipsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {recs.map((rec) => {
        const isSelected = selectedIndex === rec.index;
        return (
          <button
            key={rec.index}
            onClick={() => onSelect?.(rec.index, rec.name)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: isSelected ? bg : "#fff",
              border: isSelected ? `2px solid ${accent}` : "1px solid rgba(55,53,47,0.12)",
              borderRadius: 6,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = accent;
              e.currentTarget.style.background = bg;
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = "rgba(55,53,47,0.12)";
                e.currentTarget.style.background = "#fff";
              }
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>
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
  );
}
