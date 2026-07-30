// features/agent/components/AgentWorkspace.tsx







// Agent 工作区主组件：左侧对话 + 右侧画布的分栏布局







// 在 workspace.tsx 的 Tab 切换中作为独立工作区渲染















import { useEffect, useRef, useState } from "react";







import type { CSSProperties } from "react";







import { ClarifyPanel } from "../panels/ClarifyPanel";
import { StyleSelector } from "../panels/StyleSelector";
import { LayoutSelector } from "../panels/LayoutSelector";







import { CanvasArea } from "./CanvasArea";







import { ExtendModal } from "./ExtendModal";
import type { ExtendModalHandle } from "./ExtendModal";







import { ResolutionExtendModal } from "./ResolutionExtendModal";
import type { ResolutionExtendModalHandle } from "./ResolutionExtendModal";
import type { PresetStyleTag } from "../data/preset-style-tags";
import type { PresetLayoutTag } from "../data/preset-layout-tags";







import { useAgentSession } from "../hooks";







import { RotateCcw, RotateCw, Trash2 } from "lucide-react";







import type { ClarifyMessage, StyleRecommendation, LayoutRecommendation } from "../types";



import { useDesignStore } from "../design-store";







import { REFERENCE_INPUT_ACCEPT } from "@/lib/reference-files";







import { refreshCopy } from "../api";







import {







  extractStyleRecommendations,







  extractLayoutRecommendations,







  parseSectionedMessage,







} from "../section-parser";















const DEFAULT_STYLE_RECS = [







  {







    index: 1,







    name: "极简日系",







    nameEn: "Minimal Japanese",







    description: "留白、中性色调与精准网格",







    visualDescription: "Minimal Japanese style, large negative space, soft neutral color palette, grid alignment, serene and restrained look",







  },







  {







    index: 2,







    name: "酸性赛博",







    nameEn: "Acid Cyberpunk",







    description: "霓虹撞色、镭射渐变与金属质感",







    visualDescription: "Acid cyberpunk style, high-saturation neon color clash, dark background, holographic laser gradient, glitch art texture, metallic finish",







  },







  {







    index: 3,







    name: "瑞士国际主义",







    nameEn: "Swiss International",







    description: "无衬线字体与几何色块分割",







    visualDescription: "Swiss International Typographic Style, sans-serif typography dominant, geometric color blocks, high-contrast monochrome with single accent color",







  },







  {







    index: 4,







    name: "复古胶片",







    nameEn: "Retro Film Grain",







    description: "温暖颗粒感与褪色复古调",







    visualDescription: "Retro film style, warm analog film grain, faded yellow and teal tones, natural cinematic lighting, vintage editorial layout",







  },







];















const DEFAULT_LAYOUT_RECS = [







  {







    index: 1,







    name: "中心对称均衡版式",







    description: "视觉居中，上下对称排列",







    layoutNotes: "中心对称均衡构图，文字上下分层对称排列",







  },







  {







    index: 2,







    name: "非对称黄金分割版式",







    description: "图文左右分割，错落层级",







    layoutNotes: "非对称黄金分割比例布局，图文错落有致",







  },







  {







    index: 3,







    name: "极简网格大留白版式",







    description: "严格网格对齐与大负空间",







    layoutNotes: "极简网格约束布局，文字严格对齐，大负空间",







  },







  {







    index: 4,







    name: "上下图文多栏版式",







    description: "上部主视觉，下部多栏文本",







    layoutNotes: "上下分割布局，下部多栏排列详细文本",







  },







];















const DEFAULT_LAYOUT_RECS_9_32 = [







  {







    index: 1,







    name: "多段故事信息流版式",







    description: "自上而下多层段落，引导深度阅读",







    layoutNotes: "多段故事信息流版式，自上而下多层段落，引导深度阅读",







  },







  {







    index: 2,







    name: "三段式产品卖点版式",







    description: "顶置焦点主图，中段分栏卖点解析，底置品牌签名",







    layoutNotes: "三段式产品卖点版式，顶置焦点主图，中段分栏卖点解析，底置品牌签名",







  },







  {







    index: 3,







    name: "纵向图文交错卡片版式",







    description: "图文卡片交错排列，结构清晰且呼吸感强",







    layoutNotes: "纵向图文交错卡片版式，图文卡片交错排列，结构清晰且呼吸感强",







  },







  {







    index: 4,







    name: "杂志级图文画册版式",







    description: "大字标题开篇，多栏网格并列，适合长篇幅说明",







    layoutNotes: "杂志级图文画册版式，大字标题开篇，多栏网格并列，适合长篇幅说明",







  },







];




























































interface Stage1Snapshot {
  copy: string;
  selectedStyle: StyleRecommendation | null;
  selectedLayout: LayoutRecommendation | null;
  aspect_ratio: string;
  resolution: string;
  styleRecommendations: StyleRecommendation[];
  layoutRecommendations: LayoutRecommendation[];
}























function splitLabelAndValue(line: string): { label: string; value: string } | null {







  const match = line.match(/^([^:：]+)[:：]\s*([\s\S]*)$/);







  if (!match) return null;







  const label = match[1].trim();







  if (label.length > 8 || label.includes("|") || label.includes("｜")) {







    return null;







  }







  return { label, value: match[2].trim() };







}















function splitPipeSegments(text: string): string[] {







  return text







    .split(/\s*[|｜]\s*/)







    .map((item) => item.trim())







    .filter(Boolean);







}















/** 自动伸展 textarea 高度 */







function autoResizeTextarea(el: HTMLTextAreaElement | null) {







  if (!el) return;







  el.style.height = "auto";







  el.style.height = el.scrollHeight + "px";







}















function getEffectiveLines(rawLines: string[], copyText?: string | null): string[] {







  if (!copyText) return rawLines;







  const copySegments = splitPipeSegments(copyText);







  let segmentIdx = 0;















  if (rawLines.length === 0) {







    return [copySegments.join(" | ")];







  }















  return rawLines.map((line, idx) => {







    const isLastLine = idx === rawLines.length - 1;







    const parsed = splitLabelAndValue(line);







    if (parsed) {







      const lineSegments = splitPipeSegments(parsed.value);







      const updatedLineSegments = lineSegments.map(() => {







        const val = copySegments[segmentIdx] ?? "";







        segmentIdx++;







        return val;







      });







      if (isLastLine && segmentIdx < copySegments.length) {







        updatedLineSegments.push(...copySegments.slice(segmentIdx));







        segmentIdx = copySegments.length;







      }







      return `${parsed.label}：${updatedLineSegments.join(" | ")}`;







    } else {







      const lineSegments = splitPipeSegments(line);







      const updatedLineSegments = lineSegments.map(() => {







        const val = copySegments[segmentIdx] ?? "";







        segmentIdx++;







        return val;







      });







      if (isLastLine && segmentIdx < copySegments.length) {







        updatedLineSegments.push(...copySegments.slice(segmentIdx));







        segmentIdx = copySegments.length;







      }







      return updatedLineSegments.join(" | ");







    }







  });







}















const MATERIAL_TINTS = {







  subject: {







    active: "radial-gradient(circle at 30% 28%, rgba(248,255,252,0.96) 0%, rgba(181,218,198,0.9) 38%, rgba(127,176,151,0.82) 100%)",







    border: "rgba(125,166,146,0.34)",







    glow: "rgba(146,191,168,0.22)",







  },







  logo: {







    active: "radial-gradient(circle at 30% 28%, rgba(248,252,255,0.96) 0%, rgba(175,196,227,0.9) 38%, rgba(119,149,194,0.82) 100%)",







    border: "rgba(121,149,190,0.34)",







    glow: "rgba(140,170,210,0.22)",







  },







  other: {







    active: "radial-gradient(circle at 30% 28%, rgba(252,249,255,0.96) 0%, rgba(193,181,220,0.88) 38%, rgba(141,126,181,0.8) 100%)",







    border: "rgba(140,128,173,0.34)",







    glow: "rgba(165,152,196,0.2)",







  },







  idle: {







    active: "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.9) 0%, rgba(235,235,233,0.92) 55%, rgba(210,210,207,0.94) 100%)",







    border: "rgba(55,53,47,0.08)",







    glow: "rgba(255,255,255,0.16)",







  },







} as const;















function getMaterialOrbStyle(kind: "subject" | "logo" | "other", isActive: boolean): CSSProperties {







  const tint = isActive ? MATERIAL_TINTS[kind] : MATERIAL_TINTS.idle;







  return {







    width: 9,







    height: 9,







    borderRadius: "50%",







    background: tint.active,







    border: `1px solid ${tint.border}`,







    boxShadow: [







      isActive ? `0 0 0 3px ${tint.glow}` : "0 0 0 0 rgba(0,0,0,0)",







      isActive ? `0 8px 18px ${tint.glow}` : "0 4px 8px rgba(55,53,47,0.05)",







      "inset 0 1px 0 rgba(255,255,255,0.78)",







      "inset 0 -2px 5px rgba(255,255,255,0.12)",







    ].join(", "),







    opacity: isActive ? 1 : 0.7,







  };







}























