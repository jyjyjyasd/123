// features/agent/components/CanvasArea.tsx
// 右侧画布区域：展示生成结果 + 状态指示 + 尺寸和清晰度延伸 + Logo 微调 + 资产管理
// 对应 prd page.tsx 的整个右侧预览面板与交互功能

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Layers, Eye, Download, Sliders, Maximize2, Trash2, X, Paintbrush, Check, AlertCircle, RotateCcw } from "lucide-react";
import type { AgentSession } from "../types";
import { apiUpload } from "../../../lib/api";

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

// 比例 → CSS aspect-ratio 映射
const RATIO_ASPECT: Record<string, string> = {
  "1:1": "1/1",
  "16:9": "16/9",
  "9:16": "9/16",
  "4:3": "4/3",
  "3:4": "3/4",
  "3:2": "3/2",
  "2:3": "2/3",
  A4: "210/297",
  A4_Horizontal: "297/210",
  Banner: "3/1",
  "9:32": "9/32",
};

function getRatioAspect(ratio: string): string {
  return RATIO_ASPECT[ratio] ?? "1/1";
}

// ── Canvas Static Helpers ──────────────────────────────────────────────────

const getEventCoords = (
  e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
) => {
  const rect = canvas.getBoundingClientRect();
  let clientX: number, clientY: number;
  if ("touches" in e) {
    if (e.touches.length === 0) return { x: 0, y: 0 };
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
};

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#FF4D4F",
  headLen = 14
) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawLabel = (
  ctx: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  label: string
) => {
  const fontSize = 13; // 字号放大至 13px以提升可读性
  const padding = 5;   // 增加 padding 匹配大字号
  ctx.save();
  ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", sans-serif`;
  const textW = ctx.measureText(label).width;
  const bw = textW + padding * 2;
  const bh = fontSize + padding * 2;

  // 边缘检测与向内避让约束，将弹窗完整约束在图片画布尺寸范围内，避免截断和遮挡
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  let bx = tip.x + 8;
  let by = tip.y - fontSize - padding * 2 - 2;

  // 1. 右边缘检测与向左避让
  if (bx + bw > canvasW) {
    bx = tip.x - bw - 8;
  }
  // 2. 左边界限制
  bx = Math.max(8, bx);

  // 3. 上下边界限制
  by = Math.max(8, Math.min(canvasH - bh - 8, by));

  // 边框圆角：设置四角圆弧圆角 (r=4)，底层填充纯黑色背景
  const r = 4;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();

  // 文字配色：字体颜色改为白色
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, bx + padding, by + fontSize + padding - 2);
  ctx.restore();
};

const drawRect = (
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#FF4D4F"
) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x);
  const h = Math.abs(to.y - from.y);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
};

