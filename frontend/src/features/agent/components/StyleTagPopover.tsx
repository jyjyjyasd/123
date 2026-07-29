import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PRESET_STYLE_TAGS } from "../data/preset-style-tags";
import type { PresetStyleTag } from "../data/preset-style-tags";

interface StyleTagPopoverProps {
  onSelectTag: (tag: PresetStyleTag) => void;
  selectedTagId?: string | null;
  disabled?: boolean;
}

export const StyleTagPopover: React.FC<StyleTagPopoverProps> = ({
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
      const modalWidth = 320;

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

  const handleSelect = (tag: PresetStyleTag) => {
    onSelectTag(tag);
    setIsOpen(false);
  };

  return (
    <div style={{ display: "inline-block" }}>
      {/* 触发按钮：风格Tag */}
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
          color: selectedTagId ? "#fff" : "#37352f",
          background: selectedTagId ? "#37352f" : "transparent",
          border: selectedTagId
            ? "1px solid #37352f"
            : "1px solid rgba(55,53,47,0.16)",
          padding: "4px 8px",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.15s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
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
        {/* 标签图标 */}
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
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <span>风格Tag</span>
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
              width: 320,
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
                预置风格标签
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
              {PRESET_STYLE_TAGS.map((tag) => {
                const isSelected = selectedTagId === tag.name || selectedTagId === tag.id;
                return (
                  <div
                    key={tag.id}
                    onClick={() => handleSelect(tag)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
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
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
