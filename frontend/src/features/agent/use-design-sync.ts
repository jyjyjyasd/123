// features/agent/use-design-sync.ts
// 职责：监听 session 变化 → 同步到 DesignStore
// clarifying 阶段不执行注入，prompting 阶段读 design_json 注入

import { useEffect } from "react";
import type { AgentSession } from "./types";
import { useDesignStore } from "./design-store";

export function useDesignSync(session: AgentSession | null) {
  const ingest = useDesignStore((s) => s.ingestFromDesignJson);
  const initFromLegacy = useDesignStore((s) => s.initFromLegacy);

  useEffect(() => {
    if (!session) return;

    if (session.status === "prompting" && session.design_json) {
      // 新会话：design_json 有值，直接注入（脏标记由 ingest 内部控制）
      ingest(session.design_json);
      return;
    }

    if (session.status === "prompting" && !session.design_json) {
      // 老会话兜底：design_json 为 null，从 stream_a/stream_b 初始化
      initFromLegacy({
        copy: session.stream_a?.copy ?? "",
        styleRecs: session.stream_b?.style_recommendations ?? [],
        layoutRecs: session.stream_a?.layout_recommendations ?? [],
        ratio: session.aspect_ratio,
        resolution: session.resolution,
      });
    }
    // clarifying 阶段：不执行任何操作（数据留在 clarify_messages 用于对话展示）
  }, [
    // 仅在 design_json 引用或 status 变化时触发，避免不必要的 re-run
    session?.design_json,
    session?.status,
    session?.stream_a?.copy,   // 老会话兜底依赖
  ]);
}
