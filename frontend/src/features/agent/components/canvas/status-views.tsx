// canvas/status-views.tsx — 画布状态占位视图
import { useState, useEffect } from "react";
import { AlertCircle, Check, Paintbrush, Sparkles } from "lucide-react";
import type { AgentSession } from "../../types";

export function EmptyCanvas() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9b9a97",
        fontSize: 12,
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(55, 53, 47, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9b9a97",
        }}
      >
        <Paintbrush size={20} strokeWidth={1.5} />
      </div>
      <div style={{ fontWeight: 500, color: "#787774" }}>发起对话开始创作</div>
    </div>
  );
}

export function BlueprintLoading({ session }: { session: AgentSession }) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf9f6",
        color: "#37352f",
      }}
    >
      {/* 核心居中区域：绝不会因比例问题变形或挤压 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* 极简旋转指示器 */}
        <div style={{ position: "relative", width: 36, height: 36 }}>
          <svg
            viewBox="0 0 64 64"
            style={{
              width: "100%",
              height: "100%",
              animation: "spin 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
              position: "absolute",
              inset: 0,
            }}
          >
            {/* 底圈 */}
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="rgba(55, 53, 47, 0.05)"
              strokeWidth="2"
            />
            {/* 进度弧线 */}
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#487ca5"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="40 120"
            />
          </svg>
          {/* 中心微动 Sparkle 图标 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#487ca5",
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            <Sparkles size={14} strokeWidth={2} />
          </div>
        </div>

        {/* 提示文案与计时器 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#37352f",
              letterSpacing: "0.02em",
            }}
          >
            正在绘制海报视觉...
          </span>
          <span
            style={{
              fontSize: 10,
              color: "#9b9a97",
              fontFamily: "monospace",
            }}
          >
            {elapsedTime}s
          </span>
        </div>
      </div>

      {/* 底部单行元数据：极简悬浮，绝不截断 */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          right: 16,
          textAlign: "center",
          fontSize: 9,
          fontFamily: 'SFMono-Regular, Consolas, monospace',
          color: "rgba(155, 154, 151, 0.5)",
          letterSpacing: "0.03em",
        }}
      >
        {session.aspect_ratio} · {session.resolution.toUpperCase()} · DIFFUSION_XL
      </div>
    </div>
  );
}

export function FailedView({ errorMessage }: { errorMessage?: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        color: "#e03e3e",
        padding: "40px 24px",
        textAlign: "center",
        maxWidth: 320,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(224, 62, 62, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#e03e3e",
          marginBottom: 4,
        }}
      >
        <AlertCircle size={20} strokeWidth={1.5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
          海报生成失败
        </div>
        <div style={{ fontSize: 11, color: "#e03e3e", background: "rgba(224, 62, 62, 0.04)", border: "1px solid rgba(224, 62, 62, 0.12)", borderRadius: 6, padding: "8px 12px", lineHeight: "1.5", wordBreak: "break-all", fontFamily: "monospace" }}>
          {errorMessage || "未知错误，请检查网络或重试"}
        </div>
        <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6", marginTop: 4 }}>
          生成超时或绘图引擎繁忙。您可以尝试在左侧重新生成，或者返回上一步微调文案与排版。
        </div>
      </div>
    </div>
  );
}

export function ClarifyingView() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        color: "#787774",
        padding: "40px 24px",
        textAlign: "center",
        maxWidth: 320,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(55, 53, 47, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#787774",
          marginBottom: 4,
        }}
      >
        <Paintbrush size={20} strokeWidth={1.5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
          沟通设计意图
        </div>
        <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6" }}>
          请与右侧 AI 助理交谈，沟通您的设计创意。方案大纲生成后将在此处呈现。
        </div>
      </div>
    </div>
  );
}

export function PromptingView() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        color: "#787774",
        padding: "40px 24px",
        textAlign: "center",
        maxWidth: 320,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(72, 124, 165, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#487ca5",
          marginBottom: 4,
        }}
      >
        <Check size={20} strokeWidth={1.5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
          大纲配置已就绪
        </div>
        <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6" }}>
          设计大纲已定稿。请点击右侧对话区底部的「开始生成海报」按钮以绘制主视觉。
        </div>
      </div>
    </div>
  );
}

export function WaitingView() {
  return (
    <div style={{ fontSize: 11, color: "#9b9a97", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9b9a97", display: "inline-block", animation: "pulse 1.5s infinite" }} />
      等待海报绘制结果…
    </div>
  );
}
