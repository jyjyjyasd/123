import { splitLabelAndValue } from "./chat-utils";

export interface LayoutPlanRowsProps {
  lines: string[];
}

export function LayoutPlanRows({ lines }: LayoutPlanRowsProps) {
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
