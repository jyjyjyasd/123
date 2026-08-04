// canvas/status-views.tsx — 画布状态占位视图
import { AlertCircle, Check, Paintbrush } from "lucide-react";
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
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(rgba(72,124,165,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(72,124,165,0.02) 1px, transparent 1px), #faf9f6",
        backgroundSize: "16px 16px",
        gap: 20,
        overflow: "hidden",
      }}
    >
      {/* 蓝图视觉设计层 */}
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: session.aspect_ratio === "9:32" ? "50%" : 16,
          bottom: session.aspect_ratio === "9:32" ? "auto" : 16,
          transform: session.aspect_ratio === "9:32" ? "translateY(-50%)" : "none",
          minHeight: session.aspect_ratio === "9:32" ? 420 : "none",
          maxHeight: session.aspect_ratio === "9:32" ? 480 : "none",
          border: "1px dashed rgba(55,53,47,0.09)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          padding: 16,
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {/* 顶栏：标尺与规格 */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: 'Consolas, monospace', color: "rgba(155, 154, 151, 0.6)", borderBottom: "1px dashed rgba(55,53,47,0.06)", paddingBottom: 6 }}>
          <div>[ CANVAS_SPEC: {session.aspect_ratio} ]</div>
          <div>{session.resolution.toUpperCase()} ULTRA_HD</div>
        </div>

        {/* 中间：版式示意虚线框与中置旋转加载 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "12px 0", width: "100%" }}>
          {/* 模拟主体物定位框 */}
          <div
            style={{
              border: "1px dashed rgba(72,124,165,0.12)",
              borderRadius: 4,
              padding: "12px",
              background: "rgba(72,124,165,0.01)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 9, color: "rgba(72, 124, 165, 0.6)", fontFamily: 'Consolas, monospace', textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [ Subject Material Layer ]
            </div>
          </div>

          {/* 中置直接旋转圆圈（处于定位框缝隙中，代替毛玻璃卡片） */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
            {/* 圆形进度图标 */}
            <div style={{ position: "relative", width: 48, height: 48 }}>
              <svg viewBox="0 0 64 64" style={{ width: 48, height: 48, animation: "spin 2s linear infinite", position: "absolute", inset: 0 }}>
                <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(55,53,47,0.05)" strokeWidth="3" />
                <circle
                  cx="32" cy="32" r="27"
                  fill="none"
                  stroke="url(#grad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="42 128"
                />
                <defs>
                  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#487ca5" />
                    <stop offset="100%" stopColor="#4f8277" />
                  </linearGradient>
                </defs>
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  animation: "pulse 2s ease-in-out infinite",
                }}
              >
                🎨
              </div>
            </div>

            {/* 提示文案 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: 9, fontFamily: 'Consolas, monospace', color: "#787774", letterSpacing: "0.08em" }}>
                RENDERING VISUALS...
              </div>
              {/* 跳动圆点 */}
              <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #487ca5, #4f8277)",
                      animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 模拟文案区域 */}
          <div
            style={{
              border: "1px dashed rgba(79,130,119,0.12)",
              borderRadius: 4,
              padding: "12px",
              background: "rgba(79,130,119,0.01)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 9, color: "rgba(79, 130, 119, 0.6)", fontFamily: 'Consolas, monospace', textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [ Typography & Copy Layout ]
            </div>
          </div>
        </div>

        {/* 底栏：设计元数据与参数 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 9, fontFamily: 'Consolas, monospace', color: "rgba(155, 154, 151, 0.6)", borderTop: "1px dashed rgba(55,53,47,0.06)", paddingTop: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div>ENGINE: diffusion_xl</div>
            <div>SAMPLER: dpmpp_2m_sde</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>STRENGTH: {session.stream_b?.denoising_strength ?? 0.7}</div>
            <div>STATUS: RENDERING...</div>
          </div>
        </div>
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
