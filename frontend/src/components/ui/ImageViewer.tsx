import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { cn } from "@/lib/utils";

// 沉浸式查看器 —— 全屏暗背景 + 浮动玻璃工具条；2.2s 不动则工具条淡出。
// 缩放：1× ~ 8×；以光标位置为锚点 (wheel + 双击)。
// 键盘：Esc 关闭、←/→ 切图、+/-/0、双击切换 1×↔2.5×。
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_CLICK_SCALE = 2.5;
const ZOOM_STEP_KEY = 0.25;
// 鼠标滚轮（大 deltaY）vs trackpad pinch（ctrlKey + 小 deltaY）
const WHEEL_SENSITIVITY = 0.0018;
const TRACKPAD_PINCH_SENSITIVITY = 0.012;
const CONTROLS_AUTOHIDE_MS = 2200;

export type ImageViewerItem = {
  src: string;
  alt?: string;
  downloadUrl?: string;
  downloadName?: string;
};

export type ImageViewerProps = {
  images: ImageViewerItem[];
  index: number;
  onIndexChange?: (i: number) => void;
  onClose: () => void;
  caption?: ReactNode;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const ImageViewer = ({
  images,
  index,
  onIndexChange,
  onClose,
  caption,
}: ImageViewerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const hideTimer = useRef<number | null>(null);
  // wheel handler 通过 ref 读最新 scale/tx/ty，避免重复绑定 native listener
  const stateRef = useRef({ scale: 1, tx: 0, ty: 0 });

  useLayoutEffect(() => {
    stateRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  const total = images.length;
  const safeIndex = clamp(index, 0, Math.max(0, total - 1));
  const current = images[safeIndex];

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  // 锁滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_AUTOHIDE_MS);
  }, []);

  // 入口与切图自动起一个 autohide 倒计时；setState 仅在 setTimeout 异步回调里发生，
  // 不属于"effect 内同步 setState"。
  useEffect(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_AUTOHIDE_MS);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [index]);

  // 切图前先复位变换。注意：所有 index 变更都流经 goPrev/goNext，
  // 因此在事件处理函数里 reset() 即可，不需要 effect 监听 index。
  const goPrev = useCallback(() => {
    if (total <= 1) return;
    reset();
    onIndexChange?.((safeIndex - 1 + total) % total);
  }, [onIndexChange, reset, safeIndex, total]);

  const goNext = useCallback(() => {
    if (total <= 1) return;
    reset();
    onIndexChange?.((safeIndex + 1) % total);
  }, [onIndexChange, reset, safeIndex, total]);

  const stepZoom = useCallback((delta: number) => {
    const { scale: s } = stateRef.current;
    const ns = clamp(s + delta, MIN_SCALE, MAX_SCALE);
    if (ns === s) return;
    setScale(ns);
    if (ns === 1) {
      setTx(0);
      setTy(0);
    }
  }, []);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        bumpControls();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        bumpControls();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(ZOOM_STEP_KEY);
        bumpControls();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepZoom(-ZOOM_STEP_KEY);
        bumpControls();
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        reset();
        bumpControls();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bumpControls, goNext, goPrev, onClose, reset, stepZoom]);

  // wheel/pinch 缩放——以光标为锚点。React 的 onWheel 在某些版本是 passive，
  // preventDefault 会失败；用原生监听器并手动加 passive:false。
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const sensitivity = e.ctrlKey ? TRACKPAD_PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
      const factor = Math.exp(-e.deltaY * sensitivity);

      const { scale: s, tx: ctx, ty: cty } = stateRef.current;
      const ns = clamp(s * factor, MIN_SCALE, MAX_SCALE);
      if (ns === s) return;
      const rf = ns / s;
      setScale(ns);
      if (ns === 1) {
        setTx(0);
        setTy(0);
      } else {
        setTx(cx - (cx - ctx) * rf);
        setTy(cy - (cy - cty) * rf);
      }
      bumpControls();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [bumpControls]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const { scale: s, tx: ctx, ty: cty } = stateRef.current;
      if (s > 1.05) {
        reset();
      } else {
        const ns = DOUBLE_CLICK_SCALE;
        const rf = ns / s;
        setScale(ns);
        setTx(cx - (cx - ctx) * rf);
        setTy(cy - (cy - cty) * rf);
      }
      bumpControls();
    },
    [bumpControls, reset],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 仅放大态可拖拽；在 1× 让 onClick 处理"点空白关闭"。
      if (stateRef.current.scale <= 1) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: stateRef.current.tx,
        ty: stateRef.current.ty,
      };
      bumpControls();
    },
    [bumpControls],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTx(dragStart.current.tx + dx);
    setTy(dragStart.current.ty + dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer may have been canceled
    }
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  // 1× 时点击空白关闭；放大时不关闭，避免误触
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (stateRef.current.scale > 1) return;
      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
        // 1× 时图像与画布等价，点哪都关
        onClose();
      }
    },
    [onClose],
  );

  if (!current) return null;

  const cursor = scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in";

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0a0a0a]/95 backdrop-blur-sm animate-[fadeIn_180ms_ease-out] select-none"
      onMouseMove={bumpControls}
      role="dialog"
      aria-modal="true"
    >
      {/* 画布 */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onCanvasClick}
        style={{ cursor }}
      >
        <img
          key={current.src}
          src={current.src}
          alt={current.alt ?? ""}
          draggable={false}
          className="max-w-[92vw] max-h-[88vh] object-contain pointer-events-none"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 80ms ease-out",
            willChange: "transform",
            opacity: 0,
            animation: "viewerImageIn 220ms ease-out forwards",
          }}
        />
      </div>

      {/* 顶部 caption 玻璃条 */}
      {(total > 1 || caption) && (
        <div
          className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-md",
            "bg-white/[0.06] border border-white/10 backdrop-blur-md",
            "transition-opacity duration-200",
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {total > 1 && (
            <span className="text-xs tabular-nums px-1 text-white/75">
              {safeIndex + 1} <span className="text-white/40">/</span> {total}
            </span>
          )}
          {total > 1 && caption && (
            <span className="h-3 w-px bg-white/15" aria-hidden />
          )}
          {caption && (
            <span className="text-xs text-white/75 max-w-[44vw] truncate">
              {caption}
            </span>
          )}
        </div>
      )}

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "absolute top-4 right-4 z-10 inline-flex items-center justify-center h-9 w-9 rounded-md",
          "bg-white/[0.06] border border-white/10 backdrop-blur-md text-white/80",
          "hover:bg-white/[0.14] hover:text-white transition-all duration-150",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-label="关闭 (Esc)"
        title="关闭 (Esc)"
      >
        <X size={16} />
      </button>

      {/* 左右切换 */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center h-11 w-11 rounded-md",
              "bg-white/[0.06] border border-white/10 backdrop-blur-md text-white/80",
              "hover:bg-white/[0.14] hover:text-white transition-all duration-150",
              controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-label="上一张 (←)"
            title="上一张 (←)"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={goNext}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center h-11 w-11 rounded-md",
              "bg-white/[0.06] border border-white/10 backdrop-blur-md text-white/80",
              "hover:bg-white/[0.14] hover:text-white transition-all duration-150",
              controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-label="下一张 (→)"
            title="下一张 (→)"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* 底部工具条 */}
      <div
        className={cn(
          "absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1.5 py-1 rounded-md",
          "bg-white/[0.06] border border-white/10 backdrop-blur-md",
          "transition-opacity duration-200",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ToolButton
          onClick={() => {
            stepZoom(-ZOOM_STEP_KEY);
            bumpControls();
          }}
          title="缩小 (-)"
          disabled={scale <= MIN_SCALE}
        >
          <ZoomOut size={15} />
        </ToolButton>
        <div className="px-2 min-w-[54px] text-center text-xs tabular-nums text-white/85">
          {Math.round(scale * 100)}%
        </div>
        <ToolButton
          onClick={() => {
            stepZoom(ZOOM_STEP_KEY);
            bumpControls();
          }}
          title="放大 (+)"
          disabled={scale >= MAX_SCALE}
        >
          <ZoomIn size={15} />
        </ToolButton>

        <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />

        <ToolButton
          onClick={() => {
            reset();
            bumpControls();
          }}
          title="复位 (0)"
          disabled={scale === 1 && tx === 0 && ty === 0}
        >
          <RotateCcw size={14} />
        </ToolButton>

        {current.downloadUrl && (
          <>
            <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
            <a
              href={current.downloadUrl}
              download={current.downloadName ?? ""}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-white/85 hover:bg-white/10 hover:text-white transition-colors"
              title="下载"
              aria-label="下载"
            >
              <Download size={14} />
            </a>
          </>
        )}
      </div>
    </div>
  );
};

const ToolButton = ({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    disabled={disabled}
    className={cn(
      "inline-flex items-center justify-center h-7 w-7 rounded-sm text-white/85 transition-colors",
      "hover:bg-white/10 hover:text-white",
      "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/85",
    )}
  >
    {children}
  </button>
);
