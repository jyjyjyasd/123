// canvas/annotation-ui.tsx — 海报圈画修改：工具 HUD 与浮动标签输入
import type { RefObject } from "react";
import type { DrawTool } from "./drawing";

const TOOL_LABELS: Record<DrawTool, string> = {
  freehand: "🖊 画",
  arrow: "➡ 箭",
  rect: "▭ 框",
  ellipse: "◯ 椭",
};

export function AnnotationToolbar({
  activeTool,
  onSelectTool,
  onClear,
}: {
  activeTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(55,53,47,0.12)",
        borderRadius: 6,
        padding: "5px 5px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flexShrink: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* 工具切换 */}
      {(["freehand", "arrow", "rect", "ellipse"] as const).map((tool) => {
        const active = activeTool === tool;
        return (
          <button
            key={tool}
            onClick={(e) => { e.stopPropagation(); onSelectTool(tool); }}
            title={`工具: ${TOOL_LABELS[tool]}`}
            style={{
              fontSize: 11,
              padding: "5px 7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              fontWeight: active ? 600 : 500,
              border: active ? "1.5px solid #FF4D4F" : "1px solid rgba(55,53,47,0.15)",
              background: active ? "rgba(255,77,79,0.08)" : "#fff",
              color: active ? "#e03e3e" : "#37352F",
              cursor: "pointer",
              transition: "all 0.12s ease",
              whiteSpace: "nowrap",
            }}
          >
            {TOOL_LABELS[tool]}
          </button>
        );
      })}

      {/* 分隔线 */}
      <div style={{ height: 1, background: "rgba(55,53,47,0.10)", margin: "2px 1px" }} />

      {/* 清除 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        title="清除标注"
        style={{
          fontSize: 11,
          padding: "5px 7px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          fontWeight: 500,
          background: "#F2F1EE",
          color: "#37352F",
          border: "1px solid #E3E2E0",
          cursor: "pointer",
          transition: "background 0.12s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#E3E2E0"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#F2F1EE"; }}
      >
        🧹 清
      </button>
    </div>
  );
}

export function LabelInput({
  x,
  y,
  value,
  onChange,
  onConfirm,
  onCancel,
  inputRef,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: Math.max(4, y),
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#ffffff",
        border: "1px solid #000000",
        borderRadius: 0,
        padding: "3px 6px",
        boxShadow: "none",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="这里要改什么？"
        style={{
          width: 140,
          fontSize: 11,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "#000000",
          fontWeight: 500,
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
      />
      <button
        onClick={onConfirm}
        disabled={!value.trim()}
        style={{
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 0,
          fontWeight: 600,
          background: value.trim() ? "#000000" : "#cccccc",
          color: "#ffffff",
          border: "none",
          cursor: value.trim() ? "pointer" : "not-allowed",
          transition: "background 0.12s",
          whiteSpace: "nowrap",
        }}
      >
        确认
      </button>
    </div>
  );
}
