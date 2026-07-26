import * as pdfjs from "@/vendor/pdfjs/pdf.mjs";

export const PDF_MIME = "application/pdf";
export const REFERENCE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export const REFERENCE_INPUT_ACCEPT = [
  ...REFERENCE_IMAGE_MIMES,
  PDF_MIME,
  ".pdf",
].join(",");
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

type PreparedReferenceFiles = {
  files: File[];
  notices: string[];
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../vendor/pdfjs/pdf.worker.mjs",
  import.meta.url,
).toString();

const blobFromCanvas = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("参考文件转换失败"));
    }, type);
  });

const baseName = (filename: string): string =>
  filename.replace(/\.[^.]+$/, "").trim() || "reference";

const isPdfFile = (file: File): boolean =>
  file.type === PDF_MIME || /\.pdf$/i.test(file.name);

const isSupportedImage = (file: File): boolean =>
  REFERENCE_IMAGE_MIMES.includes(file.type as (typeof REFERENCE_IMAGE_MIMES)[number]);

const renderPdfFirstPage = async (file: File): Promise<{ file: File; notice?: string }> => {
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const doc = await task.promise;

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建 PDF 渲染画布");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await blobFromCanvas(canvas, "image/png");
    const imageFile = new File([blob], `${baseName(file.name)}-page-1.png`, {
      type: "image/png",
      lastModified: file.lastModified,
    });

    return {
      file: imageFile,
      notice: doc.numPages > 1 ? `${file.name} 仅使用第 1 页作为参考图` : undefined,
    };
  } finally {
    await doc.destroy();
  }
};

export const prepareReferenceFiles = async (
  incoming: File[],
): Promise<PreparedReferenceFiles> => {
  const files: File[] = [];
  const notices: string[] = [];

  for (const file of incoming) {
    let prepared = file;

    if (isPdfFile(file)) {
      const rendered = await renderPdfFirstPage(file);
      prepared = rendered.file;
      if (rendered.notice) {
        notices.push(rendered.notice);
      }
    } else if (!isSupportedImage(file)) {
      notices.push(`${file.name} 不是支持的图片/PDF格式`);
      continue;
    }

    if (prepared.size <= 0) {
      notices.push(`${prepared.name} 文件为空`);
      continue;
    }

    if (prepared.size > MAX_REFERENCE_BYTES) {
      notices.push(`${prepared.name} 超过 10MB，未加入上传队列`);
      continue;
    }

    files.push(prepared);
  }

  return { files, notices };
};