const drawEllipse = (
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#FF4D4F"
) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const rx = Math.abs(to.x - from.x) / 2;
  const ry = Math.abs(to.y - from.y) / 2;
  const cx = Math.min(from.x, to.x) + rx;
  const cy = Math.min(from.y, to.y) + ry;
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
};

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
  const [userSelectedImage, setUserSelectedImage] = useState<{
    url: string;
    ratio: string;
    resolution: string;
    isPrimary: boolean;
  } | null>(null);

  // Logo 微调相关状态
  const [logoPosition, setLogoPosition] = useState<
    "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center"
  >("top-center");
  const [logoScale, setLogoScale] = useState<number>(20); // 占比 10% - 40%
  const [logoOffset, setLogoOffset] = useState<number>(5);  // 边距 0% - 30%
  const [logoOpacity, setLogoOpacity] = useState<number>(100); // 透明度 10% - 100%

  // Lightbox 预览状态
  const [previewOpen, setPreviewOpen] = useState(false);

  // --- 海报圈画修改：工具和形状模型 ---
  type Point = { x: number; y: number };
  type FreehandShape = { type: "freehand"; points: Point[] };
  type ArrowShape    = { type: "arrow"; from: Point; to: Point; label: string };
  type RectShape     = { type: "rect"; from: Point; to: Point; label: string };
  type EllipseShape  = { type: "ellipse"; from: Point; to: Point; label: string };
  type DrawShape     = FreehandShape | ArrowShape | RectShape | EllipseShape;

  type DrawTool = "freehand" | "arrow" | "rect" | "ellipse";

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



  if (!session) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9b9a97",
          fontSize: 12,
          flexDirection: "column",
          gap: 16,
          height: "100%",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(55, 53, 47, 0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9b9a97",
          }}
        >
          <Paintbrush size={20} strokeWidth={1.5} />
        </div>
        <div style={{ fontWeight: 500, color: "#787774" }}>发起对话开始创作</div>
      </div>
    );
  }

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

    const imageUrl = currentDisplayImage.url;
    const ratio = currentDisplayImage.ratio;
    const baseName = `poster-${session.id}-${ratio.replace(":", "_")}`;
    const fileName = `${baseName}.${format}`;

    const logoUrl = logoMat?.url;

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
      });
    };

    try {
      if (logoUrl) {
        const [bgImg, logoImg] = await Promise.all([
          loadImage(imageUrl),
          loadImage(logoUrl),
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = bgImg.naturalWidth || bgImg.width || 1200;
        canvas.height = bgImg.naturalHeight || bgImg.height || 1200;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法初始化 Canvas 2D 绘图引擎");

        // 1. 绘制海报底图
        ctx.drawImage(bgImg, 0, 0);

        // 2. 绘制品牌 Logo
        ctx.save();
        ctx.globalAlpha = logoOpacity / 100;

        const canvasW = canvas.width;
        const canvasH = canvas.height;

        const logoW = canvasW * (logoScale / 100);
        const logoAspectRatio = logoImg.naturalHeight / logoImg.naturalWidth;
        const logoH = logoW * logoAspectRatio;

        const offsetX = canvasW * (logoOffset / 100);
        const offsetY = canvasH * (logoOffset / 100);

        let targetX = 0;
        let targetY = 0;

        switch (logoPosition) {
          case "top-left":
            targetX = offsetX;
            targetY = offsetY;
            break;
          case "top-right":
            targetX = canvasW - logoW - offsetX;
            targetY = offsetY;
            break;
          case "top-center":
            targetX = (canvasW - logoW) / 2;
            targetY = offsetY;
            break;
          case "bottom-left":
            targetX = offsetX;
            targetY = canvasH - logoH - offsetY;
            break;
          case "bottom-right":
            targetX = canvasW - logoW - offsetX;
            targetY = canvasH - logoH - offsetY;
            break;
          case "bottom-center":
            targetX = (canvasW - logoW) / 2;
            targetY = canvasH - logoH - offsetY;
            break;
        }

        ctx.drawImage(logoImg, targetX, targetY, logoW, logoH);
        ctx.restore();

        if (format === "pdf") {
          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          const { jsPDF } = await import("jspdf");
          const doc = new jsPDF({
            orientation: canvas.width > canvas.height ? "landscape" : "portrait",
            unit: "px",
            format: [canvas.width, canvas.height],
          });
          doc.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
          doc.save(fileName);
        } else {
          // PNG 下载
          const imgData = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = imgData;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        // 无 Logo 时的普通导出
        const bgImg = await loadImage(imageUrl);
        const canvas = document.createElement("canvas");
        canvas.width = bgImg.naturalWidth || bgImg.width || 1200;
        canvas.height = bgImg.naturalHeight || bgImg.height || 1200;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法初始化 Canvas 绘图引擎");
        ctx.drawImage(bgImg, 0, 0);

        if (format === "pdf") {
          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          const { jsPDF } = await import("jspdf");
          const doc = new jsPDF({
            orientation: canvas.width > canvas.height ? "landscape" : "portrait",
            unit: "px",
            format: [canvas.width, canvas.height],
          });
          doc.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
          doc.save(fileName);
        } else {
          // PNG 直接下载
          const a = document.createElement("a");
          a.href = imageUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`导出海报失败: ${err.message}`);
    }
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
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(rgba(72,124,165,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(72,124,165,0.02) 1px, transparent 1px), #faf9f6",
              backgroundSize: "16px 16px",
              gap: 20,
              overflow: "hidden",
            }}
          >
            {/* 蓝图视觉设计层 */}
            <div
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: session.aspect_ratio === "9:32" ? "50%" : 16,
                bottom: session.aspect_ratio === "9:32" ? "auto" : 16,
                transform: session.aspect_ratio === "9:32" ? "translateY(-50%)" : "none",
                minHeight: session.aspect_ratio === "9:32" ? 420 : "none",
                maxHeight: session.aspect_ratio === "9:32" ? 480 : "none",
                border: "1px dashed rgba(55,53,47,0.09)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                padding: 16,
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              {/* 顶栏：标尺与规格 */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: 'Consolas, monospace', color: "rgba(155, 154, 151, 0.6)", borderBottom: "1px dashed rgba(55,53,47,0.06)", paddingBottom: 6 }}>
                <div>[ CANVAS_SPEC: {session.aspect_ratio} ]</div>
                <div>{session.resolution.toUpperCase()} ULTRA_HD</div>
              </div>

              {/* 中间：版式示意虚线框与中置旋转加载 */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "12px 0", width: "100%" }}>
                {/* 模拟主体物定位框 */}
                <div
                  style={{
                    border: "1px dashed rgba(72,124,165,0.12)",
                    borderRadius: 4,
                    padding: "12px",
                    background: "rgba(72,124,165,0.01)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 9, color: "rgba(72, 124, 165, 0.6)", fontFamily: 'Consolas, monospace', textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    [ Subject Material Layer ]
                  </div>
                </div>

                {/* 中置直接旋转圆圈（处于定位框缝隙中，代替毛玻璃卡片） */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
                  {/* 圆形进度图标 */}
                  <div style={{ position: "relative", width: 48, height: 48 }}>
                    <svg viewBox="0 0 64 64" style={{ width: 48, height: 48, animation: "spin 2s linear infinite", position: "absolute", inset: 0 }}>
                      <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(55,53,47,0.05)" strokeWidth="3" />
                      <circle
                        cx="32" cy="32" r="27"
                        fill="none"
                        stroke="url(#grad)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="42 128"
                      />
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
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
                      RENDERING VISUALS...
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

                {/* 模拟文案区域 */}
                <div
                  style={{
                    border: "1px dashed rgba(79,130,119,0.12)",
                    borderRadius: 4,
                    padding: "12px",
                    background: "rgba(79,130,119,0.01)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 9, color: "rgba(79, 130, 119, 0.6)", fontFamily: 'Consolas, monospace', textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    [ Typography & Copy Layout ]
                  </div>
                </div>
              </div>

              {/* 底栏：设计元数据与参数 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 9, fontFamily: 'Consolas, monospace', color: "rgba(155, 154, 151, 0.6)", borderTop: "1px dashed rgba(55,53,47,0.06)", paddingTop: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div>ENGINE: diffusion_xl</div>
                  <div>SAMPLER: dpmpp_2m_sde</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>STRENGTH: {session.stream_b?.denoising_strength ?? 0.7}</div>
                  <div>STATUS: RENDERING...</div>
                </div>
              </div>
            </div>
          </div>
        ) : currentDisplayImage ? (
          <div
            style={{
              position: "relative",
              width: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "100%" : "auto",
              height: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "auto" : "100%",
              aspectRatio: (currentDisplayImage?.ratio || session.aspect_ratio) === "9:32" ? "9/16" : getRatioAspect(currentDisplayImage?.ratio || session.aspect_ratio),
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

                {/* 顶端工具切换 HUD */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    right: 8,
                    background: "rgba(255,255,255,0.95)",
                    backdropFilter: "blur(4px)",
                    border: "1px solid rgba(55,53,47,0.12)",
                    borderRadius: 6,
                    padding: "5px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    zIndex: 26,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* 工具切换 */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["freehand", "arrow", "rect", "ellipse"] as const).map((tool) => {
                      const label =
                        tool === "freehand"
                          ? "🖊 画笔"
                          : tool === "arrow"
                          ? "➡ 箭头"
                          : tool === "rect"
                          ? "▭ 矩形框选"
                          : "◯ 椭圆框选";
                      const active = activeTool === tool;
                      return (
                        <button
                          key={tool}
                          onClick={(e) => { e.stopPropagation(); setActiveTool(tool); }}
                          style={{
                            fontSize: 11,
                            padding: "3px 9px",
                            borderRadius: 4,
                            fontWeight: active ? 600 : 500,
                            border: active ? "1.5px solid #FF4D4F" : "1px solid rgba(55,53,47,0.15)",
                            background: active ? "rgba(255,77,79,0.08)" : "#fff",
                            color: active ? "#e03e3e" : "#37352F",
                            cursor: "pointer",
                            transition: "all 0.12s ease",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 清除 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); clearDrawing(); }}
                    style={{
                      fontSize: 11,
                      padding: "3px 9px",
                      borderRadius: 4,
                      fontWeight: 500,
                      background: "#F2F1EE",
                      color: "#37352F",
                      border: "1px solid #E3E2E0",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#E3E2E0"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#F2F1EE"; }}
                  >
                    🧹 清除
                  </button>
                </div>

                {/* 浮动箭头标签 input */}
                {labelInput && (
                  <div
                    style={{
                      position: "absolute",
                      left: labelInput.x,
                      top: Math.max(4, labelInput.y),
                      zIndex: 30,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#ffffff",
                      border: "1px solid #000000",
                      borderRadius: 0,
                      padding: "3px 6px",
                      boxShadow: "none",
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={labelInputRef}
                      value={labelText}
                      onChange={(e) => setLabelText(e.target.value)}
                      placeholder="这里要改什么？"
                      style={{
                        width: 140,
                        fontSize: 11,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "#000000",
                        fontWeight: 500,
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); confirmLabel(); }
                        if (e.key === "Escape") { e.preventDefault(); cancelLabel(); }
                      }}
                    />
                    <button
                      onClick={confirmLabel}
                      disabled={!labelText.trim()}
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 0,
                        fontWeight: 600,
                        background: labelText.trim() ? "#000000" : "#cccccc",
                        color: "#ffffff",
                        border: "none",
                        cursor: labelText.trim() ? "pointer" : "not-allowed",
                        transition: "background 0.12s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      确认
                    </button>
                  </div>
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              color: "#e03e3e",
              padding: "40px 24px",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(224, 62, 62, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e03e3e",
                marginBottom: 4,
              }}
            >
              <AlertCircle size={20} strokeWidth={1.5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
                海报生成失败
              </div>
              <div style={{ fontSize: 11, color: "#e03e3e", background: "rgba(224, 62, 62, 0.04)", border: "1px solid rgba(224, 62, 62, 0.12)", borderRadius: 6, padding: "8px 12px", lineHeight: "1.5", wordBreak: "break-all", fontFamily: "monospace" }}>
                {session.error_message || "未知错误，请检查网络或重试"}
              </div>
              <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6", marginTop: 4 }}>
                生成超时或绘图引擎繁忙。您可以尝试在左侧重新生成，或者返回上一步微调文案与排版。
              </div>
            </div>
          </div>
        ) : session.status === "init" || session.status === "clarifying" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              color: "#787774",
              padding: "40px 24px",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(55, 53, 47, 0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#787774",
                marginBottom: 4,
              }}
            >
              <Paintbrush size={20} strokeWidth={1.5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
                沟通设计意图
              </div>
              <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6" }}>
                请与右侧 AI 助理交谈，沟通您的设计创意。方案大纲生成后将在此处呈现。
              </div>
            </div>
          </div>
        ) : session.status === "prompting" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              color: "#787774",
              padding: "40px 24px",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(72, 124, 165, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#487ca5",
                marginBottom: 4,
              }}
            >
              <Check size={20} strokeWidth={1.5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#37352f", letterSpacing: "0.02em" }}>
                大纲配置已就绪
              </div>
              <div style={{ fontSize: 11, color: "#9b9a97", lineHeight: "1.6" }}>
                设计大纲已定稿。请点击右侧对话区底部的「开始生成海报」按钮以绘制主视觉。
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#9b9a97", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9b9a97", display: "inline-block", animation: "pulse 1.5s infinite" }} />
            等待海报绘制结果…
          </div>
        )}
      </div>

      {/* 满意度/操作动作栏 */}
      {canUseExtendActions && !isPrimaryGenerating && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: 480,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {/* 第一行：操作按钮组 */}
          <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => handleExport("png")}
              style={{
                padding: "8px 14px",
                background: "#fff",
                border: "1px solid rgba(55,53,47,0.12)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#37352f",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
              }}
            >
              <Download size={14} style={{ color: "#487ca5" }} />
              导出 PNG
            </button>
            <button
              onClick={() => handleExport("pdf")}
              style={{
                padding: "8px 14px",
                background: "#fff",
                border: "1px solid rgba(55,53,47,0.12)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#37352f",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
              }}
            >
              <Download size={14} style={{ color: "#4f8277" }} />
              导出 PDF
            </button>
            <button
              onClick={() => onResolutionExtendClick(currentDisplayImage?.url ?? undefined, currentDisplayImage?.ratio)}
              style={{
                padding: "8px 14px",
                background: "#fff",
                border: "1px solid rgba(55,53,47,0.12)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#37352f",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
              }}
            >
              <Sliders size={14} style={{ color: "#787774" }} />
              清晰度延伸
            </button>
            <button
              onClick={() => onExtendClick(currentDisplayImage?.url ?? undefined, currentDisplayImage?.ratio)}
              style={{
                padding: "8px 16px",
                background: "linear-gradient(135deg, #37352f, #22201d)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 2px 4px rgba(55,53,47,0.15)",
              }}
            >
              <Maximize2 size={14} />
              多尺寸延伸
            </button>
          </div>

          {/* 第二行：海报圈画修改控制行 */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              background: "rgba(55,53,47,0.02)",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(55,53,47,0.08)",
              width: "100%",
            }}
          >
            {/* 进入/退出标注模式 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDrawingMode(!isDrawingMode);
                if (isDrawingMode) {
                  clearDrawing();
                  setActiveTool("freehand");
                }
              }}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                border: isDrawingMode ? "2px solid #e03e3e" : "1px solid rgba(55,53,47,0.12)",
                background: isDrawingMode ? "#fdf2f2" : "#fff",
                color: isDrawingMode ? "#e03e3e" : "#37352f",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>{isDrawingMode ? "❌" : "🖌️"}</span>
              <span>{isDrawingMode ? "退出标注" : "海报修改"}</span>
            </button>

            {/* 提示文字 */}
            <span style={{ flex: 1, fontSize: 11, color: isDrawingMode ? "#9b9a97" : "rgba(55,53,47,0.3)", transition: "color 0.15s" }}>
              {isDrawingMode
                ? arrowShapes.length > 0
                  ? `已添加 ${arrowShapes.length} 个标注指令`
                  : "用箭头工具指向修改位置并输入指令"
                : "进入标注模式在海报上圈画"}
            </span>

            {/* 确认修改按钮 */}
            <button
              onClick={handleSubmitEdit}
              disabled={!isDrawingMode || arrowShapes.length === 0 || isSubmittingEdit}
              style={{
                fontSize: 12,
                padding: "6px 14px",
                borderRadius: 6,
                fontWeight: 600,
                background: "#37352F",
                color: "#FFF",
                border: "none",
                opacity: (!isDrawingMode || arrowShapes.length === 0 || isSubmittingEdit) ? 0.35 : 1,
                cursor: (!isDrawingMode || arrowShapes.length === 0 || isSubmittingEdit) ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              {isSubmittingEdit ? "提交中..." : `确认修改${arrowShapes.length > 0 ? ` (${arrowShapes.length})` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Brand Logo 微调调节面板 */}
      {logoMat && currentDisplayImage && !isPrimaryGenerating && (
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(55,53,47,0.09)",
            borderRadius: 8,
            padding: 14,
            width: "100%",
            maxWidth: 480,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.02)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#37352f", borderBottom: "1px solid rgba(55,53,47,0.06)", paddingBottom: 6 }}>
            🏷️ 品牌 Logo 微调设置
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>Logo 尺寸 ({logoScale}%)</span>
              <input
                type="range"
                min={10}
                max={40}
                value={logoScale}
                onChange={(e) => setLogoScale(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>边距偏移 ({logoOffset}%)</span>
              <input
                type="range"
                min={0}
                max={30}
                value={logoOffset}
                onChange={(e) => setLogoOffset(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>透明度 ({logoOpacity}%)</span>
              <input
                type="range"
                min={10}
                max={100}
                value={logoOpacity}
                onChange={(e) => setLogoOpacity(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#787774" }}>Logo 摆放位置</span>
              <select
                value={logoPosition}
                onChange={(e) => setLogoPosition(e.target.value as any)}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid rgba(55,53,47,0.16)",
                  background: "#fff",
                  outline: "none",
                }}
              >
                <option value="top-left">左上角</option>
                <option value="top-center">顶正中</option>
                <option value="top-right">右上角</option>
                <option value="bottom-left">左下角</option>
                <option value="bottom-center">底正中</option>
                <option value="bottom-right">右下角</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 工作台（画廊） */}
      {currentDisplayImage && (
        <div style={{ width: "100%", borderTop: "1px solid rgba(55,53,47,0.06)", paddingTop: 16, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#787774",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Layers size={14} style={{ color: "#4f8277" }} />
              工作台
            </div>
            {(() => {
              const activeVer = activeGroupFromArchive
                ? (session.archived_images ? session.archived_images.length - session.archived_images.indexOf(activeGroupFromArchive) : null)
                : ((session.archived_images || []).length + 1);
              return activeVer ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#4f8277", background: "rgba(79,130,119,0.08)", padding: "2px 6px", borderRadius: 4 }}>
                  版本 {activeVer} {!activeGroupFromArchive && "(当前)"}
                </span>
              ) : null;
            })()}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {/* 1. 主视觉原图 */}
            {activePrimaryImageUrl && (
              <div
                onClick={() => {
                  if (isPrimaryGenerating) return;
                  setUserSelectedImage({
                    url: activePrimaryImageUrl,
                    ratio: activePrimaryRatio || "1:1",
                    resolution: activePrimaryResolution || "1k",
                    isPrimary: true,
                  })
                }}
                title={`主图 • ${activePrimaryRatio || "1:1"}`}
                style={{
                  aspectRatio: getRatioAspect(activePrimaryRatio || "1:1"),
                  height: 90,
                  width: "auto",
                  background: "#f7f6f3",
                  border: `2px solid ${
                    (currentDisplayImage?.isPrimary && currentDisplayImage?.url === activePrimaryImageUrl) ? "#37352f" : "rgba(55,53,47,0.1)"
                  }`,
                  borderRadius: 6,
                  overflow: "hidden",
                  position: "relative",
                  cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                  opacity: isPrimaryGenerating ? 0.5 : 1,
                  boxShadow: (currentDisplayImage?.isPrimary && currentDisplayImage?.url === activePrimaryImageUrl) ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                  transition: "all 0.15s",
                }}
              >
                <img
                  src={activePrimaryImageUrl}
                  alt="主视觉原图"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 2,
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#fff",
                    background: "rgba(35,131,226,0.75)",
                    padding: "1px 4px",
                    borderRadius: 3,
                  }}
                >
                  {activePrimaryRatio === "9:32" ? "主" : `主图 • ${activePrimaryRatio}`}
                </div>
              </div>
            )}

            {/* 2. 延伸图列表 */}
            {activeCompletedExtendedList.map((img, idx) => {
              const aspect = getRatioAspect(img.ratio);
              const isActive = currentDisplayImage?.url === img.url;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isPrimaryGenerating) return;
                    setUserSelectedImage({
                      url: img.url,
                      ratio: img.ratio,
                      resolution: img.resolution || "1k",
                      isPrimary: false,
                    })
                  }}
                  title={`延伸 • ${img.ratio} | ${img.resolution?.toUpperCase() || "1K"}`}
                  style={{
                    aspectRatio: aspect,
                    height: 90,
                    width: "auto",
                    background: "#f7f6f3",
                    border: `2px solid ${isActive ? "#37352f" : "rgba(55,53,47,0.1)"}`,
                    borderRadius: 6,
                    overflow: "hidden",
                    position: "relative",
                    cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                    opacity: isPrimaryGenerating ? 0.5 : 1,
                    boxShadow: isActive ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                    transition: "all 0.15s",
                  }}
                  className="group"
                  onMouseEnter={(e) => {
                    if (isPrimaryGenerating) return;
                    const trash = e.currentTarget.querySelector(".trash-btn") as HTMLButtonElement;
                    if (trash) trash.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    if (isPrimaryGenerating) return;
                    const trash = e.currentTarget.querySelector(".trash-btn") as HTMLButtonElement;
                    if (trash) trash.style.opacity = "0";
                  }}
                >
                  <img src={img.url} alt={img.ratio} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 2,
                      left: 2,
                      fontSize: 8,
                      fontWeight: 700,
                      color: "#fff",
                      background: "rgba(0,0,0,0.6)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    {img.ratio === "9:32" ? "延" : `${img.ratio} | ${img.resolution?.toUpperCase() || "1K"}`}
                  </div>
                  <button
                    className="trash-btn"
                    title="删除延伸记录"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("确定要删除这张延伸图吗？")) return;
                      await onDeleteExtendedImage({ id: img.id || img.generation_id || undefined, url: img.url || "" });
                    }}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(224,62,62,0.9)",
                      border: "none",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: 0,
                      transition: "opacity 0.15s",
                      padding: 0,
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}

            {activePendingExtendedList.map((img, idx) => {
              const aspect = getRatioAspect(img.ratio);
              const progress = img.progress ?? (img.status === "running" ? 48 : 12);
              const isFailed = img.status === "failed";
              return (
                <div
                  key={img.generation_id || `pending-${idx}`}
                  style={{
                    aspectRatio: aspect,
                    height: 90,
                    width: "auto",
                    minWidth: 90,
                    background: isFailed ? "rgba(224,62,62,0.03)" : "#f7f6f3",
                    border: isFailed ? "1px dashed #ffa8a8" : "2px dashed rgba(72,124,165,0.24)",
                    borderRadius: 6,
                    overflow: "hidden",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 6,
                    padding: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!isFailed) return;
                    const trash = e.currentTarget.querySelector(".trash-btn") as HTMLButtonElement;
                    if (trash) trash.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    if (!isFailed) return;
                    const trash = e.currentTarget.querySelector(".trash-btn") as HTMLButtonElement;
                    if (trash) trash.style.opacity = "0";
                  }}
                >
                  {isFailed ? (
                    <>
                      {/* 比例标签 */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 2,
                          left: 2,
                          fontSize: 8,
                          fontWeight: 700,
                          color: "#e03e3e",
                          background: "rgba(224, 62, 62, 0.08)",
                          border: "1px solid rgba(224, 62, 62, 0.15)",
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        {img.ratio}
                      </div>

                      {/* 中央图标 + 文字 */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <AlertCircle size={15} color="#e03e3e" style={{ opacity: 0.9 }} />
                        <span style={{ fontSize: 9, color: "#e03e3e", fontWeight: 600 }}>生成失败</span>
                        {onRetryExtend && (
                          <button
                            title="重试生成"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onRetryExtend(img.ratio, img.resolution || "1k");
                            }}
                            style={{
                              marginTop: 2,
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                              background: "#e03e3e",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              padding: "2px 6px",
                              fontSize: 9,
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#c92a2a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#e03e3e";
                            }}
                          >
                            <RotateCcw size={8} />
                            重试
                          </button>
                        )}
                      </div>

                      {/* 右上角删除按钮，hover 显示 */}
                      <button
                        className="trash-btn"
                        title="删除失败记录"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("确定要删除这条失败记录吗？")) return;
                          await onDeleteExtendedImage({ id: img.id || img.generation_id || undefined, url: img.url || "" });
                        }}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "rgba(224,62,62,0.9)",
                          border: "none",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          opacity: 0,
                          transition: "opacity 0.15s",
                          padding: 0,
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#37352f" }}>
                        {img.ratio}
                      </div>
                      <div style={{ width: "100%", height: 6, borderRadius: 999, background: "rgba(55,53,47,0.08)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${progress}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #37352f, #787774)",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 10, color: "#787774", textAlign: "center", lineHeight: 1.3 }}>
                        {img.status === "running" ? "生成中" : "排队中"} · {progress}%
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 历史版本归档画廊 */}
      {((session.archived_images && session.archived_images.length > 0) || (session.generation_id && primaryImageUrl)) && (
        <div style={{ width: "100%", borderTop: "1px solid rgba(55,53,47,0.06)", paddingTop: 16, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#787774",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles size={14} style={{ color: "#9a713b" }} />
            历史版本
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 1. 当前活跃版本 */}
            {session.generation_id && primaryImageUrl && (
              <div
                style={{
                  background: "rgba(55, 53, 47, 0.02)",
                  border: "1px solid rgba(55, 53, 47, 0.05)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* 版本元数据头部 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, borderBottom: "1px solid rgba(55, 53, 47, 0.04)", paddingBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#4f8277", padding: "2px 6px", borderRadius: 4 }}>
                      版本 {((session.archived_images || []).length) + 1}
                    </span>
                    <span style={{ fontSize: 10, color: "#4f8277", fontWeight: 700 }}>当前版本 (创作中)</span>
                  </div>
                </div>

                {/* 卡片网格 */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                  {/* 主视觉原图 */}
                  {(() => {
                    const aspect = getRatioAspect(session.primary_ratio || session.aspect_ratio || "1:1");
                    const isActive = currentDisplayImage?.url === primaryImageUrl;
                    return (
                      <div
                        onClick={() => {
                          if (isPrimaryGenerating) return;
                          setUserSelectedImage({
                            url: primaryImageUrl,
                            ratio: session.primary_ratio || session.aspect_ratio || "1:1",
                            resolution: session.primary_resolution || session.resolution || "1k",
                            isPrimary: true,
                          });
                        }}
                        title={`主图 • ${session.primary_ratio || session.aspect_ratio} | ${session.primary_resolution?.toUpperCase() || "1K"}`}
                        style={{
                          aspectRatio: aspect,
                          height: 90,
                          width: "auto",
                          background: "#f7f6f3",
                          border: `2px solid ${isActive ? "#37352f" : "rgba(55,53,47,0.1)"}`,
                          borderRadius: 6,
                          overflow: "hidden",
                          position: "relative",
                          cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                          opacity: isPrimaryGenerating ? 0.5 : 1,
                          boxShadow: isActive ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        <img src={primaryImageUrl} alt="原图" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 2,
                            left: 2,
                            fontSize: 8,
                            fontWeight: 700,
                            color: "#fff",
                            background: "rgba(35,131,226,0.75)",
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          原图 • {session.primary_ratio || session.aspect_ratio}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 延伸图 */}
                  {(session.extended_images || []).map((img, idx) => {
                    const aspect = getRatioAspect(img.ratio);
                    const isActive = currentDisplayImage?.url === img.url;
                    const isFailed = img.status === "failed";

                    if (isFailed) {
                      return (
                        <div
                          key={img.generation_id || `current-ext-fail-${idx}`}
                          style={{
                            aspectRatio: aspect,
                            height: 90,
                            width: "auto",
                            minWidth: 90,
                            background: "rgba(224,62,62,0.03)",
                            border: "1px dashed #ffa8a8",
                            borderRadius: 6,
                            overflow: "hidden",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "column",
                            gap: 6,
                            padding: 8,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              bottom: 2,
                              left: 2,
                              fontSize: 8,
                              fontWeight: 700,
                              color: "#e03e3e",
                              background: "rgba(224, 62, 62, 0.08)",
                              border: "1px solid rgba(224, 62, 62, 0.15)",
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                          >
                            {img.ratio}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <AlertCircle size={15} color="#e03e3e" style={{ opacity: 0.9 }} />
                            <span style={{ fontSize: 9, color: "#e03e3e", fontWeight: 600 }}>生成失败</span>
                            {onRetryExtend && (
                              <button
                                title="重试生成"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await onRetryExtend(img.ratio, img.resolution || "1k");
                                }}
                                style={{
                                  marginTop: 2,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 2,
                                  background: "#e03e3e",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 4,
                                  padding: "2px 6px",
                                  fontSize: 9,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  transition: "background 0.2s",
                                }}
                              >
                                <RotateCcw size={8} />
                                重试
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (!img.url) return null;

                    return (
                      <div
                        key={img.id || img.generation_id || idx}
                        onClick={() => {
                          if (isPrimaryGenerating) return;
                          setUserSelectedImage({
                            url: img.url!,
                            ratio: img.ratio,
                            resolution: img.resolution || "1k",
                            isPrimary: false,
                          });
                        }}
                        title={`延伸 • ${img.ratio} | ${img.resolution?.toUpperCase() || "1K"}`}
                        style={{
                          aspectRatio: aspect,
                          height: 90,
                          width: "auto",
                          background: "#f7f6f3",
                          border: `2px solid ${isActive ? "#37352f" : "rgba(55,53,47,0.1)"}`,
                          borderRadius: 6,
                          overflow: "hidden",
                          position: "relative",
                          cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                          opacity: isPrimaryGenerating ? 0.5 : 1,
                          boxShadow: isActive ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        <img src={img.url!} alt={img.ratio} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 2,
                            left: 2,
                            fontSize: 8,
                            fontWeight: 700,
                            color: "#fff",
                            background: "rgba(0,0,0,0.6)",
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          延伸 • {img.ratio} | {img.resolution?.toUpperCase() || "1K"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. 历史归档版本 */}
            {(session.archived_images || []).map((group, groupIdx) => {
              const primary = group.primary_image;
              const groupExt = group.extended_images || [];
              const formattedTime = new Date(group.created_at).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={group.batch_id || groupIdx}
                  style={{
                    background: "rgba(55, 53, 47, 0.02)",
                    border: "1px solid rgba(55, 53, 47, 0.05)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {/* 版本元数据头部 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, borderBottom: "1px solid rgba(55, 53, 47, 0.04)", paddingBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#37352f", background: "#f1f0e8", padding: "2px 6px", borderRadius: 4 }}>
                        版本 {session.archived_images!.length - groupIdx}
                      </span>
                      <span style={{ fontSize: 10, color: "#9b9a97", fontWeight: 500 }}>{formattedTime}</span>
                    </div>
                  </div>

                  {/* 卡片网格 */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                    {/* 1. 主视觉原图 */}
                    {primary && primary.url && (() => {
                      const aspect = getRatioAspect(primary.ratio);
                      const isActive = currentDisplayImage?.url === primary.url;
                      return (
                        <div
                          onClick={() => {
                            if (isPrimaryGenerating) return;
                            setUserSelectedImage({
                              url: primary.url!,
                              ratio: primary.ratio,
                              resolution: primary.resolution || "1k",
                              isPrimary: true,
                            });
                          }}
                          title={`主图 • ${primary.ratio} | ${primary.resolution?.toUpperCase() || "1K"}`}
                          style={{
                            aspectRatio: aspect,
                            height: 90,
                            width: "auto",
                            background: "#f7f6f3",
                            border: `2px solid ${isActive ? "#37352f" : "rgba(55,53,47,0.1)"}`,
                            borderRadius: 6,
                            overflow: "hidden",
                            position: "relative",
                            cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                            opacity: isPrimaryGenerating ? 0.5 : 1,
                            boxShadow: isActive ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                            transition: "all 0.15s",
                          }}
                        >
                          <img src={primary.url!} alt="原图" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 2,
                              left: 2,
                              fontSize: 8,
                              fontWeight: 700,
                              color: "#fff",
                              background: "rgba(35,131,226,0.75)",
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                          >
                            原图 • {primary.ratio}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 2. 延伸图与失败卡片 */}
                    {groupExt.map((img, idx) => {
                      const aspect = getRatioAspect(img.ratio);
                      const isActive = currentDisplayImage?.url === img.url;
                      const isFailed = img.status === "failed";

                      if (isFailed) {
                        return (
                          <div
                            key={img.generation_id || `archived-ext-fail-${idx}`}
                            style={{
                              aspectRatio: aspect,
                              height: 90,
                              width: "auto",
                              minWidth: 90,
                              background: "rgba(224,62,62,0.03)",
                              border: "1px dashed #ffa8a8",
                              borderRadius: 6,
                              overflow: "hidden",
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexDirection: "column",
                              gap: 6,
                              padding: 8,
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                bottom: 2,
                                left: 2,
                                fontSize: 8,
                                fontWeight: 700,
                                color: "#e03e3e",
                                background: "rgba(224, 62, 62, 0.08)",
                                border: "1px solid rgba(224, 62, 62, 0.15)",
                                padding: "1px 4px",
                                borderRadius: 3,
                              }}
                            >
                              {img.ratio}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              <AlertCircle size={15} color="#e03e3e" style={{ opacity: 0.9 }} />
                              <span style={{ fontSize: 9, color: "#e03e3e", fontWeight: 600 }}>生成失败</span>
                              {onRetryExtend && (
                                <button
                                  title="重试生成"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await onRetryExtend(img.ratio, img.resolution || "1k");
                                  }}
                                  style={{
                                    marginTop: 2,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                    background: "#e03e3e",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "2px 6px",
                                    fontSize: 9,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "background 0.2s",
                                  }}
                                >
                                  <RotateCcw size={8} />
                                  重试
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (!img.url) return null;

                      return (
                        <div
                          key={img.id || img.generation_id || idx}
                          onClick={() => {
                            if (isPrimaryGenerating) return;
                            setUserSelectedImage({
                              url: img.url!,
                              ratio: img.ratio,
                              resolution: img.resolution || "1k",
                              isPrimary: false,
                            });
                          }}
                          title={`延伸 • ${img.ratio} | ${img.resolution?.toUpperCase() || "1K"}`}
                          style={{
                            aspectRatio: aspect,
                            height: 90,
                            width: "auto",
                            background: "#f7f6f3",
                            border: `2px solid ${isActive ? "#37352f" : "rgba(55,53,47,0.1)"}`,
                            borderRadius: 6,
                            overflow: "hidden",
                            position: "relative",
                            cursor: isPrimaryGenerating ? "not-allowed" : "pointer",
                            opacity: isPrimaryGenerating ? 0.5 : 1,
                            boxShadow: isActive ? "0 4px 12px rgba(55,53,47,0.15)" : "none",
                            transition: "all 0.15s",
                          }}
                        >
                          <img src={img.url!} alt={img.ratio} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 2,
                              left: 2,
                              fontSize: 8,
                              fontWeight: 700,
                              color: "#fff",
                              background: "rgba(0,0,0,0.6)",
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                          >
                            延伸 • {img.ratio} | {img.resolution?.toUpperCase() || "1K"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox 双击放大弹窗 */}
      {previewOpen && currentDisplayImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            animation: "fadeIn 0.15s ease",
            padding: 24,
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <button
            onClick={() => setPreviewOpen(false)}
            style={{
              position: "absolute",
              right: 20,
              top: 20,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            <X size={18} />
          </button>
          <div
            className="no-scrollbar"
            style={{
              aspectRatio: currentDisplayImage.ratio === "9:32" ? "9/16" : getRatioAspect(currentDisplayImage.ratio),
              height: currentDisplayImage.ratio === "9:32" ? "90vh" : "auto",
              width: "auto",
              maxWidth: "100%",
              maxHeight: "90vh",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              overflowY: currentDisplayImage.ratio === "9:32" ? "auto" : "hidden",
              overflowX: "hidden",
              position: "relative",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentDisplayImage.url}
              style={{
                width: "100%",
                height: currentDisplayImage.ratio === "9:32" ? "auto" : "100%",
                objectFit: currentDisplayImage.ratio === "9:32" ? "contain" : "cover"
              }}
              alt="放大图"
            />
            {logoMat && (
              <div style={getLogoOverlayStyle()}>
                <img src={logoMat.url} style={{ width: "100%", height: "auto" }} alt="Logo" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
