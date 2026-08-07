import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PRESET_LAYOUT_TAGS } from "../data/preset-layout-tags";
import type { PresetLayoutTag } from "../data/preset-layout-tags";

const renderPreviewBlock = (tagId: string) => {
  const baseStyle: React.CSSProperties = {
    position: "relative",
    width: 36,
    height: 48,
    background: "rgba(55, 53, 47, 0.06)",
    borderRadius: 4,
    overflow: "hidden",
    flexShrink: 0,
  };

  switch (tagId) {
    case "minimal-magazine":
      return (
        <div style={baseStyle}>
          <div style={{ position: "absolute", top: 4, left: 4, width: 14, height: 5, background: "rgba(55,53,47,0.4)", borderRadius: 1 }} />
          <div style={{ position: "absolute", top: 11, left: 4, width: 8, height: 4, background: "rgba(55,53,47,0.3)", borderRadius: 1 }} />
          <div style={{ position: "absolute", bottom: 4, left: 4, width: 10, height: 2, background: "rgba(55,53,47,0.2)" }} />
        </div>
      );
    case "split-diagonal":
      return (
        <div style={baseStyle}>
          <div style={{ position: "absolute", top: 2, right: 2, width: 18, height: 20, background: "rgba(55,53,47,0.25)", borderRadius: 2 }} />
          <div style={{ position: "absolute", bottom: 10, left: 3, width: 14, height: 4, background: "rgba(55,53,47,0.35)", borderRadius: 1 }} />
          <div style={{ position: "absolute", bottom: 5, left: 3, width: 10, height: 3, background: "rgba(55,53,47,0.15)", borderRadius: 0.5 }} />
        </div>
      );
    case "centered-card":
      return (
        <div style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 6, width: 28, height: 36, background: "rgba(55,53,47,0.08)", borderRadius: 2 }} />
          <div style={{ position: "relative", width: 22, height: 26, background: "#ffffff", borderRadius: 2, boxShadow: "0 2px 4px rgba(0,0,0,0.08)", padding: 2, display: "flex", flexDirection: "column", gap: 2, justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 14, height: 3, background: "rgba(55,53,47,0.5)", borderRadius: 0.5 }} />
            <div style={{ width: 10, height: 2, background: "rgba(55,53,47,0.3)", borderRadius: 0.5 }} />
          </div>
        </div>
      );
    case "surrounding-frame":
      return (
        <div style={baseStyle}>
          <div style={{ position: "absolute", top: 12, left: 8, width: 20, height: 24, background: "rgba(55,53,47,0.2)", borderRadius: 2 }} />
          <div style={{ position: "absolute", top: 3, left: 3, width: 12, height: 3, background: "rgba(55,53,47,0.4)", borderRadius: 0.5 }} />
          <div style={{ position: "absolute", top: 3, right: 3, width: 6, height: 3, background: "rgba(55,53,47,0.3)", borderRadius: 0.5 }} />
          <div style={{ position: "absolute", bottom: 3, left: 3, width: 8, height: 3, background: "rgba(55,53,47,0.3)", borderRadius: 0.5 }} />
          <div style={{ position: "absolute", bottom: 3, right: 3, width: 10, height: 3, background: "rgba(55,53,47,0.3)", borderRadius: 0.5 }} />
        </div>
      );
    case "bold-typography":
      return (
        <div style={baseStyle}>
          <div style={{ position: "absolute", top: 4, left: 2, fontSize: 32, fontWeight: 900, color: "rgba(55,53,47,0.12)", lineHeight: 1, fontFamily: "sans-serif" }}>A</div>
          <div style={{ position: "absolute", bottom: 4, right: 2, width: 20, height: 26, background: "rgba(55,53,47,0.3)", borderRadius: 2, border: "1px solid #ffffff" }} />
          <div style={{ position: "absolute", top: 6, left: 4, width: 14, height: 4, background: "rgba(55,53,47,0.5)", borderRadius: 0.5 }} />
        </div>
      );
    case "ecommerce-banner":
      return (
        <div style={{ ...baseStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "4px 3px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
            <div style={{ width: 24, height: 4, background: "rgba(55,53,47,0.45)", borderRadius: 0.5 }} />
            <div style={{ width: 18, height: 3, background: "rgba(55,53,47,0.25)", borderRadius: 0.5 }} />
          </div>
          <div style={{ width: 22, height: 16, background: "rgba(55,53,47,0.15)", borderRadius: 1 }} />
          <div style={{ width: 26, height: 6, background: "rgba(55,53,47,0.5)", borderRadius: 1.5 }} />
        </div>
      );
    default:
      return <div style={baseStyle} />;
  }
};

