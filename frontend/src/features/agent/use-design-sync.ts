// features/agent/use-design-sync.ts
// 职责：监听 session 变化 → 同步到 DesignStore
// clarifying 阶段不执行注入；prompting 或 review 阶段读 design_json 注入
// 注意：后端可能一步从 clarifying 直接跳到 review（跳过 prompting），
// 因此两个状态都需要触发注入，否则 Store 为空，推荐卡片不显示

import { useEffect } from "react";
import type { AgentSession } from "./types";
import { useDesignStore } from "./design-store";

export function useDesignSync(session: AgentSession | null) {
  const ingest = useDesignStore((s) => s.ingestFromDesignJson);
  const initFromLegacy = useDesignStore((s) => s.initFromLegacy);

  useEffect(() => {
    if (!session) return;

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
      });
    }
  }, [
    // 仅在 design_json 引用或 status 变化时触发，避免不必要的 re-run
    session?.design_json,
    session?.status,
    session?.stream_a?.copy,   // 老会话兜底依赖
    session?.stream_b?.style_recommendations,
    session?.stream_a?.layout_recommendations,
  ]);
}
