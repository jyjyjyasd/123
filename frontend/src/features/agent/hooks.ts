// features/agent/hooks.ts
// React hooks：封装 Agent 状态机的所有操作，暴露给 AgentWorkspace 使用

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  getSession,
  startClarifyStream,
  generatePoster,
  extendPoster,
  refreshStyles,
  refreshLayouts,
  updateSession,
  uploadReferenceImage,
  listSessions as listSessionsApi,
  deleteSession as deleteSessionApi,
  editPoster,
} from "./api";
import type { AgentSession, SseFrame } from "./types";
import { prepareReferenceFiles } from "@/lib/reference-files";
import { fetchGeneration } from "@/features/generation/api";
import { useDesignStore } from "./design-store";

// ─── 会话状态 hook ──────────────────────────────────────────────────────────

export interface UseAgentSessionReturn {
  session: AgentSession | null;
  isStreaming: boolean;
  streamingContent: string;       // 当前流式输出的累积文本（用于打字机效果）
  error: string | null;
  uploadingImage: boolean;

  initSession: (opts?: { forceNew?: boolean }) => Promise<void>;
  sendMessage: (
    message: string,
    opts?: {
      style_file_id?: string;
      layout_file_id?: string;
      subject_file_id?: string;
    }
  ) => Promise<void>;
  triggerGenerate: () => Promise<void>;
  triggerEdit: (editDescription: string, subjectFileId: string, size: string, resolution: string) => Promise<void>;
  triggerExtend: (ratios: string[], resolution?: string, baseImageUrl?: string) => Promise<void>;
  triggerRefreshStyles: () => Promise<AgentSession | null>;
  triggerRefreshLayouts: () => Promise<AgentSession | null>;
  updateParams: (params: Parameters<typeof updateSession>[1]) => Promise<void>;
  uploadReference: (
    file: File,
    type: "style" | "layout" | "subject" | "pdf_document" | "other",
    subjectType?: "subject" | "logo" | "other"
  ) => Promise<void>;
  removeReference: (type: "style" | "layout" | "subject" | "pdf_document") => Promise<void>;
  removeMaterial: (materialId: string) => Promise<void>;
  reset: () => void;
  listSessions: () => Promise<AgentSession[]>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteExtendedImage: (target: { id?: string; url: string }) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}

