// features/agent/components/AgentWorkspace.tsx
// Agent 工作区主组件：左侧对话 + 右侧画布的分栏布局
// 在 workspace.tsx 的 Tab 切换中作为独立工作区渲染

import { useEffect, useMemo, useRef, useState } from "react";
import { ClarifyPanel } from "../panels/ClarifyPanel";
import { StyleSelector } from "../panels/StyleSelector";
import { LayoutSelector } from "../panels/LayoutSelector";
import { CopyEditor } from "../panels/CopyEditor";
import { ExportPanel } from "../panels/ExportPanel";
import { CanvasArea } from "./CanvasArea";
import { ExtendModal } from "./ExtendModal";
import type { ExtendModalHandle } from "./ExtendModal";
import { ResolutionExtendModal } from "./ResolutionExtendModal";
import type { ResolutionExtendModalHandle } from "./ResolutionExtendModal";
import { useAgentSession } from "../hooks";
import { useDesignStore } from "../design-store";
import { useDesignSync } from "../use-design-sync";
import { REFERENCE_INPUT_ACCEPT } from "../../../lib/reference-files";
import { extractKnownStyleSummary, parseSectionedMessage } from "../section-parser";
import { refreshCopy } from "../api";

export function AgentWorkspace() {
  const {
    session,
    isStreaming,
    streamingContent,
    uploadReference,
    uploadingImage,
    removeReference,
    removeMaterial,
    sendMessage,
    loadSession,
    listSessions,
    initSession,
    deleteSession,
    deleteSessions,
    reset,
    updateParams,
    triggerExtend,
    triggerEdit,
    deleteExtendedImage,
    triggerGenerate,
  } = useAgentSession();

  useDesignSync(session);

  const ds_active_ratio = useDesignStore((s) => s.active_ratio);
  const ds_active_resolution = useDesignStore((s) => s.active_resolution);
  const ds_copy_raw = useDesignStore((s) => s.copy_raw);
  const ds_setActiveRatio = useDesignStore((s) => s.setActiveRatio);
  const ds_setActiveResolution = useDesignStore((s) => s.setActiveResolution);
  const ds_setCopyRaw = useDesignStore((s) => s.setCopyRaw);
  const ds_setActiveStyle = useDesignStore((s) => s.setActiveStyle);
  const ds_setActiveLayout = useDesignStore((s) => s.setActiveLayout);

  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materialMenuRef = useRef<HTMLDivElement>(null);

  const [activeUploadType, setActiveUploadType] = useState<"style" | "layout" | "subject">("style");
  const [pendingSubjectType, setPendingSubjectType] = useState<"subject" | "logo" | "other">("subject");
  const [showMaterialMenu, setShowMaterialMenu] = useState(false);
  const [showPdfModePrompt, setShowPdfModePrompt] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const extendModalRef = useRef<ExtendModalHandle>(null);
  const resolutionModalRef = useRef<ResolutionExtendModalHandle>(null);

  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 未选中任何推荐时，「当前风格」优先展示最新一条 assistant 消息「已知：」的中文摘要
  const knownStyleSummary = useMemo(
    () => extractKnownStyleSummary(session?.clarify_messages ?? []),
    [session?.clarify_messages]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (materialMenuRef.current && !materialMenuRef.current.contains(event.target as Node)) {
        setShowMaterialMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 顶层导航广播 "pf:agent-history" / "pf:agent-newchat" 时，工作区响应打开历史 / 新建对话
  useEffect(() => {
    const handleTriggerHistory = () => setShowSessionHistory(true);
    const handleTriggerNew = () => handleNewChat();
    window.addEventListener("pf:agent-history", handleTriggerHistory);
    window.addEventListener("pf:agent-newchat", handleTriggerNew);
    return () => {
      window.removeEventListener("pf:agent-history", handleTriggerHistory);
      window.removeEventListener("pf:agent-newchat", handleTriggerNew);
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) {
      setPendingPdfFile(file);
      setShowPdfModePrompt(true);
    } else {
      await uploadReference(file, activeUploadType, activeUploadType === "subject" ? pendingSubjectType : undefined);
    }
  };

  const handlePdfModeChoice = async (mode: "document" | "image") => {
    if (!pendingPdfFile) return;
    setShowPdfModePrompt(false);
    if (mode === "document") {
      await uploadReference(pendingPdfFile, "pdf_document");
    } else {
      await uploadReference(pendingPdfFile, "other");
    }
    setPendingPdfFile(null);
  };

  useEffect(() => {
    initSession();
    return () => {
      reset();
      useDesignStore.setState({
        copy_raw: "",
        active_style: null,
        active_layout: null,
        active_ratio: "1:1",
        active_resolution: "1k",
        dirty_copy: false,
        confirmed_style_source: null,
        confirmed_style_id: null,
        confirmed_layout_source: null,
        confirmed_layout_id: null,
      });
    };
  }, []);

  // 当会话状态变为 prompting 且大模型输出流式已结束时，自动触发最终生图
  useEffect(() => {
    if (session && session.status === "prompting" && !isStreaming) {
      triggerGenerate();
    }
  }, [session?.status, isStreaming, triggerGenerate]);

  // 当会话生成完毕或失败时，恢复卡片可点击状态
  useEffect(() => {
    if (session?.status === "done" || session?.status === "review" || session?.status === "failed") {
      setConfirmed(false);
    }
  }, [session?.status]);

  const handleRefreshCopy = async (density: string, currentCopy: string): Promise<string> => {
    if (!session?.id) throw new Error("会话未初始化");
    const result = await refreshCopy(session.id, {
      density,
      current_copy: currentCopy,
    });
    return result.refreshed_copy;
  };

  const handleNewChat = () => {
    reset();
    useDesignStore.setState({
      copy_raw: "",
      active_style: null,
      active_layout: null,
      active_ratio: "1:1",
      active_resolution: "1k",
      dirty_copy: false,
      confirmed_style_source: null,
      confirmed_style_id: null,
      confirmed_layout_source: null,
      confirmed_layout_id: null,
    });
    initSession({ forceNew: true });
  };

  const fetchSessions = async () => {
    const list = await listSessions();
    setSessionsList(list);
  };

  useEffect(() => {
    if (showSessionHistory) fetchSessions();
  }, [showSessionHistory]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput("");
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpenExtendModal = (baseImageUrl?: string, ratio?: string) => {
    if (!session?.generation_id && (!session?.archived_images || session.archived_images.length === 0)) return;
    extendModalRef.current?.open(baseImageUrl, ratio);
  };

  const handleOpenResolutionModal = (baseImageUrl?: string, ratio?: string) => {
    if (!session?.generation_id && (!session?.archived_images || session.archived_images.length === 0)) return;
    resolutionModalRef.current?.open(baseImageUrl, ratio);
  };

  const isGenerating = session?.status === "generating";
  const messages = session?.clarify_messages ?? [];
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const parsedMsg = lastAssistantMsg ? parseSectionedMessage(lastAssistantMsg.content) : null;
  const textSection = parsedMsg?.sections.find((s) => s.key === "poster_text");

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <style>{`
        .generating-disabled button,
        .generating-disabled 
        .generating-disabled textarea,
        .generating-disabled a,
        .generating-disabled [role="button"] {
          pointer-events: none !important;
          cursor: not-allowed !important;
          opacity: 0.55 !important;
        }

        .confirmed-disabled button,
        .confirmed-disabled textarea,
        .confirmed-disabled a,
        .confirmed-disabled [role="button"] {
          pointer-events: none !important;
          cursor: not-allowed !important;
          opacity: 0.55 !important;
        }
      `}</style>

      {/* ── 左侧：画布区 ─────────────────────────────────────── */}
      <div style={{ flex: 3, overflow: "hidden", background: "#fbfaf7" }}>
        <CanvasArea
          session={session}
          isGenerating={isGenerating}
          onExtendClick={handleOpenExtendModal}
          onResolutionExtendClick={handleOpenResolutionModal}
          onDeleteExtendedImage={deleteExtendedImage}
          onGenerationCompleted={async () => {
            if (session) await loadSession(session.id);
          }}
          onRetryExtend={async (ratio, resolution) => {
            await triggerExtend([ratio], resolution);
          }}
          onSubmitEdit={async (message, subjectFileId, size, resolution) => {
            await triggerEdit(message, subjectFileId, size, resolution);
          }}
        />

      </div>

      {/* ── 右侧：对话区 ─────────────────────────────────────── */}
      <div
        className={session?.status === "generating" || confirmed ? "generating-disabled confirmed-disabled" : ""}
        style={{
          flex: 2,
          minWidth: 320,
          borderLeft: "1px solid rgba(55,53,47,0.09)",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          transition: "opacity 0.3s ease, filter 0.3s ease",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
          <ClarifyPanel
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            session={session}
            onSendMessage={sendMessage}
            setInput={setInput}
            updateParams={updateParams}
          />
          {(() => {
            const isPendingOrGenerating = session?.status === "prompting" || session?.status === "generating" || isGenerating;
            const shouldShowConfirmCard = session && ["clarifying", "prompting", "generating", "review", "done"].includes(session.status);
            if (shouldShowConfirmCard || confirmed) {
              return (
                <div
                  style={{
                    border: "1px solid rgba(55,53,47,0.09)",
                    borderRadius: 12,
                    padding: 16,
                    background: "#ffffff",
                    boxShadow: "0 4px 16px rgba(55,53,47,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    position: "relative",
                    pointerEvents: (isStreaming || isPendingOrGenerating || confirmed) ? "none" : "auto",
                    opacity: isPendingOrGenerating || confirmed ? 0.6 : 1,
                    filter: isPendingOrGenerating || confirmed ? "grayscale(100%)" : "none",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#37352f", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>✎</span> 信息确认卡片
                  </div>

                  <>
                    <CopyEditor
                      copyRaw={ds_copy_raw}
                      textSection={textSection}
                      isStreaming={isStreaming}
                      isGenerating={isGenerating}
                      onCopyChange={(copy) => ds_setCopyRaw(copy)}
                      onUpdateParams={updateParams}
                      onRefreshCopy={handleRefreshCopy}
                    />

                    <StyleSelector
                      hasStyleRef={!!session?.stream_b?.style_reference_image}
                      visualDescription={session?.stream_b?.visual_description || ""}
                      knownStyleSummary={knownStyleSummary}
                      onSelectStyle={async (rec, source) => {
                        ds_setActiveStyle(rec, source);
                        await updateParams({ stream_b: { visual_description: rec.visual_description } });
                      }}
                      onSelectTag={async (tag) => {
                        ds_setActiveStyle({ name: tag.name, visual_description: tag.prompt } as any, 'tag');
                        await updateParams({ stream_b: { visual_description: tag.prompt } });
                      }}
                      onSendMessage={sendMessage}
                    />

                    <LayoutSelector
                      hasLayoutRef={!!session?.stream_b?.layout_reference_image}
                      layoutDescription={session?.stream_a?.layout_notes || ""}
                      onSelectLayout={async (rec, source) => {
                        ds_setActiveLayout(rec, source);
                        await updateParams({ stream_a: { layout_notes: rec.description || rec.layout_notes } });
                      }}
                      onSelectTag={async (tag) => {
                        ds_setActiveLayout({ name: tag.name, description: tag.prompt } as any, 'tag');
                        await updateParams({ stream_a: { layout_notes: tag.prompt } });
                      }}
                      onSendMessage={sendMessage}
                    />

                    {(() => {
                      const otherMaterials = (session?.stream_b?.subject_materials || []).filter(
                        (m: any) => m.type === "other"
                      );
                      if (otherMaterials.length === 0) return null;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderTop: "1px solid rgba(55,53,47,0.06)" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#787774" }}>
                            其他参考图描述
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {otherMaterials.map((mat: any) => (
                              <div
                                key={mat.id}
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "flex-start",
                                  background: "rgba(55,53,47,0.02)",
                                  padding: 8,
                                  borderRadius: 6,
                                  border: "1px solid rgba(55,53,47,0.06)"
                                }}
                              >
                                <img
                                  src={mat.url}
                                  onClick={() => window.open(mat.url, "_blank")}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    objectFit: "cover",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    border: "1px solid rgba(55,53,47,0.08)"
                                  }}
                                  title="点击查看大图"
                                />
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: 10, fontWeight: 500, color: "#787774" }}>
                                      图片 ID: {mat.id.slice(-6)}
                                    </span>
                                    <button
                                      onClick={() => removeMaterial(mat.id)}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: "#e03e3e",
                                        cursor: "pointer",
                                        fontSize: 10,
                                        fontWeight: 500,
                                        padding: 0
                                      }}
                                    >
                                      移除
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    defaultValue={mat.description || ""}
                                    placeholder="输入图片描述..."
                                    onBlur={async (e) => {
                                      const newDesc = e.target.value;
                                      if (newDesc !== mat.description && session?.stream_b?.subject_materials) {
                                        const newMats = session.stream_b.subject_materials.map((m: any) =>
                                          m.id === mat.id ? { ...m, description: newDesc } : m
                                        );
                                        await updateParams({ stream_b: { subject_materials: newMats } });
                                      }
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "4px 6px",
                                      fontSize: 11,
                                      border: "1px solid rgba(55,53,47,0.16)",
                                      borderRadius: 4,
                                      color: "#37352f",
                                      background: "#fff"
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <ExportPanel
                      activeRatio={ds_active_ratio}
                      activeResolution={ds_active_resolution}
                      onRatioChange={async (r) => {
                        ds_setActiveRatio(r);
                        await updateParams({ aspect_ratio: r });
                      }}
                      onResolutionChange={async (res) => {
                        ds_setActiveResolution(res);
                        await updateParams({ resolution: res });
                      }}
                    />
                    
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, borderTop: "1px solid rgba(55,53,47,0.06)" }}>
                      <button
                        onClick={async () => {
                          // 防呆双保险：发送确认前，强行同步当前发光的配置
                          const activeStyle = useDesignStore.getState().active_style;
                          const activeLayout = useDesignStore.getState().active_layout;
                          
                          const paramsToUpdate: any = {};
                          if (activeStyle) {
                            paramsToUpdate.stream_b = { visual_description: activeStyle.visual_description };
                          }
                          if (activeLayout) {
                            paramsToUpdate.stream_a = { layout_notes: activeLayout.description || activeLayout.layout_notes };
                          }
                          
                          if (Object.keys(paramsToUpdate).length > 0) {
                            await updateParams(paramsToUpdate);
                          }

                          await sendMessage("确认，信息无误，请进入定稿阶段。");
                          setConfirmed(true);
                        }}
                        disabled={isStreaming || isPendingOrGenerating || confirmed}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          padding: "10px 20px",
                          background: "#37352f",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: (isStreaming || isPendingOrGenerating || confirmed) ? "not-allowed" : "pointer",
                          opacity: (isStreaming || isPendingOrGenerating || confirmed) ? 0.6 : 1,
                        }}
                      >
                        确认执行
                      </button>
                    </div>
                  </>
                  {session?.error_message && (
                      <div style={{ width: "100%", padding: "8px 12px", background: "rgba(224,62,62,0.06)", border: "1px solid rgba(224,62,62,0.2)", borderRadius: 6, fontSize: 12, color: "#e03e3e" }}>
                        {session.error_message || "未知绘图错误，请检查网络或重试。"}
                      </div>
                   )}
                </div>
              );
            }
          })()}

          <div ref={chatEndRef} />
        </div>

        {/* ── Chat Input Bar ── */}
        <div style={{ borderTop: "1px solid rgba(55,53,47,0.09)", background: "#fff", padding: "12px 16px" }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={REFERENCE_INPUT_ACCEPT}
            style={{ display: "none" }}
          />

          {session && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                paddingBottom: 10,
                borderBottom: "1px solid rgba(55,53,47,0.06)",
                marginBottom: 8,
                alignItems: "center",
                position: "relative"
              }}
            >
              {/* 1. 风格参考 */}
              {session.stream_b?.style_reference_image ? (
                <div
                  style={{
                    position: "relative",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid rgba(35, 131, 226, 0.35)",
                    background: "rgba(35, 131, 226, 0.08)",
                    cursor: "pointer",
                    overflow: "hidden"
                  }}
                  onClick={() => window.open(session.stream_b!.style_reference_image!, "_blank")}
                  title="点击查看大图"
                >
                  <img
                    src={session.stream_b.style_reference_image}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    alt="风格参考"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeReference("style");
                    }}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.6)",
                      border: "none",
                      color: "#fff",
                      fontSize: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0
                    }}
                    title="移除风格参考图"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setActiveUploadType("style");
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingImage || isStreaming || isGenerating}
                  style={{
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    borderRadius: 6,
                    border: "1px dashed rgba(55,53,47,0.16)",
                    background: "transparent",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#787774",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  + 风格参考
                </button>
              )}

              {/* 2. 排版参考 */}
              {session.stream_b?.layout_reference_image ? (
                <div
                  style={{
                    position: "relative",
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid rgba(139, 92, 246, 0.35)",
                    background: "rgba(139, 92, 246, 0.08)",
                    cursor: "pointer",
                    overflow: "hidden"
                  }}
                  onClick={() => window.open(session.stream_b!.layout_reference_image!, "_blank")}
                  title="点击查看大图"
                >
                  <img
                    src={session.stream_b.layout_reference_image}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    alt="排版参考"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeReference("layout");
                    }}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.6)",
                      border: "none",
                      color: "#fff",
                      fontSize: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0
                    }}
                    title="移除排版参考图"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setActiveUploadType("layout");
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingImage || isStreaming || isGenerating}
                  style={{
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    borderRadius: 6,
                    border: "1px dashed rgba(55,53,47,0.16)",
                    background: "transparent",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#787774",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  + 排版参考
                </button>
              )}

              {/* 3. 素材物料添加 */}
              {(() => {
                const materials = session.stream_b?.subject_materials || [];
                const hasMaterials = materials.length > 0 || !!session.stream_b?.subject_reference_image;
                const subjectMaterials = materials.filter((m: any) => m.type === "subject" || !m.type);
                const logoMaterials = materials.filter((m: any) => m.type === "logo");
                const otherMaterials = materials.filter((m: any) => m.type === "other");

                return (
                  <div ref={materialMenuRef} style={{ position: "relative", width: "100%" }}>
                    <button
                      onClick={() => setShowMaterialMenu((prev) => !prev)}
                      disabled={uploadingImage || isStreaming || isGenerating}
                      style={{
                        height: 32,
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        borderRadius: 6,
                        border: "1px dashed rgba(55,53,47,0.16)",
                        background: "transparent",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#787774",
                        cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      {!hasMaterials ? (
                        <>+ 素材上传</>
                      ) : (
                        <span style={{ color: "#37352f", fontWeight: 700 }}>
                          素材 ({materials.length + (session.stream_b?.subject_reference_image ? 1 : 0)})
                        </span>
                      )}
                    </button>

                    {showMaterialMenu && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "100%",
                          right: 0,
                          marginBottom: 8,
                          width: 220,
                          background: "#fff",
                          border: "1px solid rgba(55,53,47,0.12)",
                          borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(55,53,47,0.08)",
                          zIndex: 50,
                          padding: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4
                        }}
                      >
                        <button
                          onClick={() => {
                            setActiveUploadType("subject");
                            setPendingSubjectType("subject");
                            setShowMaterialMenu(false);
                            setTimeout(() => fileInputRef.current?.click(), 50);
                          }}
                          style={{
                            padding: "6px 8px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            fontSize: 12,
                            color: "#37352f",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span>+ 上传主体图片</span>
                          {subjectMaterials.length > 0 && (
                            <span style={{ fontSize: 10, color: "#8b5cf6" }}>({subjectMaterials.length})</span>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setActiveUploadType("subject");
                            setPendingSubjectType("logo");
                            setShowMaterialMenu(false);
                            setTimeout(() => fileInputRef.current?.click(), 50);
                          }}
                          style={{
                            padding: "6px 8px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            fontSize: 12,
                            color: "#37352f",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span>+ 上传品牌Logo</span>
                          {logoMaterials.length > 0 && (
                            <span style={{ fontSize: 10, color: "#8b5cf6" }}>({logoMaterials.length})</span>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setActiveUploadType("subject");
                            setPendingSubjectType("other");
                            setShowMaterialMenu(false);
                            setTimeout(() => fileInputRef.current?.click(), 50);
                          }}
                          style={{
                            padding: "6px 8px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            fontSize: 12,
                            color: "#37352f",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span>+ 上传其他参考图</span>
                          {otherMaterials.length > 0 && (
                            <span style={{ fontSize: 10, color: "#8b5cf6" }}>({otherMaterials.length})</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {showPdfModePrompt && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 2000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              onClick={() => {
                setShowPdfModePrompt(false);
                setPendingPdfFile(null);
              }}
            >
              <div
                style={{
                  width: 280,
                  background: "#fff",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#37352f", textAlign: "center" }}>
                  检测到上传的文件为 PDF 文档
                </div>
                <div style={{ fontSize: 11, color: "#787774", textAlign: "center", lineHeight: 1.4 }}>
                  请选择处理方式：
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handlePdfModeChoice("document")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: "rgba(55,53,47,0.06)",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "#37352f",
                      cursor: "pointer",
                      fontWeight: 600
                    }}
                  >
                    📖 提取文本
                  </button>
                  <button
                    onClick={() => handlePdfModeChoice("image")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: "#37352f",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 600
                    }}
                  >
                    🖼️ 首页转图
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#f7f6f3", border: "1px solid rgba(55,53,47,0.12)", borderRadius: 10, padding: "8px 12px" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? "AI 正在回复中…" : "描述你的海报需求，或回复 AI 的问题…"}
              disabled={isStreaming || !session}
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                lineHeight: "1.6",
                color: "#37352f",
                resize: "none",
                fontFamily: "inherit",
                maxHeight: 120,
                overflowY: "auto",
                padding: 0,
              }}
              onInput={(e) => {
                const target = e.currentTarget;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || !session}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: !input.trim() || isStreaming || !session ? "#d3d1cb" : "#37352f",
                border: "none",
                borderRadius: 6,
                cursor: !input.trim() || isStreaming || !session ? "not-allowed" : "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7h12M7 1l6 6-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {session && <ExtendModal ref={extendModalRef} session={session} onExtend={async (ratios, res, img) => await triggerExtend(ratios, res, img)} tasks={[]} />}
      {session && <ResolutionExtendModal ref={resolutionModalRef} session={session} onExtend={async (ratios, res, img) => await triggerExtend(ratios, res, img)} tasks={[]} />}

      {/* ── Session History Drawer ── */}
      {showSessionHistory && (
        <div 
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} 
          onClick={() => {
            setShowSessionHistory(false);
            setIsEditMode(false);
            setSelectedIds([]);
          }}
        >
          <div 
            style={{ width: 320, height: "100%", background: "#fff", display: "flex", flexDirection: "column", position: "relative" }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ borderBottom: "1px solid rgba(55,53,47,0.09)", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>AI 设计助理会话记录</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {sessionsList.length > 0 && (
                  <button 
                    onClick={() => {
                      if (isEditMode) {
                        setIsEditMode(false);
                        setSelectedIds([]);
                      } else {
                        setIsEditMode(true);
                        setSelectedIds([]);
                      }
                    }} 
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#787774", fontWeight: 600, padding: "4px 8px", borderRadius: 4 }}
                    className="hover:bg-black/5"
                  >
                    {isEditMode ? "取消" : "管理"}
                  </button>
                )}
                <button 
                  onClick={() => {
                    setShowSessionHistory(false);
                    setIsEditMode(false);
                    setSelectedIds([]);
                  }} 
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4 }}
                  className="hover:bg-black/5"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Batch Select Header (Edit Mode only) */}
            {isEditMode && sessionsList.length > 0 && (
              <div style={{ padding: "8px 16px", background: "#F7F6F3", borderBottom: "1px solid rgba(55,53,47,0.09)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#787774" }}>
                <label 
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
                  onClick={(e) => {
                    e.preventDefault();
                    const allSelected = selectedIds.length === sessionsList.length;
                    if (allSelected) {
                      setSelectedIds([]);
                    } else {
                      setSelectedIds(sessionsList.map(s => s.id));
                    }
                  }}
                >
                  <div 
                    style={{ 
                      width: 14, 
                      height: 14, 
                      border: "1.5px solid rgba(55, 53, 47, 0.16)", 
                      borderRadius: 3, 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      background: selectedIds.length === sessionsList.length ? "#37352F" : "#fff",
                      borderColor: selectedIds.length === sessionsList.length ? "#37352F" : "rgba(55, 53, 47, 0.16)"
                    }}
                  >
                    {selectedIds.length === sessionsList.length && (
                      <div style={{ width: 6, height: 6, background: "#fff", borderRadius: 1 }} />
                    )}
                  </div>
                  <span style={{ fontWeight: 500 }}>全选</span>
                </label>
                <span>{selectedIds.length > 0 ? `已选择 ${selectedIds.length} 项` : "未选择项目"}</span>
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {sessionsList.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9B9A97", fontSize: 12, padding: "40px 0" }}>
                  暂无历史会话记录
                </div>
              ) : (
                sessionsList.map((item) => {
                  const isActive = session?.id === item.id;
                  const isChecked = selectedIds.includes(item.id);

                  return (
                    <div 
                      key={item.id} 
                      onClick={async () => {
                        if (isEditMode) {
                          if (isChecked) {
                            setSelectedIds(prev => prev.filter(id => id !== item.id));
                          } else {
                            setSelectedIds(prev => [...prev, item.id]);
                          }
                        } else {
                          loadSession(item.id);
                          setShowSessionHistory(false);
                        }
                      }} 
                      style={{ 
                        padding: "10px", 
                        borderRadius: 8, 
                        border: isChecked || (isActive && !isEditMode) ? "1px solid #37352F" : "1px solid rgba(55,53,47,0.08)", 
                        marginBottom: 8, 
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        background: isChecked ? "rgba(55, 53, 47, 0.02)" : "#fff",
                        transition: "all 0.2s ease"
                      }}
                      className="group"
                    >
                      {/* Left Checkbox (Edit Mode only) */}
                      {isEditMode && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginRight: 8, width: 20 }}>
                          <div 
                            style={{ 
                              width: 14, 
                              height: 14, 
                              border: "1.5px solid rgba(55, 53, 47, 0.16)", 
                              borderRadius: 3, 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center",
                              background: isChecked ? "#37352F" : "#fff",
                              borderColor: isChecked ? "#37352F" : "rgba(55, 53, 47, 0.16)"
                            }}
                          >
                            {isChecked && (
                              <div style={{ width: 6, height: 6, background: "#fff", borderRadius: 1 }} />
                            )}
                          </div>
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.subject_description || "新会话"}
                        </div>
                        <div style={{ fontSize: 11, color: "#9b9a97", marginTop: 4 }}>
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                      </div>

                      {/* Right Single Delete Button (Standard Mode only, Hover to show) */}
                      {!isEditMode && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm("确定要删除此会话记录吗？")) {
                              await deleteSession(item.id);
                              await fetchSessions();
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "#9b9a97",
                            padding: 4,
                            marginLeft: 8,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#eb5757";
                            e.currentTarget.style.backgroundColor = "rgba(235, 87, 87, 0.08)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#9b9a97";
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                          title="删除会话"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Action Bar (Edit Mode only) */}
            {isEditMode && sessionsList.length > 0 && (
              <div style={{ borderTop: "1px solid rgba(55,53,47,0.09)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#787774" }}>
                  <span>已选择 <strong style={{ color: "#37352F" }}>{selectedIds.length}</strong> 项</span>
                  <span style={{ fontSize: 11, color: "#9B9A97" }}>删除后不可恢复</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button 
                    onClick={() => {
                      setIsEditMode(false);
                      setSelectedIds([]);
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(55,53,47,0.09)",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "center"
                    }}
                    className="hover:bg-black/5"
                  >
                    取消
                  </button>
                  <button 
                    onClick={async () => {
                      if (selectedIds.length === 0) return;
                      if (window.confirm(`确定要批量删除选中的 ${selectedIds.length} 个会话记录吗？`)) {
                        await deleteSessions(selectedIds);
                        await fetchSessions();
                        setIsEditMode(false);
                        setSelectedIds([]);
                      }
                    }}
                    disabled={selectedIds.length === 0}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #eb5757",
                      background: selectedIds.length === 0 ? "#F4C7C7" : "#eb5757",
                      borderColor: selectedIds.length === 0 ? "#F4C7C7" : "#eb5757",
                      color: "#fff",
                      cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "center"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedIds.length > 0) {
                        e.currentTarget.style.backgroundColor = "#D13F3F";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedIds.length > 0) {
                        e.currentTarget.style.backgroundColor = "#eb5757";
                      }
                    }}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
