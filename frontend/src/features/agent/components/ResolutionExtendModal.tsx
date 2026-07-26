import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { AgentSession, ExtendedImage } from "../types";

const RATIO_NAMES: Record<string, string> = {
  "1:1": "方图 1:1",
  "4:3": "横向 PPT 4:3",
  "3:4": "小红书 3:4",
  "16:9": "宽屏 16:9",
  "9:16": "海报 9:16",
  "3:2": "摄影 3:2",
  "2:3": "杂志 2:3",
  "9:32": "详情页 9:32",
};

interface ResolutionExtendModalProps {
  session: AgentSession;
  onExtend: (ratios: string[], resolution: string) => void;
  onClose: () => void;
  isLoading?: boolean;
  tasks?: ExtendedImage[];
  currentRatio?: string;
  baseImageUrl?: string;
}

export function ResolutionExtendModal({
  session,
  onExtend,
  onClose,
  isLoading = false,
  tasks = [],
  currentRatio,
  baseImageUrl,
}: ResolutionExtendModalProps) {
  // 收集可升级为 4K 的比例列表
  const list: string[] = [];
  const primaryRatio = session.primary_ratio || session.aspect_ratio || "1:1";
  const primaryRes = session.primary_resolution || "1k";

  // 主图如果不是 4K，可以升级
  if (session.generation_id && primaryRes !== "4k") {
    list.push(primaryRatio);
  }

  // 延伸图中不是 4K 且没有重复的，可以升级
  if (session.extended_images) {
    session.extended_images.forEach((ext) => {
      const res = ext.resolution || "1k";
      if (res !== "4k" && !list.includes(ext.ratio)) {
        list.push(ext.ratio);
      }
    });
  }

  // 归档历史海报中不是 4K 且没有重复的，可以升级
  if (session.archived_images) {
    session.archived_images.forEach((group) => {
      if (group.primary_image) {
        const res = group.primary_image.resolution || "1k";
        if (res !== "4k" && !list.includes(group.primary_image.ratio)) {
          list.push(group.primary_image.ratio);
        }
      }
      if (group.extended_images) {
        group.extended_images.forEach((arch) => {
          const res = arch.resolution || "1k";
          if (res !== "4k" && !list.includes(arch.ratio)) {
            list.push(arch.ratio);
          }
        });
      }
    });
  }

  const isUrlMatch = (url1?: string, url2?: string) => {
    if (!url1 || !url2) return false;
    const cleanUrl = (u: string) => {
      const parts = u.split('?')[0].split('/');
      return parts[parts.length - 1];
    };
    return cleanUrl(url1) === cleanUrl(url2);
  };

  // 计算当前所选图像对应分组中已经成功生成（已完成且非4K）的比例集合，其余未生成的应置灰禁用
  const generatedRatiosInGroup = new Set<string>();
  const activeExtList = session.extended_images || [];
  let isTargetGroupFound = false;

  // 1. 优先检索历史归档版本组
  if (session.archived_images && baseImageUrl) {
    for (const group of session.archived_images) {
      const isPrimMatch = group.primary_image?.url && isUrlMatch(group.primary_image.url, baseImageUrl);
      const isExtMatch = group.extended_images?.some((ext) => ext.url && isUrlMatch(ext.url, baseImageUrl));
      if (isPrimMatch || isExtMatch) {
        isTargetGroupFound = true;
        if (group.primary_image?.url && group.primary_image.resolution !== "4k") {
          generatedRatiosInGroup.add(group.primary_image.ratio);
        }
        group.extended_images?.forEach((ext) => {
          if (ext.url && ext.status === "completed" && ext.resolution !== "4k") {
            generatedRatiosInGroup.add(ext.ratio);
          }
        });
        break;
      }
    }
  }

  // 2. 如果在历史归档中没有匹配到，或者没有 baseImageUrl，则归属到当前活跃版本组
  if (!isTargetGroupFound) {
    isTargetGroupFound = true;
    if (session.generation_id && session.primary_resolution !== "4k") {
      generatedRatiosInGroup.add(session.primary_ratio || session.aspect_ratio || "1:1");
    }
    activeExtList.forEach((ext) => {
      if (ext.url && ext.status === "completed" && ext.resolution !== "4k") {
        generatedRatiosInGroup.add(ext.ratio);
      }
    });
  }

  // 如果没有匹配到任何组（极端兜底），则将所有 list 中存在的比例都视为已生成，以防用户无法操作
  if (!isTargetGroupFound && generatedRatiosInGroup.size === 0) {
    list.forEach((r) => generatedRatiosInGroup.add(r));
  }

  // 默认选中的比例应该是可升级且已在当前目标组内生成的比例
  const defaultSelected = currentRatio && list.includes(currentRatio) && generatedRatiosInGroup.has(currentRatio)
    ? [currentRatio]
    : list.filter((r) => generatedRatiosInGroup.has(r));

  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));
  const activeTasks = tasks.filter((task) => task.status && task.status !== "completed");
  const runningTasks = tasks.filter((task) => task.status && task.status !== "completed" && task.status !== "failed");

  const toggleRatio = (ratio: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ratio)) {
        next.delete(ratio);
      } else {
        next.add(ratio);
      }
      return next;
    });
  };

  const handleUpgrade = () => {
    if (selected.size === 0 || isLoading) return;
    onExtend(Array.from(selected), "4k");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 0.15s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 440,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          animation: "slideUp 0.2s ease",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#37352f" }}>
            清晰度延展与 4K 高清重绘
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#787774" }}>
            系统将使用高画质超分重绘引擎，对选定的画幅比例进行 4K 像素级拉升重建，超分出的高清卡片将与原版并存。
          </p>
        </div>

        {list.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#9b9a97", fontSize: 13 }}>
            暂无可升级清晰度的已生成海报
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 200, overflowY: "auto" }}>
            {list.map((r) => {
              const isSelected = selected.has(r);
              const isPrimary = r === primaryRatio;
              const isGenerated = generatedRatiosInGroup.has(r);
              return (
                <button
                  key={r}
                  disabled={!isGenerated}
                  onClick={() => toggleRatio(r)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: !isGenerated
                      ? "rgba(55,53,47,0.02)"
                      : isSelected
                      ? "rgba(55,53,47,0.05)"
                      : "#f7f6f3",
                    border: `1.5px solid ${!isGenerated ? "rgba(55,53,47,0.04)" : isSelected ? "#37352f" : "transparent"}`,
                    borderRadius: 8,
                    cursor: !isGenerated ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                    width: "100%",
                    opacity: !isGenerated ? 0.4 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: `1.5px solid ${!isGenerated ? "rgba(55,53,47,0.1)" : isSelected ? "#37352f" : "rgba(55,53,47,0.2)"}`,
                      background: isSelected ? "#37352f" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.12s",
                    }}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} style={{ color: "#fff" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#37352f" }}>
                      {RATIO_NAMES[r] || r}
                    </span>
                    {isPrimary && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(55,53,47,0.06)", color: "#37352f", padding: "1px 4px", borderRadius: 4 }}>
                        主视觉
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#787774", marginBottom: 8 }}>
              当前高清延伸进度
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeTasks.map((task) => {
                const progress = task.progress ?? (task.status === "running" ? 48 : 12);
                const isFailed = task.status === "failed";
                return (
                  <div
                    key={task.generation_id || `${task.ratio}-${task.resolution}`}
                    style={{
                      padding: "10px 12px",
                      background: "#f7f6f3",
                      borderRadius: 10,
                      border: `1px solid ${isFailed ? "rgba(224,62,62,0.18)" : "rgba(55,53,47,0.08)"}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#37352f" }}>
                        {RATIO_NAMES[task.ratio] || task.ratio}
                      </span>
                      <span style={{ fontSize: 11, color: isFailed ? "#e03e3e" : "#787774" }}>
                        {isFailed ? "生成失败" : task.status === "running" ? "生成中" : "排队中"} · {progress}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(55,53,47,0.08)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${progress}%`,
                          height: "100%",
                          background: isFailed ? "#e03e3e" : "linear-gradient(90deg, #37352f, #787774)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    {task.error_message && (
                      <div style={{ marginTop: 6, fontSize: 10, color: "#e03e3e" }}>{task.error_message}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid rgba(55,53,47,0.16)",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
              color: "#787774",
            }}
          >
            取消
          </button>
          <button
            onClick={handleUpgrade}
            disabled={selected.size === 0 || isLoading || list.length === 0 || runningTasks.length > 0}
            style={{
              padding: "8px 20px",
              background: selected.size === 0 || isLoading || list.length === 0 || runningTasks.length > 0 ? "#d3d1cb" : "#37352f",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: selected.size === 0 || isLoading || list.length === 0 || runningTasks.length > 0 ? "not-allowed" : "pointer",
              transition: "background 0.12s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isLoading || runningTasks.length > 0 ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                正在高清重绘中…
              </>
            ) : (
              "开始 4K 高清重绘"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
