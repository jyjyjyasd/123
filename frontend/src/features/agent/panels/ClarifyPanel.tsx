// features/agent/panels/ClarifyPanel.tsx
// 对话界面：clarifying 阶段的 SSE 流式输出 + ChatBubble 渲染
// 从 AgentWorkspace.tsx 的消息列表区域提取
// 只消费 clarify_messages 和 isStreaming，不依赖 formData

import { ChatBubble } from "../components/ChatBubble";
import type { AgentSession, ClarifyMessage } from "../types";

interface ClarifyPanelProps {
  messages: ClarifyMessage[];
  isStreaming: boolean;
  streamingContent: string;
  session: AgentSession | null;
  onSendMessage: (message: string) => void;
  setInput: (value: string) => void;
  updateParams?: (params: Record<string, unknown>) => Promise<void>;
}

export function ClarifyPanel({
  messages,
  isStreaming,
  streamingContent,
  session,
  onSendMessage,
  setInput,
  updateParams,
}: ClarifyPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {messages.length === 0 && !isStreaming && (
        <div
          style={{
            padding: 20,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "#37352f" }}>你好！我是 AI 设计助理</div>
          <div style={{ fontSize: 13, color: "#787774", lineHeight: "1.7" }}>
            请告诉我你想要什么样的海报：
            <br />
            · 活动主题或产品名称
            <br />
            · 希望展示的文案内容
            <br />
            · 风格偏好（极简/奢华/赛博…）
            <br />
            · 尺寸和清晰度要求
          </div>
          <div style={{ fontSize: 11, color: "#c7c7c4" }}>
            也可以直接上传参考图，描述你的需求即可开始。
          </div>
        </div>
      )}

      {(() => {
        const filteredMessages = messages.filter((msg, idx) => {
          if (msg.role === "user") {
            const isConfirm = msg.content.startsWith("我选择风格方案") ||
                              msg.content.startsWith("我选择排版方案") ||
                              msg.content.includes("确认，信息无误，请进入定稿阶段。") ||
                              msg.content === "请重新推荐 4 种不同方向的海报设计风格方案供我选择。";
            if (isConfirm) return false;
          }
          if (msg.role === "assistant") {
            const prev = messages[idx - 1];
            if (prev && prev.role === "user") {
              const isConfirm = prev.content.startsWith("我选择风格方案") ||
                                prev.content.startsWith("我选择排版方案") ||
                                prev.content.includes("确认，信息无误，请进入定稿阶段。") ||
                                prev.content === "请重新推荐 4 种不同方向的海报设计风格方案供我选择。";
              if (isConfirm) return false;
            }
          }
          return true;
        });

        return filteredMessages.map((message, idx) => {
          const isLast = idx === filteredMessages.length - 1;
          const isMsgStreaming = isLast && isStreaming && message.role === "assistant";

          // 智能快答显示逻辑
          const showQuickReplies = (() => {
            if (!isLast || isStreaming) return false;
            if (message.role !== "assistant") return false;
            if (!session?.stream_a?.quick_replies || session.stream_a.quick_replies.length === 0) return false;
            if (message.content.includes("[[SECTION:copy]]")) return true;
            if (message.content.includes("[[SECTION:visual]]")) return true;
            if (message.content.includes("[[SECTION:layout]]")) return true;
            if (message.content.includes("[[SECTION:design_review]]")) return true;
            const hasSections = message.content.includes("[[SECTION:");
            if (!hasSections) return true;
            return false;
          })();

          return (
            <div key={message.id} style={{ display: "flex", flexDirection: "column" }}>
              <ChatBubble
                message={message}
                isStreaming={isMsgStreaming}
                streamingText={isMsgStreaming ? streamingContent : ""}
                session={session}
                updateParams={updateParams ?? (async () => {})}
                hideSections={true}
              />
              {showQuickReplies && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 4,
                    marginBottom: 16,
                    paddingLeft: 30,
                    animation: "fadeIn 0.2s ease-in-out",
                  }}
                >
                  {session?.stream_a?.quick_replies?.map((reply, replyIdx) => (
                    <button
                      key={replyIdx}
                      onClick={() => {
                        if (isStreaming) return;
                        setInput("");
                        onSendMessage(reply);
                      }}
                      disabled={isStreaming}
                      style={{
                        background: "#ffffff",
                        border: "1px solid rgba(55,53,47,0.12)",
                        borderRadius: 16,
                        padding: "6px 12px",
                        fontSize: 12,
                        color: "#37352f",
                        cursor: isStreaming ? "not-allowed" : "pointer",
                        boxShadow: "0 1px 3px rgba(55,53,47,0.04)",
                        transition: "all 0.15s ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => {
                        if (isStreaming) return;
                        e.currentTarget.style.borderColor = "#37352f";
                        e.currentTarget.style.background = "#f7f6f3";
                      }}
                      onMouseLeave={(e) => {
                        if (isStreaming) return;
                        e.currentTarget.style.borderColor = "rgba(55,53,47,0.12)";
                        e.currentTarget.style.background = "#ffffff";
                      }}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        });
      })()}

      {/* 流式中且还没有 assistant 消息时的临时占位 */}
      {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
        <div style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "rgba(55,53,47,0.15)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 12, color: "#787774" }}>正在分析您的需求...</span>
        </div>
      )}
    </div>
  );
}
