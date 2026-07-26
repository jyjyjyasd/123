// features/agent/components/ConfirmCard.tsx
// 两次确认按钮（移植自 prd onFirstConfirm / onSecondConfirm 交互契约）
// clarifying → prompting：第一次确认（"确认，开始定稿"）
// prompting → generating：第二次确认（"确认，开始生成"）

import type { SessionStatus } from "../types";

interface ConfirmCardProps {
  status: SessionStatus;
  isStreaming: boolean;
  isGenerating: boolean;
  onConfirmFirst: () => void;   // clarifying → 发送确认消息
  onConfirmSecond: () => void;  // prompting → triggerGenerate
}

export function ConfirmCard({
  status,
  isStreaming,
  isGenerating,
  onConfirmFirst,
  onConfirmSecond,
}: ConfirmCardProps) {
  if (isStreaming || status === "init") return null;

  const isPending = isGenerating;

  if (status === "clarifying") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "12px 0",
        }}
      >
        <button
          onClick={onConfirmFirst}
          disabled={isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "#37352f",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            transition: "opacity 0.15s, transform 0.1s",
          }}
          onMouseEnter={(e) => !isPending && ((e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = "none")}
        >
          <span>✓</span>
          信息确认无误，进入定稿
        </button>
      </div>
    );
  }

  if (status === "prompting") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "12px 0",
        }}
      >
        <button
          onClick={onConfirmSecond}
          disabled={isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 24px",
            background: "#37352f",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            boxShadow: "0 2px 8px rgba(55,53,47,0.15)",
            transition: "opacity 0.15s, transform 0.1s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isPending) {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(55,53,47,0.25)";
              (e.currentTarget as HTMLButtonElement).style.background = "#2e2c27";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "none";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(55,53,47,0.15)";
            (e.currentTarget as HTMLButtonElement).style.background = "#37352f";
          }}
        >
          {isPending ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              生成中…
            </>
          ) : (
            <>
              <span>✦</span>
              方案确认，开始生成海报
            </>
          )}
        </button>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "12px 0",
          color: "#787774",
          fontSize: 13,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            border: "2px solid rgba(55, 53, 47, 0.15)",
            borderTopColor: "#37352f",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        AI 正在生成您的海报，这通常需要 30–90 秒…
      </div>
    );
  }

  return null;
}
