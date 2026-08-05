// canvas/galleries.tsx — 工作台画廊与历史版本画廊
import { AlertCircle, Layers, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import type { AgentSession, ExtendedImage } from "../../types";
import { getRatioAspect } from "./ratio";
import type { DisplayImage } from "./types";

export type CompletedExtendedImage = ExtendedImage & { url: string };

export interface DeleteExtendedImageTarget {
  id?: string;
  url: string;
}

export function WorkbenchGallery({
  activePrimaryImageUrl,
  activePrimaryRatio,
  activePrimaryResolution,
  activeCompletedExtendedList,
  activePendingExtendedList,
  currentDisplayImage,
  isPrimaryGenerating,
  versionLabel,
  onSelectImage,
  onDeleteExtendedImage,
  onRetryExtend,
}: {
  activePrimaryImageUrl: string | null | undefined;
  activePrimaryRatio: string | null | undefined;
  activePrimaryResolution: string | null | undefined;
  activeCompletedExtendedList: CompletedExtendedImage[];
  activePendingExtendedList: ExtendedImage[];
  currentDisplayImage: DisplayImage | null;
  isPrimaryGenerating: boolean;
  versionLabel: string | null;
  onSelectImage: (image: DisplayImage) => void;
  onDeleteExtendedImage: (target: DeleteExtendedImageTarget) => Promise<void>;
  onRetryExtend?: (ratio: string, resolution: string) => Promise<void>;
}) {
  return (
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
        {versionLabel ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#4f8277", background: "rgba(79,130,119,0.08)", padding: "2px 6px", borderRadius: 4 }}>
            {versionLabel}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {/* 1. 主视觉原图 */}
        {activePrimaryImageUrl && (
          <div
            onClick={() => {
              if (isPrimaryGenerating) return;
              onSelectImage({
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
                onSelectImage({
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
  );
}

export function HistoryVersions({
  session,
  primaryImageUrl,
  currentDisplayImage,
  isPrimaryGenerating,
  onSelectImage,
  onRetryExtend,
}: {
  session: AgentSession;
  primaryImageUrl: string | null;
  currentDisplayImage: DisplayImage | null;
  isPrimaryGenerating: boolean;
  onSelectImage: (image: DisplayImage) => void;
  onRetryExtend?: (ratio: string, resolution: string) => Promise<void>;
}) {
  return (
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
                      onSelectImage({
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
                      onSelectImage({
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
                        background: img.source === "primary" ? "rgba(35,131,226,0.75)" : img.source === "edit" ? "rgba(79,130,119,0.75)" : "rgba(0,0,0,0.6)",
                        padding: "1px 4px",
                        borderRadius: 3,
                      }}
                    >
                      {img.source === "primary" ? "原图" : img.source === "edit" ? "修改" : "延伸"} • {img.ratio} | {img.resolution?.toUpperCase() || "1K"}
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
                        onSelectImage({
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
                        onSelectImage({
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
                          background: img.source === "primary" ? "rgba(35,131,226,0.75)" : img.source === "edit" ? "rgba(79,130,119,0.75)" : "rgba(0,0,0,0.6)",
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        {img.source === "primary" ? "原图" : img.source === "edit" ? "修改" : "延伸"} • {img.ratio} | {img.resolution?.toUpperCase() || "1K"}
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
  );
}
