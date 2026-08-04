// canvas/logo-panel.tsx — 品牌 Logo 微调调节面板
export function LogoAdjustPanel({
  logoScale,
  logoOffset,
  logoOpacity,
  logoPosition,
  onScaleChange,
  onOffsetChange,
  onOpacityChange,
  onPositionChange,
}: {
  logoScale: number;
  logoOffset: number;
  logoOpacity: number;
  logoPosition: string;
  onScaleChange: (value: number) => void;
  onOffsetChange: (value: number) => void;
  onOpacityChange: (value: number) => void;
  onPositionChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(55,53,47,0.09)",
        borderRadius: 8,
        padding: 14,
        width: "100%",
        maxWidth: 480,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.02)",
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#37352f", borderBottom: "1px solid rgba(55,53,47,0.06)", paddingBottom: 6 }}>
        🏷️ 品牌 Logo 微调设置
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>Logo 尺寸 ({logoScale}%)</span>
          <input
            type="range"
            min={10}
            max={40}
            value={logoScale}
            onChange={(e) => onScaleChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>边距偏移 ({logoOffset}%)</span>
          <input
            type="range"
            min={0}
            max={30}
            value={logoOffset}
            onChange={(e) => onOffsetChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>透明度 ({logoOpacity}%)</span>
          <input
            type="range"
            min={10}
            max={100}
            value={logoOpacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>Logo 摆放位置</span>
          <select
            value={logoPosition}
            onChange={(e) => onPositionChange(e.target.value)}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(55,53,47,0.16)",
              background: "#fff",
              outline: "none",
            }}
          >
            <option value="top-left">左上角</option>
            <option value="top-center">顶正中</option>
            <option value="top-right">右上角</option>
            <option value="bottom-left">左下角</option>
            <option value="bottom-center">底正中</option>
            <option value="bottom-right">右下角</option>
          </select>
        </div>
      </div>
    </div>
  );
}
