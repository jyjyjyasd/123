// canvas/lightbox.tsx — Lightbox 预览弹窗
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { getRatioAspect } from "./ratio";
import type { DisplayImage } from "./types";

export function Lightbox({
  image,
  logoMat,
  logoStyle,
  onClose,
}: {
  image: DisplayImage;
  logoMat?: { url: string } | null;
  logoStyle: CSSProperties;
  onClose: () => void;
}) {
  return (
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
      onClick={onClose}
    >
      <button
        onClick={onClose}
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
          aspectRatio: image.ratio === "9:32" ? "9/16" : getRatioAspect(image.ratio),
          height: image.ratio === "9:32" ? "90vh" : "auto",
          width: "auto",
          maxWidth: "100%",
          maxHeight: "90vh",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          overflowY: image.ratio === "9:32" ? "auto" : "hidden",
          overflowX: "hidden",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={image.url}
          style={{
            width: "100%",
            height: image.ratio === "9:32" ? "auto" : "100%",
            objectFit: image.ratio === "9:32" ? "contain" : "cover"
          }}
          alt="放大图"
        />
        {logoMat && (
          <div style={logoStyle}>
            <img src={logoMat.url} style={{ width: "100%", height: "auto" }} alt="Logo" />
          </div>
        )}
      </div>
    </div>
  );
}
