// canvas/annotation-ui.tsx — 海报圈画修改：工具 HUD 与浮动标签输入
import { useState, type RefObject, type ReactNode } from "react";
import type { DrawTool } from "./drawing";

// 定义 SVG 线条感线稿图标 (代替原有的 TOOL_LABELS)
const TOOL_ICONS: Record<DrawTool, ReactNode> = {
  freehand: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19L19 5" />
      <path d="M12 5h7v7" />
    </svg>
  ),
  rect: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  ),
  ellipse: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
};

// 清除动作线条图标
const CLEAR_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.4 5.4c1 1 1 2.5 0 3.4L13 21Z" />
    <path d="m22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);

export function AnnotationToolbar({
  activeTool,
  onSelectTool,
  onClear,
}: {
  activeTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
  onClear: () => void;
}) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // 统一定义选中状态和普通状态的样式
  const getButtonStyle = (isActive: boolean, isHovered: boolean) => ({
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6, // 遵循 PRD §5.4 图标按钮 6px 圆角规范
    border: isActive 
      ? "1px solid rgba(224, 62, 62, 0.24)" 
      : "1px solid transparent",
    background: isActive 
      ? "rgba(224, 62, 62, 0.08)" 
      : isHovered 
        ? "rgba(55, 53, 47, 0.04)" 
        : "transparent",
    color: isActive ? "#e03e3e" : "#37352F",
    cursor: "pointer",
    transition: "all 0.12s ease",
  });

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(55,53,47,0.12)",
        borderRadius: 8,
        padding: "4px",
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
        const hovered = hoveredButton === tool;
        return (
          <button
            key={tool}
            onClick={(e) => { e.stopPropagation(); onSelectTool(tool); }}
            onMouseEnter={() => setHoveredButton(tool)}
            onMouseLeave={() => setHoveredButton(null)}
            title={{ freehand: "画笔", arrow: "箭头", rect: "矩形框选", ellipse: "椭圆框选" }[tool]}
            style={getButtonStyle(active, hovered)}
          >
            {TOOL_ICONS[tool]}
          </button>
        );
      })}

      {/* 分隔线 */}
      <div style={{ height: 1, background: "rgba(55,53,47,0.08)", margin: "4px 2px" }} />

      {/* 清除 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        onMouseEnter={() => setHoveredButton("clear")}
        onMouseLeave={() => setHoveredButton(null)}
        title="清除标注"
        style={getButtonStyle(false, hoveredButton === "clear")}
      >
        {CLEAR_ICON}
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
