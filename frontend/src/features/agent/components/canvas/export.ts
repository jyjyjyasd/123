// canvas/export.ts — PNG / PDF 高保真客户端导出
import type { DisplayImage } from "./types";

export type LogoPosition =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

export interface ExportLogoOptions {
  url: string;
  position: LogoPosition;
  scale: number;
  offset: number;
  opacity: number;
}

export interface ExportPosterOptions {
  image: DisplayImage;
  sessionId: string;
  format: "png" | "pdf";
  logo?: ExportLogoOptions;
}

export async function exportPoster({
  image,
  sessionId,
  format,
  logo,
}: ExportPosterOptions): Promise<void> {
  const imageUrl = image.url;
  const ratio = image.ratio;
  const baseName = `poster-${sessionId}-${ratio.replace(":", "_")}`;
  const fileName = `${baseName}.${format}`;

  const logoUrl = logo?.url;

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
      ctx.globalAlpha = logo!.opacity / 100;

      const canvasW = canvas.width;
      const canvasH = canvas.height;

      const logoW = canvasW * (logo!.scale / 100);
      const logoAspectRatio = logoImg.naturalHeight / logoImg.naturalWidth;
      const logoH = logoW * logoAspectRatio;

      const offsetX = canvasW * (logo!.offset / 100);
      const offsetY = canvasH * (logo!.offset / 100);

      let targetX = 0;
      let targetY = 0;

      switch (logo!.position) {
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
}
