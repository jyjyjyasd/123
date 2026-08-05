// features/agent/components/CanvasArea.tsx
// 右侧画布区域：展示生成结果 + 状态指示 + 尺寸和清晰度延伸 + Logo 微调 + 资产管理
// 对应 prd page.tsx 的整个右侧预览面板与交互功能

import React, { useState, useEffect, useRef } from "react";
import { Layers, Eye, AlertCircle } from "lucide-react";
import type { AgentSession } from "../types";
import { apiUpload } from "../../../lib/api";
import { getRatioAspect } from "./canvas/ratio";
import { drawArrow, drawEllipse, drawLabel, drawRect, getEventCoords } from "./canvas/drawing";
import type { DrawShape, DrawTool, Point } from "./canvas/drawing";
import type { DisplayImage } from "./canvas/types";
import { exportPoster } from "./canvas/export";
import {
  BlueprintLoading,
  ClarifyingView,
  EmptyCanvas,
  FailedView,
  PromptingView,
  WaitingView,
} from "./canvas/status-views";
import { AnnotationToolbar, LabelInput } from "./canvas/annotation-ui";
import { ActionBar } from "./canvas/action-bar";
import { LogoAdjustPanel } from "./canvas/logo-panel";
import { HistoryVersions, WorkbenchGallery } from "./canvas/galleries";
import { Lightbox } from "./canvas/lightbox";

interface CanvasAreaProps {
  session: AgentSession | null;
  isGenerating: boolean;
  onExtendClick: (baseImageUrl?: string, ratio?: string) => void;
  onResolutionExtendClick: (baseImageUrl?: string, ratio?: string) => void;
  onDeleteExtendedImage: (target: { id?: string; url: string }) => Promise<void>;
  onGenerationCompleted?: () => void;
  onRetryExtend?: (ratio: string, resolution: string) => Promise<void>;
  onSubmitEdit?: (
    message: string,
    subjectFileId: string,
    ratio: string,
    resolution: string
  ) => Promise<void>;
}

