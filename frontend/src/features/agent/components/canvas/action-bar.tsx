// canvas/action-bar.tsx — 满意度/操作动作栏（导出、延伸、圈画入口）
import { Download, Maximize2, Sliders } from "lucide-react";
import type { DisplayImage } from "./types";

export function ActionBar({
  currentDisplayImage,
  isDrawingMode,
  arrowCount,
  isSubmittingEdit,
  onExportPng,
  onExportPdf,
  onResolutionExtend,
  onExtend,
  onToggleDrawingMode,
  onSubmitEdit,
}: {
  currentDisplayImage: DisplayImage | null;
  isDrawingMode: boolean;
  arrowCount: number;
  isSubmittingEdit: boolean;
  onExportPng: () => void;
  onExportPdf: () => void;
  onResolutionExtend: (url?: string, ratio?: string) => void;
  onExtend: (url?: string, ratio?: string) => void;
  onToggleDrawingMode: () => void;
  onSubmitEdit: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 480,
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {/* 第一行：操作按钮组 */}
      <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={onExportPng}
          style={{
            padding: "8px 14px",
            background: "#fff",
            border: "1px solid rgba(55,53,47,0.12)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#37352f",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          }}
        >
          <Download size={14} style={{ color: "#487ca5" }} />
          导出 PNG
        </button>
        <button
          onClick={onExportPdf}
          style={{
            padding: "8px 14px",
            background: "#fff",
            border: "1px solid rgba(55,53,47,0.12)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#37352f",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          }}
        >
          <Download size={14} style={{ color: "#4f8277" }} />
          导出 PDF
        </button>
        <button
          onClick={() => onResolutionExtend(currentDisplayImage?.url ?? undefined, currentDisplayImage?.ratio)}
          style={{
            padding: "8px 14px",
            background: "#fff",
            border: "1px solid rgba(55,53,47,0.12)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#37352f",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          }}
        >
          <Sliders size={14} style={{ color: "#787774" }} />
          清晰度延伸
        </button>
        <button
          onClick={() => onExtend(currentDisplayImage?.url ?? undefined, currentDisplayImage?.ratio)}
          style={{
            padding: "8px 16px",
            background: "linear-gradient(135deg, #37352f, #22201d)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 2px 4px rgba(55,53,47,0.15)",
          }}
        >
          <Maximize2 size={14} />
          多尺寸延伸
        </button>
      </div>

      {/* 第二行：海报圈画修改控制行 */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          background: "rgba(55,53,47,0.02)",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(55,53,47,0.08)",
          width: "100%",
        }}
      >
        {/* 进入/退出标注模式 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDrawingMode();
          }}
          style={{
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 6,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            border: isDrawingMode ? "2px solid #e03e3e" : "1px solid rgba(55,53,47,0.12)",
            background: isDrawingMode ? "#fdf2f2" : "#fff",
            color: isDrawingMode ? "#e03e3e" : "#37352f",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <span>{isDrawingMode ? "❌" : "🖌️"}</span>
          <span>{isDrawingMode ? "退出标注" : "海报修改"}</span>
        </button>

        {/* 提示文字 */}
        <span style={{ flex: 1, fontSize: 11, color: isDrawingMode ? "#9b9a97" : "rgba(55,53,47,0.3)", transition: "color 0.15s" }}>
          {isDrawingMode
            ? arrowCount > 0
              ? `已添加 ${arrowCount} 个标注指令`
              : "用箭头工具指向修改位置并输入指令"
            : "进入标注模式在海报上圈画"}
        </span>

        {/* 确认修改按钮 */}
        <button
          onClick={onSubmitEdit}
          disabled={!isDrawingMode || arrowCount === 0 || isSubmittingEdit}
          style={{
            fontSize: 12,
            padding: "6px 14px",
            borderRadius: 6,
            fontWeight: 600,
            background: "#37352F",
            color: "#FFF",
            border: "none",
            opacity: (!isDrawingMode || arrowCount === 0 || isSubmittingEdit) ? 0.35 : 1,
            cursor: (!isDrawingMode || arrowCount === 0 || isSubmittingEdit) ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          {isSubmittingEdit ? "提交中..." : `确认修改${arrowCount > 0 ? ` (${arrowCount})` : ""}`}
        </button>
      </div>
    </div>
  );
}
