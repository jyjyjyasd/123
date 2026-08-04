import { useEffect } from "react";
import type { AgentSession } from "./types";
import { useDesignStore } from "./design-store";
import { extractKnownStyleSummary } from "./section-parser";

function resolveFriendlyStyleName(raw: string): string {
  if (!raw) return "";
  const t = raw.trim();
  if (t.length <= 40) return t;
  if (t.includes(".")) {
    const first = t.split(".")[0].trim();
    if (first.length <= 60) return first;
  }
  return t.slice(0, 60) + "...";
}

export function useDesignSync(session: AgentSession | null) {
  const ingest = useDesignStore((s) => s.ingestFromDesignJson);
  const initFromLegacy = useDesignStore((s) => s.initFromLegacy);

  useEffect(() => {
    if (!session) return;

    // 如果后端已有有效的风格或排版规划描述，但在 store 中尚未确认，初始化其来源为 'agent_input'
    const storeState = useDesignStore.getState();
    const knownStyleSummary = extractKnownStyleSummary(session.clarify_messages ?? []);

    const styleDesc = session.stream_b?.visual_description;
    const hasStyleDesc = styleDesc && styleDesc !== "not provided" && styleDesc !== "not-provided";
    if (hasStyleDesc && storeState.confirmed_style_source === null) {
      useDesignStore.setState({
        confirmed_style_source: 'agent_input',
        active_style: {
          index: 99,
          name: knownStyleSummary || resolveFriendlyStyleName(styleDesc),
          name_en: "",
          visual_description: styleDesc,
        }
      });
    }

    const layoutDesc = session.stream_a?.layout_notes;
    const hasLayoutDesc = layoutDesc && layoutDesc !== "暂无具体排版要求";
    if (hasLayoutDesc && storeState.confirmed_layout_source === null) {
      useDesignStore.setState({
        confirmed_layout_source: 'agent_input',
        active_layout: {
          index: 99,
          name: layoutDesc,
          description: layoutDesc,
        }
      });
    }

    const shouldIngest = session.status === "prompting" || session.status === "review";

    if (shouldIngest && session.design_json) {
      // 新会话：design_json 有值，直接注入（脏标记由 ingest 内部控制）
      ingest(session.design_json);
      return;
    }

    if (shouldIngest && !session.design_json) {
      // 老会话兜底：design_json 为 null，从 stream_a/stream_b 初始化
      initFromLegacy({
        copy: session.stream_a?.copy ?? "",
        styleRecs: session.stream_b?.style_recommendations ?? [],
        layoutRecs: session.stream_a?.layout_recommendations ?? [],
        ratio: session.aspect_ratio,
        resolution: session.resolution,
      });
    }
    // clarifying 阶段：提前将 AI 吐出的推荐数据灌入 Store，供独立组件渲染
    if (session.status === "clarifying") {
      initFromLegacy({
        styleRecs: session.stream_b?.style_recommendations ?? [],
        layoutRecs: session.stream_a?.layout_recommendations ?? [],
        ratio: session.aspect_ratio,
        resolution: session.resolution,
      });
    }
  }, [
    // 仅在 design_json 引用或 status 变化时触发，避免不必要的 re-run
    session?.design_json,
    session?.status,
    session?.stream_a?.copy,   // 老会话兜底依赖
    session?.stream_b?.style_recommendations,
    session?.stream_a?.layout_recommendations,
    session?.clarify_messages,
    session?.stream_b?.visual_description,
    session?.stream_a?.layout_notes,
  ]);
}
