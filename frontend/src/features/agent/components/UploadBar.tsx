// features/agent/components/UploadBar.tsx
// 上传栏组件：风格参考图、排版参考图、素材上传 UI 与 PDF 决策弹窗
// 自 AgentWorkspace.tsx 抽离，通过 props 接入 useAgentSession 的上传/移除钩子

import { useEffect, useRef, useState } from "react";
import { REFERENCE_INPUT_ACCEPT } from "../../../lib/reference-files";
import type { AgentSession } from "../types";

interface UploadBarProps {
  session: AgentSession | null;
  isStreaming: boolean;
  isGenerating: boolean;
  uploadingImage: boolean;
  uploadReference: (
    file: File,
    type: "style" | "layout" | "subject" | "pdf_document" | "other",
    subjectType?: "subject" | "logo" | "other"
  ) => Promise<void>;
  removeReference: (type: "style" | "layout" | "subject" | "pdf_document") => void;
  removeMaterial: (materialId: string) => void;
  updateParams: (params: any) => Promise<void>;
}

export function UploadBar({
  session,
  isStreaming,
  isGenerating,
  uploadingImage,
  uploadReference,
  removeReference,
  removeMaterial,
  updateParams,
}: UploadBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materialMenuRef = useRef<HTMLDivElement>(null);

  const [activeUploadType, setActiveUploadType] = useState<"style" | "layout" | "subject">("style");
  const [pendingSubjectType, setPendingSubjectType] = useState<"subject" | "logo" | "other">("subject");
  const [showMaterialMenu, setShowMaterialMenu] = useState(false);
  const [showPdfModePrompt, setShowPdfModePrompt] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);

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

  return (
    <>
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

                    <button
                      onClick={() => {
                        setActiveUploadType("subject");
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
                        borderTop: "1px solid rgba(55,53,47,0.06)",
                        marginTop: 4,
                        paddingTop: 8
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span>+ 上传 PDF 文档</span>
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
    </>
  );
}
