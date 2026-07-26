declare module "@/vendor/pdfjs/pdf.mjs" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(src: {
    data: Uint8Array;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(input: { scale: number }): {
          width: number;
          height: number;
        };
        render(input: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }): {
          promise: Promise<void>;
        };
      }>;
      destroy(): Promise<void> | void;
    }>;
  };
}
