import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ExtendedImage, AgentSession } from "../types";

const ALL_RATIOS = [
  { key: "1:1", label: "方图 1:1" },
  { key: "4:3", label: "横向 PPT 4:3" },
  { key: "3:4", label: "小红书 3:4" },
  { key: "16:9", label: "宽屏 16:9" },
  { key: "9:16", label: "海报 9:16" },
  { key: "3:2", label: "摄影 3:2" },
  { key: "2:3", label: "杂志 2:3" },
  { key: "9:32", label: "详情页 9:32" },
];

interface ExtendModalProps {
  currentRatio: string;
  onExtend: (ratios: string[], resolution: "2k" | "4k") => void;
  onClose: () => void;
  isLoading?: boolean;
  tasks?: ExtendedImage[];
  session: AgentSession;
  baseImageUrl?: string;
}

export function ExtendModal({
  currentRatio,
  onExtend,
  onClose,
  isLoading = false,
  tasks = [],
  session,
  baseImageUrl,
}: ExtendModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolution, setResolution] = useState<"2k" | "4k">("2k");

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

  const handleExtend = () => {
    if (selected.size === 0 || isLoading) return;
    onExtend(Array.from(selected), resolution);
  };

  const isUrlMatch = (url1?: string, url2?: string) => {
    if (!url1 || !url2) return false;
    const cleanUrl = (u: string) => {
      const parts = u.split('?')[0].split('/');
      return parts[parts.length - 1];
    };
    return cleanUrl(url1) === cleanUrl(url2);
  };

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
        if (group.primary_image?.url) {
          generatedRatiosInGroup.add(group.primary_image.ratio);
        }
        group.extended_images?.forEach((ext) => {
          if (ext.url && ext.status === "completed") {
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
    if (session.generation_id) {
      generatedRatiosInGroup.add(session.primary_ratio || session.aspect_ratio || "1:1");
    }
    activeExtList.forEach((ext) => {
      if (ext.url && ext.status === "completed") {
        generatedRatiosInGroup.add(ext.ratio);
      }
    });
  }

  // Filter out the current ratio from options
  const list = ALL_RATIOS.filter((r) => r.key !== currentRatio);
  const activeTasks = tasks.filter((task) => task.status && task.status !== "completed");
  const runningTasks = tasks.filter((task) => task.status && task.status !== "completed" && task.status !== "failed");

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
            多尺寸延伸与自适应海报生成
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#787774" }}>
            选择您想要生成的其它海报画幅，系统将依据当前海报进行智能排版设计与比例扩充。
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 240, overflowY: "auto" }}>
          {list.map((r) => {
            const isSelected = selected.has(r.key);
            const isAlreadyGenerated = generatedRatiosInGroup.has(r.key);
            return (
              <button
                key={r.key}
                onClick={() => toggleRatio(r.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: isSelected ? "rgba(55,53,47,0.05)" : "#f7f6f3",
                  border: `1.5px solid ${isSelected ? "#37352f" : "transparent"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1.5px solid ${isSelected ? "#37352f" : "rgba(55,53,47,0.2)"}`,
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
                <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#37352f" }}>{r.label}</span>
                  {isAlreadyGenerated && (
                    <span style={{ fontSize: 10, color: "#4f8277", background: "rgba(79,130,119,0.08)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                      已生成
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {activeTasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#787774", marginBottom: 8 }}>
              当前延伸进度
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
                        {ALL_RATIOS.find((item) => item.key === task.ratio)?.label || task.ratio}
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

        {/* 清晰度选择 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#787774", marginBottom: 8 }}>
            选择延伸海报清晰度
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {(["2k", "4k"] as const).map((res) => {
              const isResSelected = resolution === res;
              return (
                <button
                  key={res}
                  onClick={() => setResolution(res)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 12px",
                    background: isResSelected ? "rgba(55,53,47,0.05)" : "#f7f6f3",
                    border: `1.5px solid ${isResSelected ? "#37352f" : "transparent"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#37352f" }}>
                    {res.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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
            onClick={handleExtend}
            disabled={selected.size === 0 || isLoading || runningTasks.length > 0}
            style={{
              padding: "8px 20px",
              background: selected.size === 0 || isLoading || runningTasks.length > 0 ? "#d3d1cb" : "#37352f",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: selected.size === 0 || isLoading || runningTasks.length > 0 ? "not-allowed" : "pointer",
              transition: "background 0.12s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isLoading || runningTasks.length > 0 ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                正在生成延伸尺寸中…
              </>
            ) : (
              `延伸 ${selected.size} 个尺寸`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