export function CanvasArea({
  session,
  isGenerating,
  onExtendClick,
  onResolutionExtendClick,
  onDeleteExtendedImage,
  onGenerationCompleted,
  onRetryExtend,
  onSubmitEdit,
}: CanvasAreaProps) {
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState(false);

  // 用户手动选中的图像
  const [userSelectedImage, setUserSelectedImage] = useState<DisplayImage | null>(null);

  // Logo 微调相关状态
  const [logoPosition, setLogoPosition] = useState<
    "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center"
  >("top-center");
  const [logoScale, setLogoScale] = useState<number>(20); // 占比 10% - 40%
  const [logoOffset, setLogoOffset] = useState<number>(5);  // 边距 0% - 30%
  const [logoOpacity, setLogoOpacity] = useState<number>(100); // 透明度 10% - 100%

  // Lightbox 预览状态
  const [previewOpen, setPreviewOpen] = useState(false);

  const drawingCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const imageRef          = useRef<HTMLImageElement | null>(null);
  const [isDrawingMode, setIsDrawingMode]   = useState(false);
  const [isDrawing, setIsDrawing]           = useState(false);
  const [activeTool, setActiveTool]         = useState<DrawTool>("freehand");
  const [shapes, setShapes]                 = useState<DrawShape[]>([]);
  const [redrawTrigger, setRedrawTrigger]   = useState(0);
  const pendingArrowRef                     = useRef<{ from: Point; to: Point } | null>(null);
  const savedImageDataRef                   = useRef<ImageData | null>(null);
  const [labelInput, setLabelInput]         = useState<{ x: number; y: number } | null>(null);
  const [labelText, setLabelText]           = useState("");
  const labelInputRef                       = useRef<HTMLInputElement | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const lastGenIdRef = useRef<string | null>(null);
  // 保留上一次成功的主图 URL，防止重新生成时画面闪烁
  const stableImageUrlRef = useRef<string | null>(null);

  // 1. 轮询主图生成结果
  useEffect(() => {
    const genId = session?.generation_id;
    if (!genId) {
      // 没有 generation_id 时不清空图片（防止 loadSession 后画面闪烁）
      // 只在会话真正重置（session 为 null）时才清空
      setPrimaryLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        setPrimaryLoading(true);
        const res = await fetch(`/api/generations/${genId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) timer = setTimeout(poll, 5000);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "completed" && data.output_files?.length > 0) {
          const newUrl = data.output_files[0].url;
          stableImageUrlRef.current = newUrl;
          setPrimaryImageUrl(newUrl);
          setPrimaryLoading(false);
          onGenerationCompleted?.();
        } else if (data.status === "failed") {
          setPrimaryLoading(false);
          onGenerationCompleted?.();
        } else {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session?.generation_id]);

  // 2. generation_id 发生变化时，清除用户手动选中的图像与主图 URL（避免旧图在新比例容器中拉伸变形）
  useEffect(() => {
    if (session?.generation_id !== lastGenIdRef.current) {
      setUserSelectedImage(null);
      setPrimaryImageUrl(null);
      stableImageUrlRef.current = null;
      lastGenIdRef.current = session?.generation_id || null;
    }
  }, [session?.generation_id]);

  // 3. session 真正被重置（为 null 或切换新会话）时才清空图片
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      setPrimaryImageUrl(null);
      stableImageUrlRef.current = null;
      prevSessionIdRef.current = null;
      return;
    }
    if (session.id !== prevSessionIdRef.current) {
      // 切换到不同 session 时清空
      if (prevSessionIdRef.current !== null) {
        setPrimaryImageUrl(null);
        stableImageUrlRef.current = null;
        setUserSelectedImage(null);
      }
      prevSessionIdRef.current = session.id;
    }
  }, [session?.id, session]);

  useEffect(() => {
    if (session?.status !== "generating") {
      setPrimaryLoading(false);
    }
  }, [session?.status]);

  // 监听窗口尺寸变化，以对齐画布物理尺寸，防止任何拉伸变形
  useEffect(() => {
    if (isDrawingMode) {
      const handleResize = () => {
        setRedrawTrigger((prev) => prev + 1);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [isDrawingMode]);

  // Shapes -> Canvas 重绘 (在进入画板模式、shapes 变化或尺寸变动时重绘)
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // 强制同步对齐画布物理分辨率与图片在屏幕上的实际渲染尺寸，彻底杜绝文字拉伸变形
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    
    // 清理画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (const shape of shapes) {
      if (shape.type === "freehand") {
        ctx.save();
        ctx.strokeStyle = "#FF4D4F";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        shape.points.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
        );
        ctx.stroke();
        ctx.restore();
      } else if (shape.type === "arrow") {
        drawArrow(ctx, shape.from, shape.to);
        drawLabel(ctx, shape.to, shape.label);
      } else if (shape.type === "rect") {
        drawRect(ctx, shape.from, shape.to);
        drawLabel(ctx, shape.to, shape.label);
      } else if (shape.type === "ellipse") {
        drawEllipse(ctx, shape.from, shape.to);
        drawLabel(ctx, shape.to, shape.label);
      }
    }
  }, [shapes, isDrawingMode, redrawTrigger]); // eslint-disable-line react-hooks/exhaustive-deps



  if (!session) return <EmptyCanvas />;

  // 3. 计算自动同步的图像（最新延伸图优先，其次主图）
  const extendedList = session.extended_images || [];
  const completedExtendedList = extendedList.filter(
    (img): img is typeof img & { url: string } => Boolean(img.url) && img.status !== "failed"
  );
  const hasGeneratedPrimary = Boolean(session.generation_id);
  let autoSyncedImage = null;
  if (completedExtendedList.length > 0) {
    const lastExt = completedExtendedList[completedExtendedList.length - 1];
    autoSyncedImage = {
      url: lastExt.url,
      ratio: lastExt.ratio,
      resolution: lastExt.resolution || "1k",
      isPrimary: false,
    };
  } else if (primaryImageUrl && hasGeneratedPrimary) {
    autoSyncedImage = {
      url: primaryImageUrl,
      ratio: session.primary_ratio || session.aspect_ratio || "1:1",
      resolution: session.primary_resolution || session.resolution || "1k",
      isPrimary: true,
    };
  }

  // 当前画布展示图像
  const currentDisplayImage = userSelectedImage || autoSyncedImage;
  const canUseExtendActions = Boolean(currentDisplayImage);

  // 查找当前画布图像所属的归档版本组
  const activeGroupFromArchive = session.archived_images?.find((group) => {
    if (group.primary_image?.url === currentDisplayImage?.url) return true;
    return group.extended_images?.some((img) => img.url === currentDisplayImage?.url);
  });

  const activePrimaryImageUrl = activeGroupFromArchive
    ? activeGroupFromArchive.primary_image?.url
    : primaryImageUrl;

  const activePrimaryRatio = activeGroupFromArchive
    ? activeGroupFromArchive.primary_image?.ratio
    : (session.primary_ratio || session.aspect_ratio || "1:1");

  const activePrimaryResolution = activeGroupFromArchive
    ? activeGroupFromArchive.primary_image?.resolution
    : (session.primary_resolution || session.resolution || "1k");

  const activeExtendedList = activeGroupFromArchive
    ? (activeGroupFromArchive.extended_images || [])
    : (session.extended_images || []);

  const activeCompletedExtendedList = activeExtendedList.filter(
    (img): img is typeof img & { url: string } => Boolean(img.url) && img.status !== "failed"
  );

  const activePendingExtendedList = activeExtendedList.filter(
    (img) => !img.url || (img.status && img.status !== "completed")
  );
  const workbenchVersionLabel = (() => {
    const activeVer = activeGroupFromArchive
      ? (session.archived_images ? session.archived_images.length - session.archived_images.indexOf(activeGroupFromArchive) : null)
      : ((session.archived_images || []).length + 1);
    return activeVer ? `版本 ${activeVer}${!activeGroupFromArchive ? " (当前)" : ""}` : null;
  })();




  // ── 事件处理（freehand / arrow 双分支）──────────────────────────────────

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getEventCoords(e, canvas);

    // 如果存在未确认保存的当前圈画，在开始新的圈画前自动清除它，关闭旧输入框
    if (labelInput) {
      cancelLabel();
    }

    setIsDrawing(true);

    if (activeTool === "freehand") {
      setShapes((prev) => [...prev, { type: "freehand", points: [coords] }]);
    } else {
      // 保存当前像素快照，用于箭头预览时恢复
      savedImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      pendingArrowRef.current = { from: coords, to: coords };
    }
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getEventCoords(e, canvas);

    if (activeTool === "freehand") {
      setShapes((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.type === "freehand") {
          return [...prev.slice(0, -1), { ...last, points: [...last.points, coords] }];
        }
        return prev;
      });
    } else if (pendingArrowRef.current) {
      pendingArrowRef.current.to = coords;
      // 恢复快照后画预览
      if (savedImageDataRef.current) {
        ctx.putImageData(savedImageDataRef.current, 0, 0);
      }
      if (activeTool === "arrow") {
        drawArrow(ctx, pendingArrowRef.current.from, coords);
      } else if (activeTool === "rect") {
        drawRect(ctx, pendingArrowRef.current.from, coords);
      } else if (activeTool === "ellipse") {
        drawEllipse(ctx, pendingArrowRef.current.from, coords);
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    // 防止 LabelInput 已弹出时，canvas 的 onMouseLeave 重复触发 stopDrawing
    // 导致 setLabelText("") 清空用户已输入的文字
    if (labelInput) return;
    if (
      (activeTool !== "arrow" && activeTool !== "rect" && activeTool !== "ellipse") ||
      !pendingArrowRef.current
    )
      return;

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const { from, to } = pendingArrowRef.current;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 10) {
      // 太短，取消
      if (ctx && savedImageDataRef.current) ctx.putImageData(savedImageDataRef.current, 0, 0);
      pendingArrowRef.current = null;
      return;
    }

    // 恢复快照（清除预览图形），由 shapes effect 重绘
    if (ctx && savedImageDataRef.current) ctx.putImageData(savedImageDataRef.current, 0, 0);

    // 但在输入框弹出期间，我们需要立刻重新画上刚刚松手那一刻的图形，确保用户输入文案时能够看见图形
    if (ctx) {
      if (activeTool === "arrow") {
        drawArrow(ctx, from, to);
      } else if (activeTool === "rect") {
        drawRect(ctx, from, to);
      } else if (activeTool === "ellipse") {
        drawEllipse(ctx, from, to);
      }
    }

    // 计算浮动 input 的 DOM 坐标（canvas 内坐标 → canvas DOM 坐标）
    const rect = canvas.getBoundingClientRect();
    const inputWidth = 210;  // 输入框容器预估宽度
    const inputHeight = 32;  // 输入框容器预估高度

    let domX = (to.x / canvas.width) * rect.width + 8;
    let domY = (to.y / canvas.height) * rect.height - 32;

    // 1. 右边缘检测与向左避让
    if (domX + inputWidth > rect.width) {
      domX = (to.x / canvas.width) * rect.width - inputWidth - 8;
    }
    // 2. 左边界限制
    domX = Math.max(8, domX);

    // 3. 上下边界粘滞约束
    domY = Math.max(8, Math.min(rect.height - inputHeight - 8, domY));

    setLabelInput({ x: domX, y: domY });
    setLabelText("");
    setTimeout(() => labelInputRef.current?.focus(), 50);
  };

  const confirmLabel = () => {
    if (!labelText.trim() || !pendingArrowRef.current) {
      cancelLabel();
      return;
    }
    const { from, to } = pendingArrowRef.current;
    setShapes((prev) => [
      ...prev,
      { type: activeTool as "arrow" | "rect" | "ellipse", from, to, label: labelText.trim() },
    ]);
    pendingArrowRef.current = null;
    savedImageDataRef.current = null;
    setLabelInput(null);
    setLabelText("");
  };

  const cancelLabel = () => {
    // 恢复到标注前的状态
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && savedImageDataRef.current) ctx.putImageData(savedImageDataRef.current, 0, 0);
    pendingArrowRef.current = null;
    savedImageDataRef.current = null;
    setLabelInput(null);
    setLabelText("");
  };

  const clearDrawing = () => {
    setShapes([]);
    pendingArrowRef.current = null;
    savedImageDataRef.current = null;
    setLabelInput(null);
    setLabelText("");
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleToggleDrawingMode = () => {
    setIsDrawingMode(!isDrawingMode);
    if (isDrawingMode) {
      clearDrawing();
      setActiveTool("freehand");
    }
  };

  const arrowShapes = shapes.filter(
    (s): s is typeof s & { type: "arrow" | "rect" | "ellipse" } =>
      s.type === "arrow" || s.type === "rect" || s.type === "ellipse"
  );

  const handleSubmitEdit = async () => {
    if (!currentDisplayImage) return;

    // 如果存在未确认保存的当前圈画，自动将其从画布清除以防未保存图像被截屏上传
    if (labelInput) {
      cancelLabel();
    }

    if (arrowShapes.length === 0) return; // B 方案：至少一个带标签的修改标注

    const canvas = drawingCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    try {
      setIsSubmittingEdit(true);

      // 合并原图 + 标注层
      const offscreen = document.createElement("canvas");
      offscreen.width = img.naturalWidth || img.width || canvas.width;
      offscreen.height = img.naturalHeight || img.height || canvas.height;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("无法初始化离屏 Canvas");

      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = "anonymous";
          i.src = src;
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("图片加载失败"));
        });

      const bgImg = await loadImg(currentDisplayImage.url);
      ctx.drawImage(bgImg, 0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);

      const blob: Blob = await new Promise((resolve, reject) => {
        offscreen.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas 导出 Blob 失败"));
        }, "image/png");
      });

      const file = new File([blob], `annotation-${Date.now()}.png`, { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      const uploadResult = await apiUpload<{ file_id: string }>("/api/uploads", fd);
      if (!uploadResult?.file_id) throw new Error("上传标注图片失败，未能获取 file_id");

      // 从标注标签编译描述
      const compiledDescription =
        "请按以下标注指令修改：\n" +
        arrowShapes
          .map((s, i) => {
            const typeName = s.type === "arrow" ? "箭头" : s.type === "rect" ? "矩形" : "椭圆";
            return `[标注${i + 1} (${typeName})]: ${s.label}`;
          })
          .join("\n");

      if (onSubmitEdit) {
        await onSubmitEdit(
          compiledDescription,
          uploadResult.file_id,
          currentDisplayImage.ratio,
          currentDisplayImage.resolution
        );
      }

      // 清理
      setIsDrawingMode(false);
      clearDrawing();
    } catch (err: any) {
      console.error(err);
      alert(`提交海报修改失败: ${err.message}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };


  // 4. 品牌 Logo 提取
  const logoMat = session.stream_b?.subject_materials?.find((m: any) => m.type === "logo");

  // Logo 定位 CSS 样式计算
  const getLogoOverlayStyle = (): React.CSSProperties => {
    if (!logoMat) return { display: "none" };
    const style: React.CSSProperties = {
      position: "absolute",
      width: `${logoScale}%`,
      opacity: logoOpacity / 100,
      pointerEvents: "none",
      zIndex: 10,
      transition: "all 0.15s ease-out",
    };

    const marginX = `${logoOffset}%`;
    const marginY = `${logoOffset}%`;

    switch (logoPosition) {
      case "top-left":
        style.top = marginY;
        style.left = marginX;
        break;
      case "top-right":
        style.top = marginY;
        style.right = marginX;
        break;
      case "top-center":
        style.top = marginY;
        style.left = "50%";
        style.transform = "translateX(-50%)";
        break;
      case "bottom-left":
        style.bottom = marginY;
        style.left = marginX;
        break;
      case "bottom-right":
        style.bottom = marginY;
        style.right = marginX;
        break;
      case "bottom-center":
        style.bottom = marginY;
        style.left = "50%";
        style.transform = "translateX(-50%)";
        break;
    }
    return style;
  };

  // 5. PNG / PDF 高保真客户端导出
  const handleExport = async (format: "png" | "pdf") => {
    if (!currentDisplayImage) return;
    await exportPoster({
      image: currentDisplayImage,
      sessionId: session.id,
      format,
      logo: logoMat
        ? {
            url: logoMat.url,
            position: logoPosition,
            scale: logoScale,
            offset: logoOffset,
            opacity: logoOpacity,
          }
        : undefined,
    });
  };

  const isPrimaryGenerating = isGenerating || primaryLoading;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "24px 32px",
        gap: 20,
        overflowY: "auto",
        height: "100%",
        width: "100%",
      }}
    >
      {/* 状态提醒光晕 */}
      <div
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          borderBottom: "1px solid rgba(55,53,47,0.06)",
          paddingBottom: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} style={{ color: "#487ca5" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#37352f" }}>画布预览与衍生图库</span>
        </div>
        <div style={{ display: "none", fontSize: 11, fontWeight: 600, color: "#9b9a97", background: "rgba(55,53,47,0.05)", padding: "2px 8px", borderRadius: 4 }}>
          当前规格: {session.aspect_ratio} · {session.resolution.toUpperCase()}
        </div>
      </div>

      {/* 画布区域（工具栏 + 画布卡片） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", gap: 12 }}>
        {isDrawingMode && (
          <AnnotationToolbar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            onClear={clearDrawing}
          />
        )}

      {/* 主画布卡片 */}
      <div
        className="no-scrollbar"
        style={{
          aspectRatio: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "9/16" : getRatioAspect(currentDisplayImage?.ratio || session.aspect_ratio),
          width: "auto",
          maxWidth: "100%",
          height: "calc(100vh - 360px)",
          minHeight: 280,
          background: (currentDisplayImage || isPrimaryGenerating) ? "#fff" : "rgba(255, 255, 255, 0.45)",
          backdropFilter: (currentDisplayImage || isPrimaryGenerating) ? "none" : "blur(12px)",
          border: (currentDisplayImage || isPrimaryGenerating) ? "1px solid rgba(55,53,47,0.1)" : "1px solid rgba(55,53,47,0.08)",
          borderRadius: 12,
          overflowY: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "auto" : "hidden",
          overflowX: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: (currentDisplayImage || isPrimaryGenerating) ? "0 8px 30px rgba(0,0,0,0.06)" : "0 8px 32px rgba(55,53,47,0.02)",
          flexShrink: 0,
          isolation: "isolate",
        }}
      >
        {isPrimaryGenerating && !currentDisplayImage ? (
          <BlueprintLoading session={session} />
        ) : currentDisplayImage ? (
          <div
            style={{
              position: "relative",
              width: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "100%" : "auto",
              height: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "auto" : "100%",
              aspectRatio: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "9/16" : getRatioAspect(currentDisplayImage?.ratio || session.aspect_ratio),
              alignSelf: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "flex-start" : "center",
            }}
          >
            {session.status === "failed" && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  right: 12,
                  padding: "8px 12px",
                  background: "rgba(224, 62, 62, 0.95)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  boxShadow: "0 4px 12px rgba(224, 62, 62, 0.2)",
                  zIndex: 30,
                }}
              >
                <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>重新生成失败 (显示上一版成功内容)</div>
                  <div style={{ opacity: 0.9, marginTop: 2, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {session.error_message || "发生未知绘图错误，请检查网络后重试"}
                  </div>
                </div>
              </div>
            )}
            <img
              ref={imageRef}
              src={currentDisplayImage.url}
              alt="海报主图"
              onLoad={() => setRedrawTrigger((prev) => prev + 1)}
              style={{
                width: "100%",
                height: currentDisplayImage.ratio === "9:32" ? "auto" : "100%",
                objectFit: currentDisplayImage.ratio === "9:32" ? "contain" : "cover"
              }}
            />
            {/* 标注画笔层 */}
            {isDrawingMode && (
              <>
                <canvas
                  ref={drawingCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 25,
                    cursor: activeTool === "freehand" ? "crosshair" : "cell",
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />

                {/* 浮动箭头标签 input */}
                {labelInput && (
                  <LabelInput
                    x={labelInput.x}
                    y={labelInput.y}
                    value={labelText}
                    onChange={setLabelText}
                    onConfirm={confirmLabel}
                    onCancel={cancelLabel}
                    inputRef={labelInputRef}
                  />
                )}
              </>
            )}

            {/* Logo 图层 */}
            {logoMat && (
              <div style={getLogoOverlayStyle()}>
                <img src={logoMat.url} style={{ width: "100%", height: "auto", display: "block" }} alt="Logo" />
              </div>
            )}
            {/* 浮水印 */}
            <div
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                backdropFilter: "blur(2px)",
                letterSpacing: "0.05em",
                zIndex: 15,
              }}
            >
              {currentDisplayImage.ratio} | {currentDisplayImage.resolution.toUpperCase()}
            </div>
            
            {/* 重新生成时的半透明蒙层与加载圈 */}
            {isPrimaryGenerating && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255, 255, 255, 0.7)",
                  backdropFilter: "blur(4px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  zIndex: 20,
                }}
              >
                {/* 圆形进度图标 */}
                <div style={{ position: "relative", width: 48, height: 48 }}>
                  <svg viewBox="0 0 64 64" style={{ width: 48, height: 48, animation: "spin 2s linear infinite", position: "absolute", inset: 0 }}>
                    <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(55,53,47,0.05)" strokeWidth="3" />
                    <circle
                      cx="32" cy="32" r="27"
                      fill="none"
                      stroke="url(#grad2)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="42 128"
                    />
                    <defs>
                      <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#487ca5" />
                        <stop offset="100%" stopColor="#4f8277" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      animation: "pulse 2s ease-in-out infinite",
                    }}
                  >
                    🎨
                  </div>
                </div>

                {/* 提示文案 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ fontSize: 9, fontFamily: 'Consolas, monospace', color: "#787774", letterSpacing: "0.08em" }}>
                    RE-RENDERING VISUALS...
                  </div>
                  {/* 跳动圆点 */}
                  <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #487ca5, #4f8277)",
                          animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Hover 预览大图 */}
            {!isPrimaryGenerating && (
              <div
                className="hover-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.2s",
                  cursor: "pointer",
                  zIndex: 12,
                }}
                onClick={() => setPreviewOpen(true)}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
              >
                <button
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#fff",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    cursor: "pointer",
                  }}
                >
                  <Eye size={18} style={{ color: "#37352f" }} />
                </button>
              </div>
            )}
          </div>
        ) : session.status === "failed" ? (
          <FailedView errorMessage={session.error_message} />
        ) : session.status === "init" || session.status === "clarifying" ? (
          <ClarifyingView />
        ) : session.status === "prompting" ? (
          <PromptingView />
        ) : (
          <WaitingView />
        )}
      </div>
      </div>

      {/* 满意度/操作动作栏 */}
      {canUseExtendActions && !isPrimaryGenerating && (
        <ActionBar
          currentDisplayImage={currentDisplayImage}
          isDrawingMode={isDrawingMode}
          arrowCount={arrowShapes.length}
          isSubmittingEdit={isSubmittingEdit}
          onExportPng={() => handleExport("png")}
          onExportPdf={() => handleExport("pdf")}
          onResolutionExtend={(url, ratio) => onResolutionExtendClick(url, ratio)}
          onExtend={(url, ratio) => onExtendClick(url, ratio)}
          onToggleDrawingMode={handleToggleDrawingMode}
          onSubmitEdit={handleSubmitEdit}
        />
      )}

      {/* Brand Logo 微调调节面板 */}
      {logoMat && currentDisplayImage && !isPrimaryGenerating && (
        <LogoAdjustPanel
          logoScale={logoScale}
          logoOffset={logoOffset}
          logoOpacity={logoOpacity}
          logoPosition={logoPosition}
          onScaleChange={setLogoScale}
          onOffsetChange={setLogoOffset}
          onOpacityChange={setLogoOpacity}
          onPositionChange={(v) => setLogoPosition(v as any)}
        />
      )}

      {/* 工作台（画廊） */}
      {currentDisplayImage && (
        <WorkbenchGallery
          activePrimaryImageUrl={activePrimaryImageUrl}
          activePrimaryRatio={activePrimaryRatio}
          activePrimaryResolution={activePrimaryResolution}
          activeCompletedExtendedList={activeCompletedExtendedList}
          activePendingExtendedList={activePendingExtendedList}
          currentDisplayImage={currentDisplayImage}
          isPrimaryGenerating={isPrimaryGenerating}
          versionLabel={workbenchVersionLabel}
          onSelectImage={setUserSelectedImage}
          onDeleteExtendedImage={onDeleteExtendedImage}
          onRetryExtend={onRetryExtend}
        />
      )}

      {/* 历史版本归档画廊 */}
      {((session.archived_images && session.archived_images.length > 0) || (session.generation_id && primaryImageUrl)) && (
        <HistoryVersions
          session={session}
          primaryImageUrl={primaryImageUrl}
          currentDisplayImage={currentDisplayImage}
          isPrimaryGenerating={isPrimaryGenerating}
          onSelectImage={setUserSelectedImage}
          onRetryExtend={onRetryExtend}
        />
      )}

      {/* Lightbox 双击放大弹窗 */}
      {previewOpen && currentDisplayImage && (
        <Lightbox
          image={currentDisplayImage}
          logoMat={logoMat}
          logoStyle={getLogoOverlayStyle()}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
