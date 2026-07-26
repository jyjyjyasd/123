import { cn } from "@/lib/utils";
import type { ActionKind, SizeKey } from "../api";
import {
  presetsForAction,
  RESOLUTION_PRESETS,
  type ResolutionKey,
  type SizePreset,
} from "../size-presets";

const sizeItem = (active: boolean) =>
  cn(
    "group flex flex-col items-center justify-end gap-1 rounded-md border py-2 px-1 transition-all min-w-0",
    "h-[96px]",
    active
      ? "border-text-primary bg-white shadow-sm"
      : "border-border-default bg-transparent hover:border-border-strong hover:bg-bg-hover",
  );

const segItem = (active: boolean, disabled?: boolean) =>
  cn(
    "relative flex items-center justify-center px-3 h-7 text-xs font-medium rounded-[4px] transition-all",
    active
      ? "bg-white text-text-primary shadow-sm ring-1 ring-border-default"
      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
    disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-text-secondary",
  );

const SegGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex inline-flex rounded-md border border-border-default bg-bg-secondary p-0.5">
    {children}
  </div>
);

// 按真实比例画的白色矩形（长边 40px）。比例由图形传达；卡片下显示场景名
// 主明 + 比例副明（两行）。auto 档无固定比例 → 虚线占位框。
const PRESET_LONG_EDGE = 40;

const ratioBoxStyle = (preset: SizePreset): React.CSSProperties => {
  if (preset.ratio == null) {
    return { width: 26, height: 26 };
  }
  const [w, h] = preset.ratio;
  const longest = Math.max(w, h);
  return {
    width: (w / longest) * PRESET_LONG_EDGE,
    height: (h / longest) * PRESET_LONG_EDGE,
  };
};

export const ParamsRow = ({
  action,
  size,
  resolution,
  onSize,
  onResolution,
  disabled,
}: {
  action: ActionKind;
  size: SizeKey;
  resolution: ResolutionKey;
  onSize: (v: SizeKey) => void;
  onResolution: (v: ResolutionKey) => void;
  disabled?: boolean;
}) => {
  const presets = presetsForAction(action);
  // size=auto 时 resolution 失效（输出跟随参考图）—— 段控件灰掉，但保留用户当前选择
  const resolutionDisabled = disabled || size === "auto";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">尺寸</div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}
        >
          {presets.map((p) => {
            const isActive = p.key === size;
            const isAuto = p.key === "auto";
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                onClick={() => onSize(p.key)}
                className={sizeItem(isActive)}
                aria-label={p.ratio ? `${p.name}（${p.ratio[0]}:${p.ratio[1]}）` : p.name}
                title={p.ratio ? `${p.name} · ${p.ratio[0]}:${p.ratio[1]}` : p.name}
              >
                <div className="flex-1 flex items-center justify-center w-full">
                  <div
                    style={ratioBoxStyle(p)}
                    className={cn(
                      "rounded-[2px] transition-colors",
                      isAuto
                        ? cn(
                            "border border-dashed",
                            isActive ? "border-text-primary" : "border-border-strong group-hover:border-text-primary",
                          )
                        : cn(
                            "border",
                            isActive
                              ? "border-text-primary bg-white"
                              : "border-border-strong bg-white group-hover:border-text-primary",
                          ),
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium leading-tight truncate max-w-full",
                    isActive ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {p.name}
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-none tabular-nums",
                    isActive ? "text-text-secondary" : "text-text-tertiary",
                  )}
                >
                  {p.ratio ? `${p.ratio[0]}:${p.ratio[1]}` : "auto"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">清晰度</div>
          {size === "auto" && (
            <span className="text-[10px] text-text-tertiary">auto 模式下输出像素跟随参考图</span>
          )}
        </div>
        <SegGroup>
          {RESOLUTION_PRESETS.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={resolutionDisabled}
              onClick={() => onResolution(r.key)}
              className={cn(segItem(r.key === resolution, resolutionDisabled), "px-6")}
            >
              {r.label}
            </button>
          ))}
        </SegGroup>
      </div>
    </div>
  );
};