export function useAgentSession(): UseAgentSessionReturn {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!session?.id) return;

    const activeItems = (session.extended_images || []).filter(
      (item) =>
        item.generation_id &&
        item.status !== "completed" &&
        item.status !== "failed"
    );
    if (activeItems.length === 0) return;

    const estimateProgress = (status: string, createdAt?: string | null, prev?: number | null) => {
      if (status === "completed" || status === "failed") return 100;
      if (status === "pending") return Math.max(prev ?? 0, 12);
      const elapsedMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
      const timed = Math.min(92, 28 + Math.floor(elapsedMs / 4000) * 4);
      return Math.max(prev ?? 0, timed);
    };

    let cancelled = false;
    const poll = async () => {
      try {
        const results = await Promise.all(
          activeItems.map(async (item) => {
            const gen = await fetchGeneration(item.generation_id!);
            return { item, gen };
          })
        );
        if (cancelled) return;

        setSession((prev) => {
          if (!prev) return prev;
          const nextExtended = (prev.extended_images || []).map((entry) => {
            const match = results.find((result) => result.item.generation_id === entry.generation_id);
            if (!match) return entry;
            const gen = match.gen;
            const nextStatus = gen.status;
            const nextUrl =
              nextStatus === "completed" && gen.output_files?.[0]?.url
                ? gen.output_files[0].url
                : entry.url;
            return {
              ...entry,
              status: nextStatus,
              progress: estimateProgress(nextStatus, gen.created_at, entry.progress),
              url: nextUrl,
              updated_at: new Date().toISOString(),
              error_message: gen.error_message ?? entry.error_message ?? null,
            };
          });
          return { ...prev, extended_images: nextExtended };
        });
      } catch {
        // Ignore a single poll failure and retry on next interval.
      }
    };

    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.id, session?.extended_images]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setSession(null);
    setIsStreaming(false);
    setStreamingContent("");
    setError(null);
    setUploadingImage(false);
  }, []);

  const initSession = useCallback(async (opts?: { forceNew?: boolean }) => {
    const forceNew = opts?.forceNew ?? false;
    try {
      setError(null);

      // 1. 如果不是强制新建，优先尝试从缓存恢复上一个会话
      let cachedId = !forceNew ? localStorage.getItem("lastAgentSessionId") : null;
      if (cachedId) {
        try {
          const data = await getSession(cachedId);
          setSession(data);
          return;
        } catch (e) {
          localStorage.removeItem("lastAgentSessionId");
        }
      }

      // 2. 如果无缓存或加载失败，且非强制新建，则尝试恢复最近更新的会话
      if (!forceNew) {
        try {
          const sessions = await listSessionsApi();
          if (sessions && sessions.length > 0) {
            const sorted = [...sessions].sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );
            const latest = sorted[0];
            const data = await getSession(latest.id);
            setSession(data);
            localStorage.setItem("lastAgentSessionId", latest.id);
            return;
          }
        } catch (e) {
          // 忽略获取历史会话的错误，降级至直接新建
        }
      }

      // 3. 首次使用或强制新建，创建新会话
      const { session_id } = await createSession();
      setSession({
        id: session_id,
        user_id: "",
        status: "init",
        aspect_ratio: "1:1",
        resolution: "1k",
        clarify_messages: [],
        extended_images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      localStorage.setItem("lastAgentSessionId", session_id);
    } catch (e: any) {
      setError(e.message ?? "初始化会话失败");
    }
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      opts: {
        style_file_id?: string;
        layout_file_id?: string;
        subject_file_id?: string;
      } = {}
    ) => {
      if (!session) {
        setError("会话未初始化");
        return;
      }
      if (isStreaming) return;

      // 新消息发送 → 重置脏标记（新轮次对话开始，旧编辑语境失效）
      useDesignStore.getState().resetAllDirty();

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const reader = await startClarifyStream(session.id, {
          message,
          ...opts,
        });

        const decoder = new TextDecoder();
        let buffer = "";
        let sawDoneFrame = false;
        let isFirstChunk = true;

        while (!sawDoneFrame) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const raw = trimmed.slice(6);
            try {
              const frame: SseFrame = JSON.parse(raw);
              if ("done" in frame && frame.done) {
                setSession(frame.session);
                setStreamingContent("");
                sawDoneFrame = true;
                await reader.cancel();
                break;
              }

              if ("chunk" in frame) {
                setStreamingContent((prev) => prev + frame.chunk);
                if (isFirstChunk) {
                  setSession(frame.session);
                  isFirstChunk = false;
                }
              }
            } catch {
              // 忽略解析错误，继续
            }
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError(e.message ?? "对话请求失败");
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [session, isStreaming]
  );

  const triggerGenerate = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const updated = await generatePoster(session.id);
      setSession(updated);
    } catch (e: any) {
      setError(e.message ?? "触发生成失败");
    }
  }, [session]);

  const triggerEdit = useCallback(
    async (editDescription: string, subjectFileId: string, size: string, resolution: string) => {
      if (!session) return;
      try {
        setError(null);
        const updated = await editPoster(session.id, {
          edit_description: editDescription,
          subject_file_id: subjectFileId,
          size,
          resolution,
        });
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "提交修改失败");
      }
    },
    [session]
  );

  const triggerExtend = useCallback(
    async (ratios: string[], resolution?: string, baseImageUrl?: string) => {
      if (!session) return;
      try {
        setError(null);
        const updated = await extendPoster(session.id, {
          ratios,
          resolution,
          base_image_url: baseImageUrl,
        });
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "多尺寸延伸失败");
      }
    },
    [session]
  );

  const triggerRefreshStyles = useCallback(async () => {
    if (!session) return null;
    try {
      setError(null);
      const updated = await refreshStyles(session.id);
      setSession(updated);
      return updated;
    } catch (e: any) {
      setError(e.message ?? "刷新风格推荐失败");
      throw e;
    }
  }, [session]);

  const triggerRefreshLayouts = useCallback(async () => {
    if (!session) return null;
    try {
      setError(null);
      const updated = await refreshLayouts(session.id);
      setSession(updated);
      return updated;
    } catch (e: any) {
      setError(e.message ?? "刷新排版推荐失败");
      throw e;
    }
  }, [session]);

  const updateParams = useCallback(
    async (params: Parameters<typeof updateSession>[1]) => {
      if (!session) return;
      try {
        setError(null);
        const updated = await updateSession(session.id, params);
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "更新参数失败");
      }
    },
    [session]
  );

  const uploadReference = useCallback(
    async (
      file: File,
      type: "style" | "layout" | "subject" | "pdf_document" | "other",
      subjectType?: "subject" | "logo" | "other"
    ) => {
      if (!session) {
        setError("会话未初始化");
        return;
      }
      setError(null);
      setUploadingImage(true);
      try {
        let targetFile = file;
        if (type !== "pdf_document") {
          const prepared = await prepareReferenceFiles([file]);
          const maybeFile = prepared.files[0];
          if (!maybeFile) {
            throw new Error(prepared.notices[0] ?? "图片上传失败");
          }
          targetFile = maybeFile;
        } else {
          // pdf_document size/format validation
          if (file.size > 10 * 1024 * 1024) {
            throw new Error("PDF文档大小不能超过 10MB");
          }
          if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
            throw new Error("仅支持上传 PDF 格式的文档");
          }
        }
        const updated = await uploadReferenceImage(session.id, targetFile, type, subjectType);
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "文件上传失败");
      } finally {
        setUploadingImage(false);
      }
    },
    [session]
  );

  const removeReference = useCallback(
    async (type: "style" | "layout" | "subject" | "pdf_document") => {
      if (!session) return;
      setError(null);
      try {
        let updated;
        if (type === "pdf_document") {
          updated = await updateSession(session.id, {
            stream_a: {
              pdf_document_url: null,
              pdf_document_text: null,
              pdf_document_name: null,
              pdf_document_size: null,
            }
          });
        } else {
          if (!session.stream_b) return;
          const streamBUpdate: any = { ...session.stream_b };
          if (type === "style") {
            streamBUpdate.style_reference_image = null;
            streamBUpdate.reference_image = null;
          } else if (type === "layout") {
            streamBUpdate.layout_reference_image = null;
          } else if (type === "subject") {
            streamBUpdate.subject_reference_image = null;
            streamBUpdate.subject_reference_image_type = null;
            streamBUpdate.subject_materials = [];
          }
          updated = await updateSession(session.id, {
            stream_b: streamBUpdate,
          });
        }
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "移除图片失败");
      }
    },
    [session]
  );

  const removeMaterial = useCallback(
    async (materialId: string) => {
      if (!session || !session.stream_b) return;
      setError(null);
      try {
        const streamBUpdate: any = { ...session.stream_b };
        const materials = (streamBUpdate.subject_materials || []).filter(
          (m: any) => m.id !== materialId
        );
        streamBUpdate.subject_materials = materials;

        // 兼容单图槽位只保留真正的主体素材，避免 logo/其他素材误覆盖主体图。
        const latestSubjectMaterial = [...materials]
          .reverse()
          .find((m: any) => !m?.type || m.type === "subject");
        if (latestSubjectMaterial) {
          streamBUpdate.subject_reference_image = latestSubjectMaterial.url;
          streamBUpdate.subject_reference_image_type = latestSubjectMaterial.type ?? "subject";
        } else {
          streamBUpdate.subject_reference_image = null;
          streamBUpdate.subject_reference_image_type = null;
        }

        const updated = await updateSession(session.id, {
          stream_b: streamBUpdate,
        });
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "移除素材失败");
      }
    },
    [session]
  );

  const listSessions = useCallback(async () => {
    setError(null);
    try {
      return await listSessionsApi();
    } catch (e: any) {
      setError(e.message ?? "获取历史会话失败");
      return [];
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setError(null);
    try {
      const data = await getSession(sessionId);
      setSession(data);
    } catch (e: any) {
      setError(e.message ?? "加载会话失败");
    }
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      try {
        await deleteSessionApi(sessionId);
        if (session?.id === sessionId) {
          localStorage.removeItem("lastAgentSessionId");
          reset();
          await initSession();
        }
      } catch (e: any) {
        setError(e.message ?? "删除会话失败");
      }
    },
    [session, reset, initSession]
  );

  const deleteExtendedImage = useCallback(
    async (target: { id?: string; url: string }) => {
      if (!session) return;
      setError(null);
      try {
        const nextImages = (session.extended_images || []).filter((img) => {
          if (target.id) return img.id !== target.id && img.generation_id !== target.id;
          return img.url !== target.url;
        });
        const updated = await updateSession(session.id, {
          extended_images: nextImages,
        });
        setSession(updated);
      } catch (e: any) {
        setError(e.message ?? "删除延伸图失败");
      }
    },
    [session]
  );

  // 监听 session ID 变化，同步到 localStorage
  useEffect(() => {
    if (session?.id) {
      localStorage.setItem("lastAgentSessionId", session.id);
    }
  }, [session?.id]);

  // 组件卸载时中止流
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!session?.id || session.status !== "generating") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollSession = async () => {
      try {
        const latest = await getSession(session.id);
        if (cancelled) return;

        setSession((current) => {
          if (!current || current.id !== latest.id) return current;
          return latest;
        });

        if (latest.status === "generating") {
          timer = setTimeout(pollSession, 3000);
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(pollSession, 5000);
        }
      }
    };

    timer = setTimeout(pollSession, 3000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.id, session?.status]);

  return {
    session,
    isStreaming,
    streamingContent,
    error,
    uploadingImage,
    initSession,
    sendMessage,
    triggerGenerate,
    triggerEdit,
    triggerExtend,
    triggerRefreshStyles,
    triggerRefreshLayouts,
    updateParams,
    uploadReference,
    removeReference,
    removeMaterial,
    reset,
    listSessions,
    deleteSession,
    deleteExtendedImage,
    loadSession,
  };
}