interface LayoutTagPopoverProps {
  onSelectTag: (tag: PresetLayoutTag) => void;
  selectedTagId?: string | null;
  disabled?: boolean;
}

export const LayoutTagPopover: React.FC<LayoutTagPopoverProps> = ({
  onSelectTag,
  selectedTagId,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 动态计算 Portal 在全局 window/body 上的坐标与智能避让
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const modalWidth = 360;

      // 默认优先向左对齐（对齐按钮右边缘）
      let left = rect.right - modalWidth;
      // 若向左延伸超越屏幕左侧安全边距(12px)，改以按钮左侧为基准
      if (left < 12) {
        left = Math.max(12, rect.left);
      }
      // 若向右延伸超越屏幕右侧安全边距(12px)，强制收纳在屏幕内
      if (left + modalWidth > window.innerWidth - 12) {
        left = window.innerWidth - modalWidth - 12;
      }

      const top = rect.bottom + 6;
      setPopoverPos({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  // 点击外部区域自动关闭弹窗（判定 button 与 popover）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (tag: PresetLayoutTag) => {
    onSelectTag(tag);
    setIsOpen(false);
  };

  return (
    <div style={{ display: "inline-block" }}>
      {/* 触发按钮：排版Tag */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          color: "#37352f",
          background: selectedTagId ? "rgba(55,53,47,0.04)" : "transparent",
          border: selectedTagId
            ? "1.5px solid #37352f"
            : "1px solid rgba(55,53,47,0.16)",
          padding: "4px 8px",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.15s ease",
          boxShadow: selectedTagId ? "0 0 10px rgba(55, 53, 47, 0.25)" : "0 1px 2px rgba(0,0,0,0.02)",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !selectedTagId) {
            e.currentTarget.style.background = "rgba(55,53,47,0.04)";
          }
        }}
        onMouseLeave={(e) => {
          if (!selectedTagId) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        {/* 标尺与网格视觉 SVG Icon */}
        <svg
          style={{ width: 12, height: 12, opacity: selectedTagId ? 1 : 0.7 }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h3a1 1 0 011 1v6a1 1 0 01-1 1h-3a1 1 0 01-1-1v-6z"
          />
        </svg>
        <span>排版Tag{selectedTagId ? `: ${selectedTagId}` : ""}</span>
        {/* 展开/收起箭头 */}
        <svg
          style={{
            width: 10,
            height: 10,
            opacity: 0.6,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Popover 下拉浮层 (React Portal 脱离局部 overflow 容器) */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              width: 360,
              maxHeight: 280,
              background: "#ffffff",
              borderRadius: 12,
              border: "1px solid rgba(55,53,47,0.12)",
              boxShadow:
                "rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px",
              zIndex: 9999,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* 面板头部标题 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 6,
                borderBottom: "1px solid rgba(55,53,47,0.06)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#787774",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                预置排版标签
              </span>
              <span style={{ fontSize: 10, color: "#9b9a97" }}>点击直接选择</span>
            </div>

            {/* 标签平铺网格列表 (测试阶段不分类、不带搜索框) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 6,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {PRESET_LAYOUT_TAGS.map((tag) => {
                const isSelected = selectedTagId === tag.name || selectedTagId === tag.id;
                return (
                  <div
                    key={tag.id}
                    onClick={() => handleSelect(tag)}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: isSelected
                        ? "1px solid #37352f"
                        : "1px solid rgba(55,53,47,0.08)",
                      background: isSelected ? "rgba(55,53,47,0.04)" : "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = "rgba(55,53,47,0.2)";
                        e.currentTarget.style.background = "rgba(55,53,47,0.02)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          "rgba(55,53,47,0.08)";
                        e.currentTarget.style.background = "#fff";
                      }
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#37352f",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {tag.name}
                        </span>
                        {isSelected && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#37352f",
                              fontWeight: 700,
                              marginLeft: 4,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          color: "#787774",
                          lineHeight: 1.3,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        } as React.CSSProperties}
                      >
                        {tag.description}
                      </span>
                    </div>
                    {renderPreviewBlock(tag.id)}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
