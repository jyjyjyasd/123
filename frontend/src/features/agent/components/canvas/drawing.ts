// canvas/drawing.ts — 画布绘图原语与形状模型
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

export type Point = { x: number; y: number };
export type FreehandShape = { type: "freehand"; points: Point[] };
export type ArrowShape = { type: "arrow"; from: Point; to: Point; label: string };
export type RectShape = { type: "rect"; from: Point; to: Point; label: string };
export type EllipseShape = { type: "ellipse"; from: Point; to: Point; label: string };
export type DrawShape = FreehandShape | ArrowShape | RectShape | EllipseShape;

export type DrawTool = "freehand" | "arrow" | "rect" | "ellipse";

export const getEventCoords = (
  e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>,
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

export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
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

export const drawLabel = (
  ctx: CanvasRenderingContext2D,
  tip: Point,
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

export const drawRect = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
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

export const drawEllipse = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
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