export function AgentWorkspace() {







  const {







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







    uploadReference,







    removeReference,







    removeMaterial,







    reset,







    updateParams: updateParamsRaw,







    deleteExtendedImage,







    deleteSession,







    loadSession,







    listSessions,







  } = useAgentSession();















  const isSavingCopyRef = useRef(false);















  const updateParams = async (params: any) => {







    const hasCopy = params?.stream_a?.copy !== undefined;







    if (hasCopy) {







      isSavingCopyRef.current = true;







    }







    try {







      await updateParamsRaw(params);







    } finally {







      if (hasCopy) {







        isSavingCopyRef.current = false;







      }







    }







  };















  const [input, setInput] = useState("");























  const extendModalRef = useRef<ExtendModalHandle>(null);







  const resolutionModalRef = useRef<ResolutionExtendModalHandle>(null);

































































  const [showSessionHistory, setShowSessionHistory] = useState(false);







  const [sessionsList, setSessionsList] = useState<any[]>([]);







  const [isBatchDeleteMode, setIsBatchDeleteMode] = useState(false);







  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());















  const [currentStage, setCurrentStage] = useState<1 | 2>(1);







  // ── DesignStore 订阅（单源真理） ──
  const ds_copy_raw = useDesignStore((s) => s.copy_raw);
  const ds_active_style = useDesignStore((s) => s.active_style);
  const ds_active_layout = useDesignStore((s) => s.active_layout);
  const ds_active_ratio = useDesignStore((s) => s.active_ratio);
  const ds_active_resolution = useDesignStore((s) => s.active_resolution);
  const ds_setCopyRaw = useDesignStore((s) => s.setCopyRaw);
  const ds_setActiveStyle = useDesignStore((s) => s.setActiveStyle);
  const ds_setActiveLayout = useDesignStore((s) => s.setActiveLayout);
  const ds_setActiveRatio = useDesignStore((s) => s.setActiveRatio);
  const ds_setActiveResolution = useDesignStore((s) => s.setActiveResolution);
  const ds_clearActiveStyle = useDesignStore((s) => s.clearActiveStyle);
  const ds_clearActiveLayout = useDesignStore((s) => s.clearActiveLayout);







  const [isCopyEditing, setIsCopyEditing] = useState(false);







  const [selectedDensity, setSelectedDensity] = useState<"疏" | "中" | "密">("中");







  const [isRefreshingCopy, setIsRefreshingCopy] = useState(false);







  const [stage1Snapshot, setStage1Snapshot] = useState<Stage1Snapshot | null>(null);







  const [isTransitioningToStage2, setIsTransitioningToStage2] = useState(false);







  const [isAutoGenerating, setIsAutoGenerating] = useState(false);







  const [copyHistory, setCopyHistory] = useState<Record<number, string>>({});







  // 用户手动新增的文案栏（尚未合并入 ds_copy_raw 的 pending 状态）







  const [pendingExtraCopyFields, setPendingExtraCopyFields] = useState<string[]>([]);















  // Automatically trigger generation after Stage 1 confirmation compiles







  useEffect(() => {







    if (isAutoGenerating && session && session.status === "prompting" && !isStreaming) {







      setIsAutoGenerating(false);







      triggerGenerate();







    }







  }, [session?.status, isStreaming, isAutoGenerating]);















  // Fix 4: Ref 记录"前置意图解析"捕获到的逐字文案，streaming 结束后强制覆盖以防 AI 错误输出覆盖







  const pendingVerbatimCopyRef = useRef<string | null>(null);















  // Fix 4: 当 streaming 结束时，若有 pendingVerbatimCopy，强制注入并清除 ref







  useEffect(() => {







    if (!isStreaming && pendingVerbatimCopyRef.current !== null) {







      const verbatim = pendingVerbatimCopyRef.current;







      pendingVerbatimCopyRef.current = null;







      ds_setCopyRaw(verbatim);







      // 同步回写到后端 session，确保 stream_a.copy 与卡片一致







      if (session?.id) {







        updateParams({ stream_a: { copy: verbatim } }).catch(() => {});







      }







    }







  }, [isStreaming]);















  // Sync isTransitioningToStage2 off when streaming ends or session enters generating/review/done/failed







  useEffect(() => {







    if (!isStreaming) {







      setIsTransitioningToStage2(false);







    }







    if (session && (session.status === "generating" || session.status === "review" ||
        session.status === "done" || session.status === "failed")) {







      setIsTransitioningToStage2(false);







    }







  }, [isStreaming, session?.status]);















  // Sync currentStage from session status







  useEffect(() => {







    if (session) {







      if (







        session.status === "init" ||







        session.status === "clarifying" ||







        session.status === "clarifying_strategy" ||







        session.status === "review" ||
        session.status === "generating" ||
        session.status === "done"







      ) {







        if (isTransitioningToStage2) {







          setCurrentStage(2);







        } else {







          setCurrentStage(1);







        }







      } else {







        setCurrentStage(2);







      }







    }







  }, [session?.id, session?.status, isTransitioningToStage2]);















  // Sync DesignStore from session, avoiding overwriting while user is editing copy







  useEffect(() => {







    if (session) {







      // 若有 pending verbatim copy（前置意图解析），不用 AI 回复覆盖







      if (pendingVerbatimCopyRef.current !== null) return;







      if (isSavingCopyRef.current) return;







      if (!isCopyEditing) {
          useDesignStore.setState({ copy_raw: session.stream_a?.copy ?? "" });
        }
        useDesignStore.setState({
          active_ratio: session.aspect_ratio ?? "1:1",
          active_resolution: session.resolution ?? "1k",
        });







    }







  }, [session, isCopyEditing]);















  // Reset style/layout selection on session switch







  useEffect(() => {







    if (session) {







      useDesignStore.setState({
        copy_raw: session.stream_a?.copy ?? "",
        active_style: null,
        active_layout: null,
        active_ratio: session.aspect_ratio ?? "1:1",
        active_resolution: session.resolution ?? "1k",
        dirty_copy: false,
        dirty_style_selection: false,
        dirty_layout_selection: false,
      });







      if (session.stream_a?.density) {







        setSelectedDensity(session.stream_a.density as "疏" | "中" | "密");







      } else {







        setSelectedDensity("中");







      }







      setStage1Snapshot(null);







      setPendingExtraCopyFields([]);























      setIsAutoGenerating(false);







    }







  }, [session?.id]);







  const activeExtendTasks = (session?.extended_images || []).filter(







    (item) => item.status && item.status !== "completed" && item.resolution !== "4k"







  );







  const activeResolutionTasks = (session?.extended_images || []).filter(







    (item) => item.status && item.status !== "completed" && item.resolution === "4k"







  );















  const chatEndRef = useRef<HTMLDivElement>(null);







  const inputRef = useRef<HTMLTextAreaElement>(null);







  const skipScrollRef = useRef(false);







  const [isRefreshingStyles, setIsRefreshingStyles] = useState(false);







  const [isRefreshingLayouts, setIsRefreshingLayouts] = useState(false);







  const styleTextareaRef = useRef<HTMLTextAreaElement>(null);







  const layoutTextareaRef = useRef<HTMLTextAreaElement>(null);







  const isStyleFocusedRef = useRef(false);







  const isLayoutFocusedRef = useRef(false);















  const handleRefreshStyles = async () => {







    skipScrollRef.current = true;







    setIsRefreshingStyles(true);







    try {







      const updatedSession = await triggerRefreshStyles();







      const styleRecs = updatedSession?.stream_b?.style_recommendations;







      if (styleRecs && stage1Snapshot) {







        setStage1Snapshot((prev) => {







          if (!prev) return null;







          return {







            ...prev,







            styleRecommendations: styleRecs,







          };







        });







      }







    } catch (e) {







      // 错误已由 hooks 内的 setError 捕获







    } finally {







      setIsRefreshingStyles(false);







    }







  };















  const handleRefreshLayouts = async () => {







    skipScrollRef.current = true;







    setIsRefreshingLayouts(true);







    try {







      const updatedSession = await triggerRefreshLayouts();







      const layoutRecs = updatedSession?.stream_a?.layout_recommendations;







      if (layoutRecs && stage1Snapshot) {







        setStage1Snapshot((prev) => {







          if (!prev) return null;







          return {







            ...prev,







            layoutRecommendations: layoutRecs,







          };







        });







      }







    } catch (e) {







      // 错误已由 hooks 内的 setError 捕获







    } finally {







      setIsRefreshingLayouts(false);







    }







  };















  const fetchSessions = async () => {







    const list = await listSessions();







    setSessionsList(list);







  };















  useEffect(() => {







    if (showSessionHistory) {







      fetchSessions();







    }







  }, [showSessionHistory]);















  const handleResolutionExtend = async (ratios: string[], res: string, baseImageUrl?: string) => {
    await triggerExtend(ratios, res, baseImageUrl);
  };















  useEffect(() => {







    if (session?.generation_id || (session?.archived_images && session.archived_images.length > 0)) return;







    extendModalRef.current?.close();
    resolutionModalRef.current?.close();







  }, [session?.generation_id, session?.archived_images]);















  const handleOpenExtendModal = (baseImageUrl?: string, ratio?: string) => {
    if (!session?.generation_id && (!session?.archived_images || session.archived_images.length === 0)) return;
    extendModalRef.current?.open(baseImageUrl, ratio);







  };















  const handleOpenResolutionModal = (baseImageUrl?: string, ratio?: string) => {
    if (!session?.generation_id && (!session?.archived_images || session.archived_images.length === 0)) return;
    resolutionModalRef.current?.open(baseImageUrl, ratio);







  };















  const [activeUploadType, setActiveUploadType] = useState<"style" | "layout" | "subject" | "pdf_document" | "other">("style");







  const [pendingSubjectType, setPendingSubjectType] = useState<"subject" | "logo" | "other">("subject");







  const [showMaterialMenu, setShowMaterialMenu] = useState(false);







  const [showPdfPreview, setShowPdfPreview] = useState(false);







  const [showPdfModePrompt, setShowPdfModePrompt] = useState(false);







  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);







  const fileInputRef = useRef<HTMLInputElement>(null);







  const materialMenuRef = useRef<HTMLDivElement>(null);







  const pdfModePromptRef = useRef<HTMLDivElement>(null);















  useEffect(() => {







    if (!showMaterialMenu) return;















    const handlePointerDown = (event: MouseEvent) => {







      const target = event.target as Node | null;







      if (!target) return;







      if (materialMenuRef.current?.contains(target)) return;







      setShowMaterialMenu(false);







    };















    document.addEventListener("mousedown", handlePointerDown);







    return () => document.removeEventListener("mousedown", handlePointerDown);







  }, [showMaterialMenu]);















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







    const file = pendingPdfFile;







    setShowPdfModePrompt(false);







    setPendingPdfFile(null);







    if (!file) return;







    if (mode === "document") {







      await uploadReference(file, "pdf_document");







    } else {







      await uploadReference(file, "other");







    }







  };















  // 初始化 session







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
        dirty_style_selection: false,
        dirty_layout_selection: false,
      });







    };







  }, []);















  const handleNewChat = () => {







    reset();







    useDesignStore.setState({
        copy_raw: "",
        active_style: null,
        active_layout: null,
        active_ratio: "1:1",
        active_resolution: "1k",
        dirty_copy: false,
        dirty_style_selection: false,
        dirty_layout_selection: false,
      });







    initSession({ forceNew: true });







  };















  // 自动滚动 to 最新消息







  useEffect(() => {







    if (skipScrollRef.current) {







      skipScrollRef.current = false;







      return;







    }







    // 强制自动滚动只在 clarifying 阶段且未在 Stage 2 载入流转中才允许触发，进入 Stage 2 / 定稿 / 生成时严禁强制滚屏。







    // 在整个第一阶段（Stage 1）的生命周期中，严格禁止执行任何自动滚动，以确保视口稳定性。







    if (







      currentStage === 1 ||







      session?.status === "prompting" ||







      session?.status === "generating" ||







      session?.status === "review" ||







      isTransitioningToStage2







    ) {







      return;







    }







    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });







  }, [session?.clarify_messages.length, isStreaming, streamingContent, session?.status, isTransitioningToStage2, currentStage]);















  /**







   * 客户端意图解析：检测"文案变更指令"，原封不动提取用户指定的目标文案。







   * 匹配模式：文案更改为X / 文案是X / 将文案改为X / 标题改为X 等







   * 返回提取到的文案字符串，未命中则返回 null。







   */







  const extractVerbatimCopyIntent = (msg: string): string | null => {







    const patterns = [







      // 文案更改为X / 文案改为X / 文案改成X / 文案设置为X / 文案写成X







      /(?:文案|copy|标题|slogan|副标题)\s*(?:更改为|改为|改成|设置为|写成|换成|修改为|更新为)\s*[：:]?\s*([\s\S]+)/i,







      // 将/把 文案/标题/copy 改为X / 设为X







      /(?:将|把)\s*(?:文案|copy|标题|slogan|副标题)\s*(?:改为|修改为|更改为|改成|设置为|换成|更新为)\s*[：:]?\s*([\s\S]+)/i,







      // 文案是X（直接定义）







      /^(?:文案|标题)\s*[是为:：]\s*([\s\S]+)/i,







      // 帮我把文案改成X







      /帮\s*(?:我|我把|把)\s*(?:文案|标题|copy)\s*(?:改|改为|改成|换成|修改为|更改为)\s*[：:]?\s*([\s\S]+)/i,







    ];







    for (const pattern of patterns) {







      const m = msg.match(pattern);







      if (m && m[1]) {







        const captured = m[1].trim().replace(/["""'']+$/, "").replace(/^["""'']+/, "");







        if (captured) {







          // Normalize line breaks to vertical pipes for card display segments







          const normalized = captured







            .split(/\r?\n/)







            .map((line) => line.trim())







            .filter(Boolean)







            .join(" | ");







          return normalized;







        }







      }







    }







    return null;







  };















  const handleSend = async () => {







    const msg = input.trim();







    if (!msg || isStreaming) return;







    setInput("");















    // Fix 3 + Fix 4: 前置意图解析 — 仅在非首轮会话（session 状态非 init）且命中"文案变更指令"时：







    // 1. 立即注入 ds_copy_raw（不等 AI 回复）







    // 2. 写入 ref，确保 streaming 结束后再次强制覆盖，防止 AI 错误输出反写







    if (session && session.status !== "init") {







      const verbatimCopy = extractVerbatimCopyIntent(msg);







      if (verbatimCopy !== null) {







        ds_setCopyRaw(verbatimCopy);







        pendingVerbatimCopyRef.current = verbatimCopy;







      }







    }















    await sendMessage(msg);







  };















  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {







    if (e.key === "Enter" && !e.shiftKey) {







      e.preventDefault();







      handleSend();







    }







  };















  const isGenerating = session?.status === "generating";















  const messages: ClarifyMessage[] = session?.clarify_messages ?? [];















  const getLatestAssistantContent = () => {







    if (isStreaming && streamingContent) {







      return streamingContent;







    }







    for (let i = messages.length - 1; i >= 0; i--) {







      const msg = messages[i];







      if (msg.role === "assistant") {







        const prev = messages[i - 1];







        const isRefresh = prev && prev.role === "user" && prev.content === "请重新推荐 4 种不同方向的海报设计风格方案供我选择。";







        if (isRefresh) {







          continue;







        }







        return msg.content;







      }







    }







    return "";







  };















  const activeContent = getLatestAssistantContent();







  const { sections } = parseSectionedMessage(activeContent);







  const visualSection = sections.find((s) => s.key === "visual");







  const textSection = sections.find((s) => s.key === "poster_text");







  const layoutSection = sections.find((s) => s.key === "layout_plan");















  const isFullPrompt = (val: string) => {







    if (!val) return false;







    return val.length > 30 && !/[\u4e00-\u9fa5]/.test(val);







  };















  const resolveFriendlyStyleName = (val: string) => {
    if (!val) return "";
    const recs = getStyleRecs();
    for (const rec of recs) {
      if (rec.visualDescription && val.toLowerCase().includes(rec.visualDescription.toLowerCase().trim())) {
        return rec.name;
      }
      if (rec.nameEn && val.toLowerCase().includes(rec.nameEn.toLowerCase().trim())) {
        return rec.name;
      }
    }
    if (!isFullPrompt(val)) return val;
    if (ds_active_style?.name) {
      return ds_active_style.name;
    }
    return "";
  };















  const getCurrentStyleName = () => {







    let rawName = null;







    if (visualSection) {







      const knownLine = visualSection.lines.find(







        (l) => l.startsWith("已知：") || l.startsWith("已知:")







      );







      if (knownLine) {







        const val = knownLine.replace(/^已知[:：]\s*/, "").trim();







        let cleaned = val.replace(/\s*\(.*?\)\s*/g, "").trim();







        cleaned = cleaned.replace(/^最终采用\s*/, "").trim();







        if (cleaned && cleaned !== "暂无" && cleaned !== "未提供" && cleaned !== "无") {







          rawName = cleaned;







        }







      }







    }







    if (!rawName && session?.stream_b?.style_reference_image) {







      rawName = "风格参考图";







    }







    if (rawName) {







      // 若整行含「暂无明确指定视觉风格」等无风格标志，直接返回 null







      const NO_STYLE_PATTERNS = [







        "暂无明确指定", "暂无风格", "未指定视觉风格", "无明确风格",







        "not provided", "not specified", "no style",







      ];







      if (NO_STYLE_PATTERNS.some(p => rawName!.toLowerCase().includes(p.toLowerCase()))) {







        return null;







      }







      // 分段过滤：排除主体物/产品/动物描述，只保留纯风格词







      // 规则：含关键词 → 排除；含中文且超过 15 字 → 排除







      const SUBJECT_KEYWORDS = [







        "主体物", "物料参考", "排版参考", "已上传", "主体为",







        "主体", "商品", "产品", "素材", "物料",







        "穿", "衣", "服", "款",







        "犬", "狗", "猫", "兔", "宠物", "毛",







        "参考图",







      ];







      const segments = rawName.split(/[，,。．;；\n|｜]/).map((s: string) => s.trim()).filter(Boolean);







      const validSegments = segments.filter((seg: string) => {







        const lower = seg.toLowerCase();







        const hasChinese = /[\u4e00-\u9fa5]/.test(seg);







        if (hasChinese && seg.length > 15) return false;







        return !SUBJECT_KEYWORDS.some(kw => lower.includes(kw));







      });







      if (validSegments.length > 0) {







        return validSegments[0];







      }







      return null;







    }







    return null;







  };















  const getCurrentLayoutName = () => {







    const hasLayoutRef = !!session?.stream_b?.layout_reference_image;







    const userMessages = session?.clarify_messages?.filter((m: any) => m.role === "user") || [];







    const isUserLayoutProvided = hasLayoutRef || userMessages.some((m: any) => {







      const content = m.content || "";







      const text = typeof content === "string" ? content : JSON.stringify(content);







      const layoutKeywords = ["排版", "版式", "布局", "对齐", "居中", "留白", "分栏", "网格", "构图", "左右分", "上下分", "图文"];







      return layoutKeywords.some(kw => text.includes(kw));







    });















    if (!isUserLayoutProvided) {







      return "未提供";







    }















    let rawName = null;







    if (layoutSection) {







      const globalLine = layoutSection.lines.find((l) => l.includes("全局布局"));







      if (globalLine) {







        const parts = globalLine.split(/\s*[|｜]\s*/);







        if (parts.length > 1) {







          const cleaned = parts[1].trim();







          if (cleaned && ["暂无", "未提供", "无要求", "待确认", "not provided"].every(kw => !cleaned.toLowerCase().includes(kw))) {







            rawName = cleaned;







          }







        }







        if (!rawName) {







          const cleaned = globalLine.replace(/^.*全局布局[:：]\s*/, "").trim();







          if (cleaned && ["暂无", "未提供", "无要求", "待确认", "not provided"].every(kw => !cleaned.toLowerCase().includes(kw))) {







            rawName = cleaned;







          }







        }







      }







    }







    if (!rawName && hasLayoutRef) {







      rawName = "排版参考图";







    }







    if (rawName) {







      const firstSegment = rawName.split(/[，,。．;；\n|｜]/)[0].trim();







      return firstSegment || rawName;







    }







    return "未提供";







  };















  useEffect(() => {







    if (session && styleTextareaRef.current && !isStyleFocusedRef.current) {







      const hasStyleRef = !!session?.stream_b?.style_reference_image;







      // @ts-ignore
      const currentStyleName = getCurrentStyleName();







      const rawVal = hasStyleRef ? "风格参考图" : (session?.stream_b?.visual_description || "");







      const friendlyVal = hasStyleRef ? "风格参考图" : resolveFriendlyStyleName(rawVal);







      const isNoStyle = ["not-provided", "not provided", "未提供", "暂无", "无", "暂无明确指定视觉风格"].some(kw => friendlyVal.trim().toLowerCase().includes(kw)) || !friendlyVal;
      const isCurrentActive = !ds_active_style;
      const styleVal = !isCurrentActive ? "" : (isNoStyle ? "" : friendlyVal);







      styleTextareaRef.current.value = styleVal;







      styleTextareaRef.current.style.height = "auto";







      styleTextareaRef.current.style.height = styleTextareaRef.current.scrollHeight + "px";







    }







  }, [session?.stream_b?.visual_description, session?.clarify_messages, session?.stream_b?.style_reference_image, ds_active_style]);















  useEffect(() => {







    if (session && layoutTextareaRef.current && !isLayoutFocusedRef.current) {







      const hasLayoutRef = !!session?.stream_b?.layout_reference_image;







      // @ts-ignore
      const currentLayoutName = getCurrentLayoutName();







      const rawLayoutVal = hasLayoutRef ? "排版参考图" : (session?.stream_a?.layout_notes || "");







      const isNoLayout = ["not-provided", "not provided", "未提供", "暂无", "无", "暂无具体排版要求"].some(kw => rawLayoutVal.toLowerCase().includes(kw)) || !rawLayoutVal;
      const isCurrentLayoutActive = !ds_active_layout;
                                 const layoutVal = !isCurrentLayoutActive ? "" : (isNoLayout ? "" : rawLayoutVal);







      layoutTextareaRef.current.value = layoutVal;







      layoutTextareaRef.current.style.height = "auto";







      layoutTextareaRef.current.style.height = layoutTextareaRef.current.scrollHeight + "px";







    }







  }, [session?.stream_a?.layout_notes, session?.clarify_messages, session?.stream_b?.layout_reference_image, ds_active_layout]);















  const checkShouldShowCurrentLayout = () => {







    return true;







  };















  // 风格推荐三级提取与归一化策略







  const getStyleRecs = () => {







    let rawList: any[] = [];







    if (stage1Snapshot) {







      rawList = stage1Snapshot.styleRecommendations;







    } else if (session?.stream_b?.style_recommendations && session.stream_b.style_recommendations.length > 0) {







      rawList = session.stream_b.style_recommendations;







    } else {







      const firstAsst = messages.find((m) => m.role === "assistant");







      if (firstAsst) {







        const parsed = parseSectionedMessage(firstAsst.content);







        const vis = parsed.sections.find((s) => s.key === "visual");







        if (vis) {







          rawList = extractStyleRecommendations(vis.lines);







        }







      }







    }















    if (rawList.length === 0) {







      rawList = DEFAULT_STYLE_RECS;







    }















    // 从助手第一条消息的文本中解析提取中文风格介绍，用于匹配和修正







    const textRecommendations: any[] = [];







    const firstAsst = messages.find((m) => m.role === "assistant");







    if (firstAsst) {







      const parsed = parseSectionedMessage(firstAsst.content);







      const vis = parsed.sections.find((s) => s.key === "visual");







      if (vis) {







        textRecommendations.push(...extractStyleRecommendations(vis.lines));







      }







    }















    return rawList.map((item: any) => {







      const matchedTextRec = textRecommendations.find((tr) => tr.index === item.index);







      const chineseDesc = matchedTextRec?.description || "";







      return {







        index: item.index,







        name: item.name,







        nameEn: item.nameEn || item.name_en || "",







        description: chineseDesc || item.description || item.visual_description || item.visualDescription || "",







        visualDescription: item.visualDescription || item.visual_description || "",
        visual_description: item.visual_description || item.visualDescription || "",
        name_en: item.name_en || item.nameEn || "",







      };







    });







  };















  // 排版推荐三级提取与归一化策略







  const getLayoutRecs = () => {







    let rawList: any[] = [];







    if (stage1Snapshot) {







      rawList = stage1Snapshot.layoutRecommendations;







    } else if (session?.stream_a?.layout_recommendations && session.stream_a.layout_recommendations.length > 0) {







      rawList = session.stream_a.layout_recommendations;







    } else {







      const firstAsst = messages.find((m) => m.role === "assistant");







      if (firstAsst) {







        const parsed = parseSectionedMessage(firstAsst.content);







        const lay = parsed.sections.find((s) => s.key === "layout_plan");







        if (lay) {







          rawList = extractLayoutRecommendations(lay.lines);







        }







      }







    }















    const currentRatio = ds_active_ratio || session?.aspect_ratio || "1:1";







    const is932 = currentRatio === "9:32";















    const isList932Oriented = (list: any[]) => {







      if (!list || list.length === 0) return false;







      return list.some((item) =>







        item.name?.includes("多段故事") ||







        item.name?.includes("三段式") ||







        item.name?.includes("纵向图文") ||







        item.name?.includes("杂志级")







      );







    };















    const isListStandardOriented = (list: any[]) => {







      if (!list || list.length === 0) return false;







      return list.some((item) =>







        item.name?.includes("中心对称") ||







        item.name?.includes("非对称") ||







        item.name?.includes("极简网格") ||







        item.name?.includes("上下图文")







      );







    };















    if (is932) {







      if (rawList.length === 0 || isListStandardOriented(rawList)) {







        rawList = DEFAULT_LAYOUT_RECS_9_32;







      }







    } else {







      if (rawList.length === 0 || isList932Oriented(rawList)) {







        rawList = DEFAULT_LAYOUT_RECS;







      }







    }















    // 从助手第一条消息的文本中解析提取中文排版介绍，用于匹配和修正







    const textRecommendations: any[] = [];







    const firstAsst = messages.find((m) => m.role === "assistant");







    if (firstAsst) {







      const parsed = parseSectionedMessage(firstAsst.content);







      const lay = parsed.sections.find((s) => s.key === "layout_plan");







      if (lay) {







        textRecommendations.push(...extractLayoutRecommendations(lay.lines));







      }







    }















    return rawList.map((item: any) => {







      const matchedTextRec = textRecommendations.find((tr) => tr.index === item.index);







      const chineseDesc = matchedTextRec?.description || "";







      return {







        index: item.index,







        name: item.name,







        description: chineseDesc || item.description || item.layout_notes || item.layoutNotes || "",







        layoutNotes: item.layoutNotes || item.layout_notes || "",
        layout_notes: item.layout_notes || item.layoutNotes || "",
        name_en: item.name_en || item.nameEn || "",







      };







    });







  };















  const hasAssistantResponse = messages.some((m) => m.role === "assistant") || (isStreaming && !!streamingContent);















  // 第一次确认：直接 PATCH 同步参数并切入 prompting 阶段，消除冗余流式对话，实现秒级触发绘图







  const handleConfirmFirst = async () => {







    setIsAutoGenerating(true);







    setIsTransitioningToStage2(true);







    skipScrollRef.current = true;















    const styleRecs = getStyleRecs();







    const layoutRecs = getLayoutRecs();







    const shouldShowCurrentLayout = checkShouldShowCurrentLayout();















    let selectedLayout = ds_active_layout;







    if (!shouldShowCurrentLayout && !selectedLayout && layoutRecs.length > 0) {







      selectedLayout = layoutRecs[0];







    }















    // 记录第一阶段的选择与推荐列表快照







    setStage1Snapshot({







      copy: ds_copy_raw,







      selectedStyle: ds_active_style,







      selectedLayout: selectedLayout,







      aspect_ratio: ds_active_ratio,







      resolution: ds_active_resolution,







      styleRecommendations: styleRecs,







      layoutRecommendations: layoutRecs,







    });















    const updatePayload: any = {







      status: "prompting",







      stream_a: {







        copy: ds_copy_raw,







        density: selectedDensity,







      },







      stream_b: {}







    };















    if (ds_active_style) {







      updatePayload.stream_b.visual_description = ds_active_style.visual_description || ds_active_style.description || "";







    }















    if (selectedLayout) {







      updatePayload.stream_a.layout_notes = selectedLayout.layout_notes || selectedLayout.description || "";







      updatePayload.stream_a.layout_prompt = selectedLayout.layout_notes || selectedLayout.description || "";







    }















    await updateParams(updatePayload);















    ds_clearActiveStyle();
    ds_clearActiveLayout();







  };















  const handleExtend = async (ratios: string[], resolution?: "2k" | "4k", baseImageUrl?: string) => {
    await triggerExtend(ratios, resolution, baseImageUrl);
  };























  const handleSelectStyle = (rec: StyleRecommendation) => {







    if (ds_active_style?.index === rec.index && ds_active_style?.name === rec.name) {
      ds_clearActiveStyle();
    } else {
      ds_setActiveStyle(rec);
    }







  };















  const handleSelectTag = (tag: PresetStyleTag) => {
    const isSelected = ds_active_style?.name === tag.name;
    if (isSelected) {
      ds_clearActiveStyle();
    } else {
      const item: StyleRecommendation = {
        index: 99,
        name: tag.name,
        name_en: tag.name,
        visual_description: tag.prompt,
        description: tag.prompt,
      };
      ds_setActiveStyle(item);
      if (styleTextareaRef.current) {
        styleTextareaRef.current.value = tag.prompt;
      }
      updateParams({
        stream_b: { visual_description: tag.prompt },
      });
    }
  };

  const handleSelectLayoutTag = (tag: PresetLayoutTag) => {
    const isSelected = ds_active_layout?.name === `[标签] ${tag.name}` || ds_active_layout?.name === tag.name;
    if (isSelected) {
      ds_clearActiveLayout();
    } else {
      const item: LayoutRecommendation = {
        index: -1,
        name: `[标签] ${tag.name}`,
        description: tag.prompt,
        layout_notes: tag.prompt,
      };
      ds_setActiveLayout(item);
      if (layoutTextareaRef.current) {
        layoutTextareaRef.current.value = tag.prompt;
      }
      updateParams({
        stream_a: { layout_notes: tag.prompt },
      });
    }
  };















  const handleSelectLayout = (rec: LayoutRecommendation) => {







    if (ds_active_layout?.index === rec.index && ds_active_layout?.name === rec.name) {
      ds_clearActiveLayout();
    } else {
      ds_setActiveLayout(rec);
    }







  };















  const handleRefreshCopy = async () => {







    if (!session || isStreaming || isGenerating || isRefreshingCopy) return;







    setIsRefreshingCopy(true);







    try {







      let selectedStyleName = "";







      let selectedStyleDesc = "";







      if (ds_active_style) {







        selectedStyleName = ds_active_style.name;







        const recs = getStyleRecs();







        const found = recs.find((r) => r.index === ds_active_style?.index);







        if (found) {







          selectedStyleDesc = found.description || found.visualDescription || "";







        }







      }















      const res = await refreshCopy(session.id, {







        density: selectedDensity,







        current_copy: ds_copy_raw,







        selected_style_name: selectedStyleName || undefined,







        selected_style_desc: selectedStyleDesc || undefined,







      });















      // Update local state copy







      ds_setCopyRaw(res.refreshed_copy);







      setIsCopyEditing(false); // Disable copy editing state















      // Refetch session so that layout plan and canvas updates automatically in the UI







      await loadSession(session.id);







    } catch (e: any) {







      console.error("文案刷新失败:", e);







      alert(e.message || "文案刷新失败");







    } finally {







      setIsRefreshingCopy(false);







    }







  };















  const handleUndoCopy = async (







    globalSegIdx: number,







    lineIdx: number,







    segmentIdx: number







  ) => {







    if (!session || isStreaming || isGenerating) return;







    const originalVal = copyHistory[globalSegIdx];







    if (originalVal === undefined) return;















    // Remove from history







    setCopyHistory((prev) => {







      const next = { ...prev };







      delete next[globalSegIdx];







      return next;







    });















    // Reconstruct copy string replacing segment with originalVal







    let rawCopyLines = textSection







      ? textSection.lines.filter((line) => !/^\s*🎨\s*风格推荐\s*[:：]/.test(line) && !/^\s*📐\s*排版推荐\s*[:：]/.test(line))







      : ["真实文案："];







    if (rawCopyLines.length > 1 && (rawCopyLines[0] === "真实文案：" || rawCopyLines[0] === "真实文案:")) {







      rawCopyLines = rawCopyLines.slice(1);







    }







    const effectiveLines = getEffectiveLines(rawCopyLines, ds_copy_raw);















    let counter = 0;







    const nextLines = effectiveLines.map((line, lIdx) => {







      const parsed = splitLabelAndValue(line);







      const segments = splitPipeSegments(parsed?.value ?? line);







      const updatedSegments = segments.map((seg, sIdx) => {







        const isTarget = lIdx === lineIdx && sIdx === segmentIdx;







        const val = isTarget ? originalVal : seg;







        counter++;







        return val;







      });







      if (parsed) {







        return `${parsed.label}：${updatedSegments.join(" | ")}`;







      }







      return updatedSegments.join(" | ");







    });















    const allSegments: string[] = [];







    nextLines.forEach((l) => {







      const p = splitLabelAndValue(l);







      const segments = splitPipeSegments(p?.value ?? l);







      allSegments.push(...segments);







    });







    const newCopyStr = allSegments.join(" | ");















    ds_setCopyRaw(newCopyStr);















    // Synchronize immediately to backend







    await updateParams({







      stream_a: {







        copy: newCopyStr,







      },







    });







  };















  return (







    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      
      <style>{`
        .generating-disabled button,
        .generating-disabled input,
        .generating-disabled textarea,
        .generating-disabled a,
        .generating-disabled [role="button"],
        .generating-disabled .cursor-pointer,
        .generating-disabled [class*="cursor-pointer"],
        .generating-disabled [style*="cursor"] {
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







            if (session) {







              await loadSession(session.id);







            }







          }}







          onRetryExtend={async (ratio, resolution) => {







            await triggerExtend([ratio], resolution);







          }}
          onSubmitEdit={async (message, subjectFileId, size, resolution) => {
            await triggerEdit(message, subjectFileId, size, resolution);
          }}







        />







        {/* 注册自定义事件以便 TopNav 调用会话历史和新建会话 */}







        {(() => {







          // eslint-disable-next-line react-hooks/rules-of-hooks







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







          return null;







        })()}







      </div>















      {/* ── 右侧：对话区 ─────────────────────────────────────── */}







      <div
        className={session?.status === "generating" ? "generating-disabled" : ""}







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

          {/* ── 统一双层卡片状态机工作流 ── */}







          {session && hasAssistantResponse && session.status !== "clarifying_strategy" && (







            <div







              style={{







                marginTop: 16,







                marginBottom: 16,







                display: "flex",







                flexDirection: "column",







                gap: 12,







              }}







            >







              {currentStage === 1 ? (







                /* Stage 1 Card */







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







                    transition: "all 0.3s ease-in-out",







                    position: "relative",







                    overflow: "hidden",







                    pointerEvents: isStreaming ? "none" : "auto",







                  }}







                >







                  {/* 原地局部层叠加载反馈 */}







                  {isStreaming && (







                    <div







                      style={{







                        position: "absolute",







                        inset: 0,







                        background: "rgba(255, 255, 255, 0.96)",







                        display: "flex",







                        alignItems: "center",







                        justifyContent: "center",







                        gap: 10,







                        zIndex: 10,







                        animation: "fadeIn 0.2s ease-in-out",







                      }}







                    >







                      <span







                        style={{







                          display: "inline-block",







                          width: 16,







                          height: 16,







                          border: "2px solid rgba(55,53,47,0.12)",







                          borderTopColor: "#37352f",







                          borderRadius: "50%",







                          animation: "spin 0.75s linear infinite",







                          flexShrink: 0,







                        }}







                      />







                      <span style={{ fontSize: 13, color: "#787774" }}>







                        正在为您梳理需求并提炼海报信息...







                      </span>







                    </div>







                  )}







                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>







                    <div style={{ fontSize: 14, fontWeight: 700, color: "#37352f", display: "flex", alignItems: "center", gap: 6 }}>







                      <span>✎</span> 第一层：信息确认卡片







                    </div>














                  </div>















                  {/* 1. 真实文案编辑区 */}







                  <div>







                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>







                      <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", textTransform: "uppercase", letterSpacing: "0.05em" }}>







                        海报印刷文案







                      </div>







                      







                      {/* Notion 风格胶囊段落选择器 & 刷新按钮 */}







                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>







                        {/* Segmented capsule track */}







                        <div







                          style={{







                            display: "flex",







                            background: "rgba(55, 53, 47, 0.06)",







                            padding: 2,







                            borderRadius: 9999,







                            alignItems: "center",







                          }}







                        >







                          {(["疏", "中", "密"] as const).map((d) => {







                            const isSelected = selectedDensity === d;







                            return (







                              <button







                                key={d}







                                onClick={() => setSelectedDensity(d)}







                                style={{







                                  padding: "3px 10px",







                                  fontSize: 11,







                                  fontWeight: isSelected ? 600 : 500,







                                  color: isSelected ? "#37352f" : "#6b6a67",







                                  background: isSelected ? "#ffffff" : "transparent",







                                  borderRadius: 9999,







                                  border: "none",







                                  cursor: "pointer",







                                  boxShadow: isSelected ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",







                                  transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",







                                  outline: "none",







                                }}







                              >







                                {d}







                              </button>







                            );







                          })}







                        </div>















                        {/* 刷新按钮 */}







                        <button







                          onClick={handleRefreshCopy}







                          disabled={isRefreshingCopy || isStreaming || isGenerating}







                          style={{







                            display: "flex",







                            alignItems: "center",







                            gap: 4,







                            padding: "4px 12px",







                            fontSize: 11,







                            fontWeight: 600,







                            color: isRefreshingCopy ? "#9b9a97" : "#37352f",







                            background: "#ffffff",







                            border: "1px solid rgba(55, 53, 47, 0.15)",







                            borderRadius: 9999,







                            cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",







                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",







                            transition: "all 0.15s ease",







                            outline: "none",







                          }}







                          onMouseEnter={(e) => {







                            if (!isRefreshingCopy && !isStreaming && !isGenerating) {







                              e.currentTarget.style.background = "rgba(55, 53, 47, 0.04)";







                            }







                          }}







                          onMouseLeave={(e) => {







                            if (!isRefreshingCopy && !isStreaming && !isGenerating) {







                              e.currentTarget.style.background = "#ffffff";







                            }







                          }}







                        >







                          <RotateCw







                            size={12}







                            style={{







                              animation: isRefreshingCopy ? "spin 1s linear infinite" : "none",







                              transition: "transform 0.15s ease",







                            }}







                          />







                          文案刷新







                        </button>







                      </div>







                    </div>







                    {(() => {







                      let rawCopyLines = textSection







                        ? textSection.lines.filter((line) => !/^\s*🎨\s*风格推荐\s*[:：]/.test(line) && !/^\s*📐\s*排版推荐\s*[:：]/.test(line))







                        : ["真实文案："];







                      if (rawCopyLines.length > 1 && (rawCopyLines[0] === "真实文案：" || rawCopyLines[0] === "真实文案:")) {







                        rawCopyLines = rawCopyLines.slice(1);







                      }







                      const effectiveLines = getEffectiveLines(rawCopyLines, ds_copy_raw);















                      const handleSegmentChange = (lineIdx: number, segmentIdx: number, newValue: string) => {







                        const nextLines = [...effectiveLines];







                        const line = nextLines[lineIdx];







                        const parsed = splitLabelAndValue(line);







                        if (parsed) {







                          const segments = splitPipeSegments(parsed.value);







                          segments[segmentIdx] = newValue;







                          nextLines[lineIdx] = `${parsed.label}：${segments.join(" | ")}`;







                        } else {







                          const segments = splitPipeSegments(line);







                          segments[segmentIdx] = newValue;







                          nextLines[lineIdx] = segments.join(" | ");







                        }







                        const allSegments: string[] = [];







                        nextLines.forEach((l) => {







                          const p = splitLabelAndValue(l);







                          const segments = splitPipeSegments(p?.value ?? l);







                          allSegments.push(...segments);







                        });







                        ds_setCopyRaw(allSegments.join(" | "));







                      };















                      const handleBlur = () => {







                        setIsCopyEditing(false);







                        updateParams({







                          stream_a: {







                            copy: ds_copy_raw,







                          },







                        });







                      };















                      const handleRemoveSegment = (lineIdx: number, segmentIdx: number) => {







                        const nextLines = [...effectiveLines];







                        const line = nextLines[lineIdx];







                        const parsed = splitLabelAndValue(line);







                        







                        let currentSegments: string[] = [];







                        if (parsed) {







                          currentSegments = splitPipeSegments(parsed.value);







                        } else {







                          currentSegments = splitPipeSegments(line);







                        }







                        







                        // 移除该项







                        currentSegments = currentSegments.filter((_, idx) => idx !== segmentIdx);







                        







                        // 如果这一行的切片被删空了，将这一行整体从行列表中剔除







                        if (currentSegments.length === 0) {







                          nextLines.splice(lineIdx, 1);







                        } else {







                          if (parsed) {







                            nextLines[lineIdx] = `${parsed.label}：${currentSegments.join(" | ")}`;







                          } else {







                            nextLines[lineIdx] = currentSegments.join(" | ");







                          }







                        }







                        







                        const allSegments: string[] = [];







                        nextLines.forEach((l) => {







                          const p = splitLabelAndValue(l);







                          const segments = splitPipeSegments(p?.value ?? l);







                          allSegments.push(...segments);







                        });







                        







                        const newCopyStr = allSegments.join(" | ");







                        ds_setCopyRaw(newCopyStr);







                        updateParams({







                          stream_a: {







                            copy: newCopyStr,







                          },







                        });







                      };















                      return (







                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>







                          {isRefreshingCopy ? (







                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>







                              {[1, 2, 3, 4, 5, 6].map((i) => (







                                <div







                                  key={i}







                                  style={{







                                    display: "flex",







                                    alignItems: "center",







                                    gap: 8,







                                    padding: "10px 12px",







                                    background: "rgba(55,53,47,0.01)",







                                    border: "1px solid rgba(55,53,47,0.06)",







                                    borderRadius: 6,







                                    height: 38,







                                    animation: "pulse 1.5s ease-in-out infinite",







                                  }}







                                >







                                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>







                                    <div style={{ width: i % 2 === 0 ? "30%" : "50%", height: 12, background: "rgba(55,53,47,0.08)", borderRadius: 3 }} />







                                  </div>







                                </div>







                              ))}







                            </div>







                          ) : (







                            (() => {







                              let segmentCounter = 0;







                              return effectiveLines.map((line, idx) => {







                                const parsed = splitLabelAndValue(line);







                                const label = parsed?.label ?? `文案 ${idx + 1}`;







                                let segments = splitPipeSegments(parsed?.value ?? line);







                                if (segments.length === 0) {







                                  segments = [""];







                                }















                                return (







                                  <div







                                    key={idx}







                                    style={{







                                      border: "1px solid rgba(55,53,47,0.06)",







                                      borderRadius: 8,







                                      background: "#fff",







                                      overflow: "hidden",







                                    }}







                                  >







                                    {label !== "真实文案" && !label.startsWith("文案") && (







                                      <div







                                        style={{







                                          padding: "6px 10px",







                                          borderBottom: "1px solid rgba(55,53,47,0.04)",







                                          background: "rgba(55,53,47,0.04)",







                                          color: "#37352f",







                                          fontSize: 11,







                                          fontWeight: 700,







                                        }}







                                      >







                                        {label}







                                      </div>







                                    )}







                                    <div







                                      style={{







                                        display: "flex",







                                        flexDirection: "column",







                                        gap: 8,







                                        padding: 10,







                                      }}







                                    >







                                      {segments.map((segment, segmentIdx) => {







                                        const currentGlobalIdx = segmentCounter;







                                        segmentCounter++;







                                        const hasHistory = copyHistory[currentGlobalIdx] !== undefined;















                                        return (







                                          <div







                                            key={segmentIdx}







                                            style={{







                                              display: "flex",







                                              alignItems: "flex-start",







                                              gap: 4,







                                              position: "relative",







                                              width: "100%",







                                            }}







                                          >







                                            <textarea







                                              rows={1}







                                              value={segment}







                                              disabled={isRefreshingCopy || isStreaming || isGenerating}







                                              onChange={(e) => {







                                                handleSegmentChange(idx, segmentIdx, e.target.value);







                                                autoResizeTextarea(e.target);







                                              }}







                                              onFocus={(e) => {







                                                setIsCopyEditing(true);







                                                e.currentTarget.style.borderColor = "#37352f";







                                                e.currentTarget.style.background = "#fff";







                                                autoResizeTextarea(e.currentTarget);







                                              }}







                                              placeholder="请输入文案..."







                                              ref={(el) => autoResizeTextarea(el)}







                                              style={{







                                                flex: 1,







                                                minWidth: 0,







                                                borderRadius: 6,







                                                background: "rgba(55,53,47,0.03)",







                                                border: "1px solid rgba(55,53,47,0.08)",







                                                padding: `6px ${hasHistory ? 48 : 26}px 6px 8px`,







                                                fontSize: 12,







                                                color: "#37352f",







                                                outline: "none",







                                                transition: "all 0.15s",







                                                resize: "none",







                                                overflow: "hidden",







                                                lineHeight: 1.5,







                                                display: "block",







                                                width: "100%",







                                                cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "text",







                                              }}







                                              onBlur={(e) => {







                                                e.currentTarget.style.borderColor = "rgba(55,53,47,0.08)";







                                                e.currentTarget.style.background = "rgba(55,53,47,0.03)";







                                                handleBlur();







                                              }}







                                            />







                                            <div







                                              style={{







                                                position: "absolute",







                                                right: 6,







                                                top: 6,







                                                display: "flex",







                                                alignItems: "center",







                                                gap: 4,







                                              }}







                                            >







                                              {hasHistory && (







                                                <button







                                                  type="button"







                                                  disabled={isRefreshingCopy || isStreaming || isGenerating}







                                                  onClick={(e) => {







                                                    e.stopPropagation();







                                                    handleUndoCopy(currentGlobalIdx, idx, segmentIdx);







                                                  }}







                                                  title="退回优化前的文案"







                                                  style={{







                                                    background: "transparent",







                                                    border: "none",







                                                    cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",







                                                    padding: "4px",







                                                    display: "flex",







                                                    alignItems: "center",







                                                    justifyContent: "center",







                                                    borderRadius: 4,







                                                    transition: "all 0.15s",







                                                    color: "#787774",







                                                    opacity: (isRefreshingCopy || isStreaming || isGenerating) ? 0.5 : 1,







                                                  }}







                                                  onMouseEnter={(e) => {







                                                    if (!isRefreshingCopy && !isStreaming && !isGenerating) {







                                                      e.currentTarget.style.background = "rgba(55,53,47,0.05)";







                                                      e.currentTarget.style.color = "#37352f";







                                                    }







                                                  }}







                                                  onMouseLeave={(e) => {







                                                    e.currentTarget.style.background = "transparent";







                                                    e.currentTarget.style.color = "#787774";







                                                  }}







                                                >







                                                  <RotateCcw size={12} />







                                                </button>







                                              )}







                                              <button







                                                type="button"







                                                disabled={isRefreshingCopy || isStreaming || isGenerating}







                                                onClick={(e) => {







                                                  e.stopPropagation();







                                                  handleRemoveSegment(idx, segmentIdx);







                                                }}







                                                title="删除此行文案"







                                                style={{







                                                  background: "transparent",







                                                  border: "none",







                                                  cursor: (isRefreshingCopy || isStreaming || isGenerating) ? "not-allowed" : "pointer",







                                                  padding: "4px",







                                                  display: "flex",







                                                  alignItems: "center",







                                                  justifyContent: "center",







                                                  borderRadius: 4,







                                                  transition: "all 0.15s",







                                                  color: "#787774",







                                                  opacity: (isRefreshingCopy || isStreaming || isGenerating) ? 0.5 : 1,







                                                }}







                                                onMouseEnter={(e) => {







                                                  if (!isRefreshingCopy && !isStreaming && !isGenerating) {







                                                    e.currentTarget.style.background = "rgba(224, 62, 62, 0.08)";







                                                    e.currentTarget.style.color = "#e03e3e";







                                                  }







                                                }}







                                                onMouseLeave={(e) => {







                                                  e.currentTarget.style.background = "transparent";







                                                  e.currentTarget.style.color = "#787774";







                                                }}







                                              >







                                                <Trash2 size={12} />







                                              </button>







                                            </div>







                                          </div>







                                        );







                                      })}







                                    </div>







                                  </div>







                                );







                              });







                            })())}







                          {/* 用户新增的 pending 文案栏 */}







                          {pendingExtraCopyFields.map((field, extraIdx) => (







                            <div







                              key={`extra-${extraIdx}`}







                              style={{







                                border: "1px solid rgba(55,53,47,0.08)",







                                borderRadius: 8,







                                background: "#fff",







                                overflow: "hidden",







                                padding: 10,







                                position: "relative",







                              }}







                            >







                              <textarea







                                rows={1}







                                autoFocus={extraIdx === pendingExtraCopyFields.length - 1}







                                value={field}







                                onChange={(e) => {







                                  const val = e.target.value;







                                  setPendingExtraCopyFields((prev) =>







                                    prev.map((f, i) => (i === extraIdx ? val : f))







                                  );







                                  autoResizeTextarea(e.target);







                                }}







                                onFocus={(e) => {







                                  setIsCopyEditing(true);







                                  e.currentTarget.style.borderColor = "#37352f";







                                  e.currentTarget.style.background = "#fff";







                                  autoResizeTextarea(e.currentTarget);







                                }}







                                onBlur={(e) => {







                                  const val = e.currentTarget.value.trim();







                                  e.currentTarget.style.borderColor = "rgba(55,53,47,0.08)";







                                  e.currentTarget.style.background = "rgba(55,53,47,0.03)";







                                  if (val) {







                                    const newCopy = ds_copy_raw







                                      ? ds_copy_raw + " | " + val







                                      : val;







                                    ds_setCopyRaw(newCopy);







                                    setPendingExtraCopyFields((prev) =>







                                      prev.filter((_, i) => i !== extraIdx)







                                    );







                                    updateParams({ stream_a: { copy: newCopy } });







                                  } else {







                                    setPendingExtraCopyFields((prev) =>







                                      prev.filter((_, i) => i !== extraIdx)







                                    );







                                  }







                                  setIsCopyEditing(false);







                                }}







                                placeholder="请输入文案..."







                                ref={(el) => autoResizeTextarea(el)}







                                style={{







                                  flex: 1,







                                  width: "100%",







                                  borderRadius: 6,







                                  background: "rgba(55,53,47,0.03)",







                                  border: "1px solid rgba(55,53,47,0.08)",







                                  padding: "6px 26px 6px 8px",







                                  fontSize: 12,







                                  color: "#37352f",







                                  outline: "none",







                                  transition: "all 0.15s",







                                  resize: "none",







                                  overflow: "hidden",







                                  lineHeight: 1.5,







                                  display: "block",







                                }}







                              />







                              <button







                                type="button"







                                onClick={() =>







                                  setPendingExtraCopyFields((prev) =>







                                    prev.filter((_, i) => i !== extraIdx)







                                  )







                                }







                                title="删除此栏"







                                style={{







                                  position: "absolute",







                                  top: 16,







                                  right: 16,







                                  background: "transparent",







                                  border: "none",







                                  cursor: "pointer",







                                  padding: 2,







                                  borderRadius: 4,







                                  color: "#c0bdb9",







                                  fontSize: 14,







                                  lineHeight: 1,







                                  display: "flex",







                                  alignItems: "center",







                                }}







                                onMouseEnter={(e) => {







                                  e.currentTarget.style.color = "#e03e3e";







                                }}







                                onMouseLeave={(e) => {







                                  e.currentTarget.style.color = "#c0bdb9";







                                }}







                              >







                                ×







                              </button>







                            </div>







                          ))}







                          {/* 新增文案栏按鈕 */}







                          <button







                            type="button"







                            onClick={() =>







                              setPendingExtraCopyFields((prev) => [...prev, ""])







                            }







                            disabled={isStreaming}







                            style={{







                              display: "flex",







                              alignItems: "center",







                              justifyContent: "center",







                              gap: 6,







                              width: "100%",







                              padding: "8px 12px",







                              borderRadius: 8,







                              border: "1.5px dashed rgba(55,53,47,0.15)",







                              background: "transparent",







                              color: "#9b9a97",







                              fontSize: 12,







                              fontWeight: 500,







                              cursor: isStreaming ? "not-allowed" : "pointer",







                              transition: "all 0.15s",







                              opacity: isStreaming ? 0.5 : 1,







                            }}







                            onMouseEnter={(e) => {







                              if (!isStreaming) {







                                e.currentTarget.style.borderColor = "rgba(55,53,47,0.35)";







                                e.currentTarget.style.color = "#37352f";







                                e.currentTarget.style.background = "rgba(55,53,47,0.03)";







                              }







                            }}







                            onMouseLeave={(e) => {







                              e.currentTarget.style.borderColor = "rgba(55,53,47,0.15)";







                              e.currentTarget.style.color = "#9b9a97";







                              e.currentTarget.style.background = "transparent";







                            }}







                          >







                            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>







                            <span>新增文案栏</span>







                          </button>







                        </div>







                      );







                    })()}







                  </div>















                  {/* 2. 风格推荐选择区 */}
                  <StyleSelector
                    isRefreshing={isRefreshingStyles}
                    hasStyleRef={!!session?.stream_b?.style_reference_image}
                    visualDescription={session?.stream_b?.visual_description || ""}
                    onSelectStyle={handleSelectStyle}
                    onSelectTag={handleSelectTag}
                    onRefreshStyles={handleRefreshStyles}
                  />















                  <LayoutSelector
                    isRefreshing={isRefreshingLayouts}
                    hasLayoutRef={!!session?.stream_b?.layout_reference_image}
                    layoutDescription={session?.stream_a?.layout_notes || ""}
                    onSelectLayout={handleSelectLayout}
                    onSelectTag={handleSelectLayoutTag}
                    onRefreshLayouts={handleRefreshLayouts}
                  />















                  {/* 4. 规格选择 (尺寸与清晰度) */}







                  <div>







                    <div style={{ fontSize: 12, fontWeight: 600, color: "#37352f", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>







                      海报规格设置







                    </div>







                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>







                      <div>







                        <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>画布尺寸比例</div>







                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>







                          {(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "9:32"] as const).map((r) => {







                            const isActive = ds_active_ratio === r;







                            const labels: Record<string, string> = {







                              "1:1": "方图 1:1",







                              "4:3": "横向 4:3",







                              "3:4": "竖向 3:4",







                              "16:9": "宽屏 16:9",







                              "9:16": "海报 9:16",







                              "3:2": "横向 3:2",







                              "2:3": "杂志 2:3",







                              "9:32": "详情页 9:32",







                            };







                            return (







                              <button







                                key={r}







                                onClick={async () => {







                                  ds_setActiveRatio(r);







                                  await updateParams({ aspect_ratio: r });







                                }}







                                style={{







                                  padding: "4px 8px",







                                  fontSize: 11,







                                  fontWeight: 600,







                                  borderRadius: 4,







                                  border: "1px solid",







                                  borderColor: isActive ? "#37352f" : "rgba(55,53,47,0.12)",







                                  background: isActive ? "#37352f" : "#fff",







                                  color: isActive ? "#fff" : "#37352f",







                                  cursor: "pointer",







                                  transition: "all 0.15s",







                                }}







                              >







                                {labels[r] || r}







                              </button>







                            );







                          })}







                        </div>







                      </div>















                      <div>







                        <div style={{ fontSize: 11, fontWeight: 600, color: "#787774", marginBottom: 6 }}>生成清晰度</div>







                        <div style={{ display: "flex", gap: 4 }}>







                          {(["1k", "2k", "4k"] as const).map((res) => {







                            const isActive = ds_active_resolution === res;







                            return (







                              <button







                                key={res}







                                onClick={async () => {







                                  ds_setActiveResolution(res);







                                  await updateParams({ resolution: res });







                                }}







                                style={{







                                  padding: "4px 12px",







                                  fontSize: 11,







                                  fontWeight: 600,







                                  borderRadius: 4,







                                  border: "1px solid",







                                  borderColor: isActive ? "#37352f" : "rgba(55,53,47,0.12)",







                                  background: isActive ? "#37352f" : "#fff",







                                  color: isActive ? "#fff" : "#37352f",







                                  cursor: "pointer",







                                  transition: "all 0.15s",







                                }}







                              >







                                {res.toUpperCase()}







                              </button>







                            );







                          })}







                        </div>







                      </div>







                    </div>







                  </div>















                  {/* 确认进入定稿按钮 */}







                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, borderTop: "1px solid rgba(55,53,47,0.06)" }}>







                    <button







                      onClick={handleConfirmFirst}







                      disabled={isStreaming}







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







                        cursor: isStreaming ? "not-allowed" : "pointer",







                        opacity: isStreaming ? 0.6 : 1,







                        transition: "all 0.15s",







                      }}







                      onMouseEnter={(e) => {







                        if (!isStreaming) e.currentTarget.style.background = "#2e2c27";







                      }}







                      onMouseLeave={(e) => {







                        e.currentTarget.style.background = "#37352f";







                      }}







                    >







                      <span>✦</span>







                      方案确认，开始生成海报







                    </button>







                  </div>







                </div>







              ) : (







                /* Stage 2 replacement: display other status panels depending on actual session status */







                (() => {







                  if (session.status === "prompting" || isTransitioningToStage2) {







                    return (







                      <div







                        style={{







                          padding: "14px 16px",







                          display: "flex",







                          alignItems: "center",







                          gap: 8,







                        }}







                      >







                        <span







                          style={{







                            display: "inline-block",







                            width: 12,







                            height: 12,







                            border: "1.5px solid rgba(55,53,47,0.15)",







                            borderTopColor: "#37352f",







                            borderRadius: "50%",







                            animation: "spin 0.8s linear infinite",







                            flexShrink: 0,







                          }}







                        />







                        <span style={{ fontSize: 13, color: "#787774" }}>







                          正在为您整理排版与视觉构想...







                        </span>







                      </div>







                    );







                  }















                  if (session.status === "generating") {
                    return null;
                  }















                  if (session.status === "failed") {







                    return (







                      <div







                        style={{







                          display: "flex",







                          flexDirection: "column",







                          gap: 12,







                        }}







                      >







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







                          }}







                        >







                          <div style={{ fontSize: 14, fontWeight: 700, color: "#e03e3e", display: "flex", alignItems: "center", gap: 6 }}>







                            <span>⚠️</span> 海报生成失败







                          </div>







                          







                          <div







                            style={{







                              width: "100%",







                              padding: "8px 12px",







                              background: "rgba(224,62,62,0.06)",







                              border: "1px solid rgba(224,62,62,0.2)",







                              borderRadius: 6,







                              fontSize: 12,







                              color: "#e03e3e",







                              lineHeight: "1.4",







                            }}







                          >







                            {session.error_message || "未知绘图错误，请检查网络或重试。"}







                          </div>















                          <div style={{ display: "flex", gap: 8 }}>







                            <button







                              onClick={async () => {







                                await updateParams({ status: "clarifying" });







                                setIsTransitioningToStage2(false);







                                if (stage1Snapshot) {







                                  useDesignStore.setState({
                                    copy_raw: stage1Snapshot.copy,
                                    active_style: stage1Snapshot.selectedStyle,
                                    active_layout: stage1Snapshot.selectedLayout,
                                    active_ratio: session?.aspect_ratio ?? stage1Snapshot.aspect_ratio,
                                    active_resolution: session?.resolution ?? stage1Snapshot.resolution,
                                    dirty_copy: false,
                                    dirty_style_selection: false,
                                    dirty_layout_selection: false,
                                  });







                                }







                                setCurrentStage(1);







                              }}







                              style={{







                                flex: 1,







                                padding: "10px 16px",







                                background: "#ffffff",







                                border: "1px solid rgba(55, 53, 47, 0.15)",







                                borderRadius: 8,







                                fontSize: 13,







                                fontWeight: 600,







                                color: "#37352f",







                                cursor: "pointer",







                                transition: "all 0.15s",







                              }}







                              onMouseEnter={(e) => e.currentTarget.style.background = "#f7f6f3"}







                              onMouseLeave={(e) => e.currentTarget.style.background = "#ffffff"}







                            >







                              修改需求







                            </button>















                            <button







                              onClick={triggerGenerate}







                              style={{







                                flex: 2,







                                display: "flex",







                                alignItems: "center",







                                justifyContent: "center",







                                gap: 6,







                                padding: "10px 16px",







                                background: "#e03e3e",







                                color: "#fff",







                                border: "none",







                                borderRadius: 8,







                                fontSize: 13,







                                fontWeight: 600,







                                cursor: "pointer",







                                transition: "all 0.15s",







                              }}







                              onMouseEnter={(e) => e.currentTarget.style.background = "#c92a2a"}







                              onMouseLeave={(e) => e.currentTarget.style.background = "#e03e3e"}







                            >







                              <span>↻</span> 重新生成







                            </button>







                          </div>







                        </div>







                      </div>







                    );







                  }































                  return null;







                })()







              )}







            </div>







          )}















          <div ref={chatEndRef} />







        </div>























        {/* 错误提示 */}







        {error && (







          <div







            style={{







              margin: "0 16px",







              padding: "8px 12px",







              background: "rgba(224,62,62,0.08)",







              border: "1px solid rgba(224,62,62,0.2)",







              borderRadius: 6,







              fontSize: 12,







              color: "#e03e3e",







            }}







          >







            {error}







          </div>







        )}































        {/* 输入框 */}







        <div







          style={{







            padding: "12px 16px",







            borderTop: "1px solid rgba(55,53,47,0.09)",







            background: "#fff",







          }}







        >







          {/* 隐藏的 File Input（支持图片和 PDF） */}







          <input







            type="file"







            ref={fileInputRef}







            onChange={handleFileChange}







            accept={REFERENCE_INPUT_ACCEPT}







            style={{ display: "none" }}







          />















          {/* 四合一智能配图与文档管理（风格、排版、主体物参考、PDF文档） */}







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







                  ◈ 风格参考







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







                  ◰ 排版参考







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







                        <>素材上传</>







                      ) : (







                        <div







                          style={{







                            display: "flex",







                            gap: 7,







                            alignItems: "center",







                            padding: "4px 9px",







                            borderRadius: 999,







                            background: "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(248,248,246,0.58) 100%)",







                            border: "1px solid rgba(255,255,255,0.72)",







                            boxShadow: "0 10px 24px rgba(55,53,47,0.06), inset 0 1px 0 rgba(255,255,255,0.84)",







                            backdropFilter: "blur(14px) saturate(125%)",







                            WebkitBackdropFilter: "blur(14px) saturate(125%)",







                          }}







                        >







                          <span







                            style={getMaterialOrbStyle("subject", subjectMaterials.length > 0)}







                            title="主体物素材"







                          />







                          <span







                            style={getMaterialOrbStyle("logo", logoMaterials.length > 0)}







                            title="Logo素材"







                          />







                          <span







                            style={getMaterialOrbStyle("other", otherMaterials.length > 0)}







                            title="其他素材"







                          />







                        </div>







                      )}







                    </button>















                    {showMaterialMenu && (







                      <div







                        style={{







                          position: "absolute",







                          bottom: 38,







                          left: "50%",







                          transform: "translateX(-50%)",







                          width: 156,







                          zIndex: 50,







                          background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,247,244,0.78) 100%)",







                          border: "1px solid rgba(255,255,255,0.78)",







                          borderRadius: 12,







                          boxShadow: "0 18px 40px rgba(55,53,47,0.12), inset 0 1px 0 rgba(255,255,255,0.8)",







                          backdropFilter: "blur(20px) saturate(125%)",







                          WebkitBackdropFilter: "blur(20px) saturate(125%)",







                          padding: 6,







                          display: "flex",







                          flexDirection: "column",







                          gap: 4







                        }}







                      >







                        {/* 1. 主体物 */}







                        <div style={{ display: "flex", flexDirection: "column" }}>







                          <button







                            onClick={() => {







                              setPendingSubjectType("subject");







                              setActiveUploadType("subject");







                              setShowMaterialMenu(false);







                              setTimeout(() => fileInputRef.current?.click(), 50);







                            }}







                            style={{







                              padding: "7px 10px",







                              background: "rgba(255,255,255,0.34)",







                              border: "none",







                              borderRadius: 8,







                              textAlign: "left",







                              fontSize: 11,







                              color: "#37352f",







                              cursor: "pointer",







                              display: "flex",







                              alignItems: "center",







                              gap: 7,







                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)"







                            }}







                          >







                            <span







                              style={{







                                ...getMaterialOrbStyle("subject", false),







                                width: 9,







                                height: 9,







                                opacity: 1,







                                flexShrink: 0,







                              }}







                              aria-hidden="true"







                            />







                            <span>主体物素材</span>







                          </button>







                          {subjectMaterials.map((mat: any) => (







                            <div







                              key={mat.id}







                              style={{







                                display: "flex",







                                alignItems: "center",







                                justifyContent: "space-between",







                                padding: "4px 10px 4px 22px"







                              }}







                            >







                              <span







                                style={{







                                  fontSize: 10,







                                  color: "#787774",







                                  textOverflow: "ellipsis",







                                  overflow: "hidden",







                                  whiteSpace: "nowrap",







                                  flex: 1,







                                  cursor: "pointer"







                                }}







                                onClick={() => window.open(mat.url, "_blank")}







                              >







                                🖼️ 查看图片







                              </span>







                              <button







                                onClick={() => removeMaterial(mat.id)}







                                style={{







                                  background: "transparent",







                                  border: "none",







                                  color: "#e03e3e",







                                  fontSize: 10,







                                  cursor: "pointer"







                                }}







                              >







                                移除







                              </button>







                            </div>







                          ))}







                        </div>















                        {/* 2. Logo */}







                        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(55,53,47,0.05)", paddingTop: 4 }}>







                          <button







                            onClick={() => {







                              setPendingSubjectType("logo");







                              setActiveUploadType("subject");







                              setShowMaterialMenu(false);







                              setTimeout(() => fileInputRef.current?.click(), 50);







                            }}







                            style={{







                              padding: "7px 10px",







                              background: "rgba(255,255,255,0.34)",







                              border: "none",







                              borderRadius: 8,







                              textAlign: "left",







                              fontSize: 11,







                              color: "#37352f",







                              cursor: "pointer",







                              display: "flex",







                              alignItems: "center",







                              gap: 7,







                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)"







                            }}







                          >







                            <span







                              style={{







                                ...getMaterialOrbStyle("logo", false),







                                width: 9,







                                height: 9,







                                opacity: 1,







                                flexShrink: 0,







                              }}







                              aria-hidden="true"







                            />







                            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>







                              <span>Logo素材</span>







                              <span style={{ fontSize: 9, fontWeight: 500, color: "#9b9a97" }}>推荐png格式</span>







                            </span>







                          </button>







                          {logoMaterials.map((mat: any) => (







                            <div







                              key={mat.id}







                              style={{







                                display: "flex",







                                alignItems: "center",







                                justifyContent: "space-between",







                                padding: "4px 10px 4px 22px"







                              }}







                            >







                              <span







                                style={{







                                  fontSize: 10,







                                  color: "#787774",







                                  textOverflow: "ellipsis",







                                  overflow: "hidden",







                                  whiteSpace: "nowrap",







                                  flex: 1,







                                  cursor: "pointer"







                                }}







                                onClick={() => window.open(mat.url, "_blank")}







                              >







                                🖼️ 查看图片







                              </span>







                              <button







                                onClick={() => removeMaterial(mat.id)}







                                style={{







                                  background: "transparent",







                                  border: "none",







                                  color: "#e03e3e",







                                  fontSize: 10,







                                  cursor: "pointer"







                                }}







                              >







                                移除







                              </button>







                            </div>







                          ))}







                        </div>















                        {/* 3. 其他素材（支持图片/PDF，自动识别） */}







                        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(55,53,47,0.05)", paddingTop: 4, position: "relative" }}>







                          <div style={{ display: "flex", flexDirection: "column" }}>







                            <button







                              onClick={() => {







                                setPendingSubjectType("other");







                                setActiveUploadType("subject");







                                setShowMaterialMenu(false);







                                setTimeout(() => fileInputRef.current?.click(), 50);







                              }}







                              style={{







                                padding: "7px 10px",







                                background: "rgba(255,255,255,0.34)",







                                border: "none",







                                borderRadius: 8,







                                textAlign: "left",







                                fontSize: 11,







                                color: "#37352f",







                                cursor: "pointer",







                                display: "flex",







                                alignItems: "center",







                                gap: 7,







                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)"







                              }}







                            >







                              <span







                                style={{







                                  ...getMaterialOrbStyle("other", false),







                                  width: 9,







                                  height: 9,







                                  opacity: 1,







                                  flexShrink: 0,







                                }}







                                aria-hidden="true"







                              />







                              <span>其他素材</span>







                            </button>







                          </div>







                          {showPdfModePrompt && (







                            <div







                              ref={pdfModePromptRef}







                              style={{







                                display: "flex",







                                gap: 4,







                                padding: "5px 6px",







                                marginTop: 4,







                                background: "rgba(255,255,255,0.92)",







                                border: "1px solid rgba(55,53,47,0.1)",







                                borderRadius: 8,







                                boxShadow: "0 4px 12px rgba(55,53,47,0.1)",







                              }}







                            >







                              <button







                                onClick={() => handlePdfModeChoice("document")}







                                style={{







                                  flex: 1,







                                  padding: "5px 8px",







                                  background: "rgba(55,53,47,0.06)",







                                  border: "1px solid rgba(55,53,47,0.08)",







                                  borderRadius: 6,







                                  fontSize: 10,







                                  color: "#37352f",







                                  cursor: "pointer",







                                  textAlign: "center",







                                  lineHeight: 1.3,







                                }}







                              >







                                <div style={{ fontWeight: 600 }}>提取文本</div>







                                <div style={{ fontSize: 9, color: "#9b9a97", marginTop: 1 }}>用于文案生成</div>







                              </button>







                              <button







                                onClick={() => handlePdfModeChoice("image")}







                                style={{







                                  flex: 1,







                                  padding: "5px 8px",







                                  background: "rgba(55,53,47,0.06)",







                                  border: "1px solid rgba(55,53,47,0.08)",







                                  borderRadius: 6,







                                  fontSize: 10,







                                  color: "#37352f",







                                  cursor: "pointer",







                                  textAlign: "center",







                                  lineHeight: 1.3,







                                }}







                              >







                                <div style={{ fontWeight: 600 }}>转图片</div>







                                <div style={{ fontSize: 9, color: "#9b9a97", marginTop: 1 }}>作为视觉参考</div>







                              </button>







                            </div>







                          )}







                          {otherMaterials.map((mat: any) => (







                            <div







                              key={mat.id}







                              style={{







                                display: "flex",







                                alignItems: "center",







                                justifyContent: "space-between",







                                padding: "4px 10px 4px 22px"







                              }}







                            >







                              <span







                                style={{







                                  fontSize: 10,







                                  color: "#787774",







                                  textOverflow: "ellipsis",







                                  overflow: "hidden",







                                  whiteSpace: "nowrap",







                                  flex: 1,







                                  cursor: "pointer"







                                }}







                                onClick={() => window.open(mat.url, "_blank")}







                              >







                                🖼️ 查看图片







                              </span>







                              <button







                                onClick={() => removeMaterial(mat.id)}







                                style={{







                                  background: "transparent",







                                  border: "none",







                                  color: "#e03e3e",







                                  fontSize: 10,







                                  cursor: "pointer"







                                }}







                              >







                                移除







                              </button>







                            </div>







                          ))}







                        </div>







                      </div>







                    )}







                  </div>







                );







              })()}















              {/* PDF 文档已合并到素材上传菜单中 */}







            </div>







          )}































          <div







            style={{







              display: "flex",







              gap: 8,







              alignItems: "center",







              background: "#f7f6f3",







              border: "1px solid rgba(55,53,47,0.12)",







              borderRadius: 10,







              padding: "8px 12px",







              transition: "border-color 0.15s",







            }}







            onFocus={(e) => {







              (e.currentTarget as HTMLDivElement).style.borderColor = "#37352f";







              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 2px rgba(55, 53, 47, 0.1)";







            }}







            onBlur={(e) => {







              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(55,53,47,0.12)";







              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";







            }}







          >







            <textarea







              ref={inputRef}







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







                transition: "background 0.15s",







                flexShrink: 0,







              }}







            >







              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">







                <path d="M1 7h12M7 1l6 6-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />







              </svg>







            </button>







          </div>







          <div style={{ fontSize: 10, color: "#c7c7c4", marginTop: 4, textAlign: "center" }}>







            Enter 发送 · Shift+Enter 换行







          </div>







        </div>







      </div>















      {/* 多尺寸延伸模态框 */}







      {session && (
        <ExtendModal
          ref={extendModalRef}
          session={session}
          onExtend={handleExtend}
          tasks={activeExtendTasks}
        />
      )}















      {/* 清晰度延伸模态框 */}







      {session && (
        <ResolutionExtendModal
          ref={resolutionModalRef}
          session={session}
          onExtend={handleResolutionExtend}
          tasks={activeResolutionTasks}
        />
      )}















      {/* PDF 文本预览模态框 */}







      {showPdfPreview && session?.stream_a?.pdf_document_url && (







        <div







          style={{







            position: "fixed",







            inset: 0,







            background: "rgba(0,0,0,0.5)",







            display: "flex",







            alignItems: "center",







            justifyContent: "center",







            zIndex: 1100,







            animation: "fadeIn 0.15s ease",







            padding: 20,







          }}







          onClick={() => setShowPdfPreview(false)}







        >







          <div







            style={{







              background: "#fff",







              borderRadius: 12,







              width: "100%",







              maxWidth: 500,







              maxHeight: "75vh",







              display: "flex",







              flexDirection: "column",







              boxShadow: "0 20px 48px rgba(0,0,0,0.15)",







              overflow: "hidden",







            }}







            onClick={(e) => e.stopPropagation()}







          >







            {/* Header */}







            <div







              style={{







                padding: "16px 20px",







                borderBottom: "1px solid rgba(55,53,47,0.08)",







                display: "flex",







                alignItems: "center",







                justifyContent: "space-between",







              }}







            >







              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>







                <span style={{ fontSize: 16 }}>📄</span>







                <span style={{ fontSize: 14, fontWeight: 700, color: "#37352f" }}>







                  PDF 文档文本预览







                </span>







              </div>







              <button







                onClick={() => setShowPdfPreview(false)}







                style={{







                  width: 28,







                  height: 28,







                  borderRadius: "50%",







                  background: "rgba(55,53,47,0.05)",







                  border: "none",







                  color: "#787774",







                  display: "flex",







                  alignItems: "center",







                  justifyContent: "center",







                  cursor: "pointer",







                  fontSize: 12,







                  transition: "background 0.12s",







                }}







                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.1)")}







                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(55,53,47,0.05)")}







              >







                ✕







              </button>







            </div>















            {/* Content */}







            <div







              style={{







                padding: 20,







                overflowY: "auto",







                flex: 1,







                background: "#fbfaf8",







              }}







            >







              {session.stream_a.pdf_document_text ? (







                <pre







                  style={{







                    margin: 0,







                    fontSize: 12,







                    color: "#37352f",







                    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace',







                    whiteSpace: "pre-wrap",







                    wordBreak: "break-all",







                    lineHeight: "1.6",







                  }}







                >







                  {session.stream_a.pdf_document_text}







                </pre>







              ) : (







                <div







                  style={{







                    textAlign: "center",







                    color: "#9b9a97",







                    fontSize: 12,







                    padding: "40px 0",







                  }}







                >







                  📭 未从 PDF 中解析到文本内容







                </div>







              )}







            </div>















            {/* Footer */}







            <div







              style={{







                padding: "12px 20px",







                borderTop: "1px solid rgba(55,53,47,0.08)",







                display: "flex",







                justifyContent: "flex-end",







                background: "#fff",







              }}







            >







              <button







                onClick={() => setShowPdfPreview(false)}







                style={{







                  padding: "6px 16px",







                  background: "#37352f",







                  color: "#fff",







                  border: "none",







                  borderRadius: 6,







                  fontSize: 12,







                  fontWeight: 600,







                  cursor: "pointer",







                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",







                }}







              >







                关闭







              </button>







            </div>







          </div>







        </div>







      )}















      {/* 历史记录侧滑抽屉 */}







      {showSessionHistory && (







        <div







          style={{







            position: "fixed",







            inset: 0,







            background: "rgba(0,0,0,0.4)",







            zIndex: 1000,







            display: "flex",







            justifyContent: "flex-end",







            animation: "fadeIn 0.15s ease",







          }}







          onClick={() => {







            setShowSessionHistory(false);







            setIsBatchDeleteMode(false);







            setSelectedSessionIds(new Set());







          }}







        >







          <div







            style={{







              width: 320,







              height: "100%",







              background: "#fff",







              boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",







              display: "flex",







              flexDirection: "column",







              animation: "slideLeft 0.2s ease",







            }}







            onClick={(e) => e.stopPropagation()}







          >







            <div







              style={{







                padding: "16px",







                borderBottom: "1px solid rgba(55,53,47,0.09)",







                display: "flex",







                alignItems: "center",







                justifyContent: "space-between",







              }}







            >







              <span style={{ fontSize: 14, fontWeight: 700, color: "#37352f" }}>AI 设计助理会话记录</span>







              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>







                {sessionsList.length > 0 && (







                  <button







                    onClick={() => {







                      setIsBatchDeleteMode(!isBatchDeleteMode);







                      setSelectedSessionIds(new Set());







                    }}







                    style={{







                      border: "none",







                      background: "transparent",







                      fontSize: 13,







                      color: isBatchDeleteMode ? "#e03e3e" : "#487ca5",







                      cursor: "pointer",







                    }}







                  >







                    {isBatchDeleteMode ? "取消" : "管理"}







                  </button>







                )}







                <button







                  onClick={() => {







                    setShowSessionHistory(false);







                    setIsBatchDeleteMode(false);







                    setSelectedSessionIds(new Set());







                  }}







                  style={{







                    border: "none",







                    background: "transparent",







                    fontSize: 16,







                    color: "#787774",







                    cursor: "pointer",







                  }}







                >







                  ✕







                </button>







              </div>







            </div>







            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>







              {sessionsList.length === 0 ? (







                <div style={{ textAlign: "center", padding: "20px", color: "#9b9a97", fontSize: 12 }}>







                  暂无会话记录







                </div>







              ) : (







                sessionsList.map((item) => (







                  <div







                    key={item.id}







                    onClick={() => {







                      if (isBatchDeleteMode) {







                        const newSet = new Set(selectedSessionIds);







                        if (newSet.has(item.id)) newSet.delete(item.id);







                        else newSet.add(item.id);







                        setSelectedSessionIds(newSet);







                      } else {







                        loadSession(item.id);







                        setShowSessionHistory(false);







                      }







                    }}







                    style={{







                      padding: "10px 12px",







                      borderRadius: 8,







                      border: `1px solid ${session?.id === item.id && !isBatchDeleteMode ? "#487ca5" : "rgba(55,53,47,0.08)"}`,







                      background: session?.id === item.id && !isBatchDeleteMode ? "rgba(72,124,165,0.04)" : "#f7f6f3",







                      cursor: "pointer",







                      position: "relative",







                      display: "flex",







                      alignItems: "center",







                      gap: 10,







                      transition: "all 0.15s",







                    }}







                    onMouseEnter={(e) => {







                      if (!isBatchDeleteMode) {







                        const delBtn = e.currentTarget.querySelector(".del-session-btn") as HTMLButtonElement;







                        if (delBtn) delBtn.style.opacity = "1";







                      }







                    }}







                    onMouseLeave={(e) => {







                      if (!isBatchDeleteMode) {







                        const delBtn = e.currentTarget.querySelector(".del-session-btn") as HTMLButtonElement;







                        if (delBtn) delBtn.style.opacity = "0";







                      }







                    }}







                  >







                    {isBatchDeleteMode && (







                      <input







                        type="checkbox"







                        checked={selectedSessionIds.has(item.id)}







                        readOnly







                        style={{ margin: 0, width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}







                      />







                    )}







                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>







                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>







                        <span style={{ fontSize: 12, fontWeight: 600, color: "#37352f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "80%" }}>







                          {item.stream_a?.copy || "新会话"}







                        </span>







                        {!isBatchDeleteMode && (







                          <button







                            className="del-session-btn"







                            onClick={async (e) => {







                              e.stopPropagation();







                              if (confirm("确定要删除这条会话记录吗？")) {







                                await deleteSession(item.id);







                                fetchSessions();







                              }







                            }}







                            style={{







                              background: "transparent",







                              border: "none",







                              color: "#e03e3e",







                              fontSize: 10,







                              cursor: "pointer",







                              opacity: 0,







                              transition: "opacity 0.15s",







                              padding: "2px 6px",







                              borderRadius: 4,







                            }}







                          >







                            删除







                          </button>







                        )}







                      </div>







                      <div style={{ fontSize: 10, color: "#9b9a97", display: "flex", justifyContent: "space-between" }}>







                        <span>状态: {item.status}</span>







                        <span>{new Date(item.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>







                      </div>







                    </div>







                  </div>







                ))







              )}







            </div>







            {isBatchDeleteMode && sessionsList.length > 0 && (







              <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(55,53,47,0.09)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>







                <span style={{ fontSize: 12, color: "#787774" }}>







                  已选 {selectedSessionIds.size} 项







                </span>







                <button







                  disabled={selectedSessionIds.size === 0}







                  onClick={async () => {







                    if (confirm(`确定要删除选中的 ${selectedSessionIds.size} 条会话记录吗？`)) {







                      for (const id of Array.from(selectedSessionIds)) {







                        await deleteSession(id);







                      }







                      setSelectedSessionIds(new Set());







                      setIsBatchDeleteMode(false);







                      fetchSessions();







                    }







                  }}







                  style={{







                    padding: "6px 12px",







                    background: selectedSessionIds.size > 0 ? "#e03e3e" : "#f1f1ef",







                    color: selectedSessionIds.size > 0 ? "#fff" : "#c7c7c4",







                    border: "none",







                    borderRadius: 6,







                    fontSize: 12,







                    fontWeight: 500,







                    cursor: selectedSessionIds.size > 0 ? "pointer" : "not-allowed",







                  }}







                >







                  删除所选







                </button>







              </div>







            )}







          </div>







        </div>







      )}







    </div>







  );







}















import React from "react";






