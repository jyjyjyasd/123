// features/agent/panels/ExportPanel.tsx
// 规格选择区：画布尺寸比例 + 生成清晰度
// 从 AgentWorkspace.tsx Stage 1 Card 的 section 4 提取
// 内部调用 useDesignStore 同步 active_ratio / active_resolution

import { useDesignStore } from "../design-store";

interface ExportPanelProps {
  // 当前值（来自 formData，Step 7 后将改为从 DesignStore 读取）
  activeRatio: string;
  activeResolution: string;

  // Callbacks — 通知 AgentWorkspace 更新 formData + 后端
  onRatioChange: (ratio: string) => void;
  onResolutionChange: (res: string) => void;
}

const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "9:32"] as const;

const RATIO_LABELS: Record<string, string> = {
  "1:1": "方图 1:1",
  "4:3": "横向 4:3",
  "3:4": "竖向 3:4",
  "16:9": "宽屏 16:9",
  "9:16": "海报 9:16",
  "3:2": "横向 3:2",
  "2:3": "杂志 2:3",
  "9:32": "详情页 9:32",
};

const RESOLUTIONS = ["1k", "2k", "4k"] as const;

export function ExportPanel({
  activeRatio,
  activeResolution,
  onRatioChange,
  onResolutionChange,
}: ExportPanelProps) {
  const handleRatioClick = (r: string) => {
    useDesignStore.getState().setActiveRatio(r);
    onRatioChange(r);
  };

  const handleResolutionClick = (res: string) => {
    useDesignStore.getState().setActiveResolution(res);
    onResolutionChange(res);
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        海报规格设置
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>画布尺寸比例</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ASPECT_RATIOS.map((r) => {
              const isActive = activeRatio === r;
              return (
                <button
                  key={r}
                  onClick={() => handleRatioClick(r)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: isActive ? "#37352f" : "rgba(55,53,47,0.12)",
                    background: isActive ? "#37352f" : "#fff",
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
          <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>生成清晰度</div>
          <div style={{ display: "flex", gap: 4 }}>
            {RESOLUTIONS.map((res) => {
              const isActive = activeResolution === res;
              return (
                <button
                  key={res}
                  onClick={() => handleResolutionClick(res)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: isActive ? "#37352f" : "rgba(55,53,47,0.12)",
                    background: isActive ? "#37352f" : "#fff",
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
