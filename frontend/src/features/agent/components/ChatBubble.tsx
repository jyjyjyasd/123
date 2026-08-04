import {
  cleanIntroText,
  parseSectionedMessage,
} from "../section-parser";
import type { AgentSession, ClarifyMessage } from "../types";
import { SectionBlock } from "./chat/section-block";

export interface ChatBubbleProps {
  message: ClarifyMessage;
  isStreaming?: boolean;
  streamingText?: string;
  onSelectStyle?: (index: number, name: string) => void;
  onSelectLayout?: (index: number, name: string) => void;
  session?: AgentSession | null;
  updateParams?: (params: Record<string, unknown>) => Promise<void>;
  selectedStyleIndex?: number | null;
  selectedLayoutIndex?: number | null;
  onRefreshStyles?: () => void;
  isRefreshingStyles?: boolean;
  hideSections?: boolean;
}

export function ChatBubble({
  message,
  isStreaming = false,
  streamingText = "",
  onSelectStyle,
  onSelectLayout,
  session,
  updateParams,
  selectedStyleIndex,
  selectedLayoutIndex,
  onRefreshStyles,
  isRefreshingStyles,
  hideSections = false,
}: ChatBubbleProps) {
  const isUser = message.role === "user";
  const content = isStreaming ? streamingText : message.content;

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div
          style={{
            maxWidth: "80%",
            background: "#ffffff",
            color: "#37352f",
            borderRadius: "12px 12px 2px 12px",
            padding: "10px 14px",
            border: "1px solid rgba(55,53,47,0.08)",
            boxShadow: "0 8px 20px rgba(55,53,47,0.04)",
            fontSize: 14,
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  const { intro, sections } = parseSectionedMessage(content);
  const cleanIntro = cleanIntroText(intro);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid #37352f",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "#37352f",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          AI
        </div>
        <span style={{ fontSize: 11, color: "#9b9a97" }}>AI 设计助理</span>
        {isStreaming && (
          <span style={{ fontSize: 11, color: "#37352f" }}>
            <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span> 思考中…
          </span>
        )}
      </div>

      <div style={{ paddingLeft: 30 }}>
        {cleanIntro && (
          <p
            style={{
              fontSize: 14,
              lineHeight: "1.7",
              color: "#4a4a47",
              margin: "0 0 12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {cleanIntro}
          </p>
        )}

        {!hideSections && sections.map((section, idx) => (
          <SectionBlock
            key={`${section.key}-${idx}`}
            sectionKey={section.key}
            lines={section.lines}
            onSelectStyle={onSelectStyle}
            onSelectLayout={onSelectLayout}
            session={session}
            updateParams={updateParams}
            selectedStyleIndex={selectedStyleIndex}
            selectedLayoutIndex={selectedLayoutIndex}
            onRefreshStyles={onRefreshStyles}
            isRefreshingStyles={isRefreshingStyles}
          />
        ))}

        {isStreaming && sections.length === 0 && !cleanIntro && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#9b9a97", fontSize: 13 }}>
            <span
              className="animate-spin"
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                border: "2px solid #9b9a97",
                borderTopColor: "#487ca5",
                borderRadius: "50%",
              }}
            />
            AI 正在分析需求…
          </div>
        )}
      </div>
    </div>
  );
}
