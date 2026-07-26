// v0.8 size 改为 apimart 比例字符串（'1:1' / '16:9' 等），与 resolution
// (1k/2k/4k) 组合决定实际像素。本清单是前端 UI 与后端白名单的单一事实源
// —— 改动这里必须同步 backend/app/routers/generations.py 的 _VALID_SIZES。

export type SizePreset = {
  /** apimart wire format：'1:1' / '9:16' / 'auto'。也是 DB params.size 的值。 */
  key: string;
  /** UI 主名（场景化）。 */
  name: string;
  /** ratio[0]:ratio[1] 用于缩略图 aspect-ratio。auto 档为 null。 */
  ratio: [number, number] | null;
  /** 'both' = generate / edit 都能选；'edit' = 仅 edit。 */
  availability: "both" | "edit";
};

export const SIZE_PRESETS: SizePreset[] = [
  { key: "1:1",  name: "方图",      ratio: [1, 1],   availability: "both" },
  { key: "4:3",  name: "横向 PPT",  ratio: [4, 3],   availability: "both" },
  { key: "3:4",  name: "小红书",    ratio: [3, 4],   availability: "both" },
  { key: "16:9", name: "宽屏",      ratio: [16, 9],  availability: "both" },
  { key: "9:16", name: "海报",      ratio: [9, 16],  availability: "both" },
  { key: "3:2",  name: "摄影",      ratio: [3, 2],   availability: "both" },
  { key: "2:3",  name: "杂志",      ratio: [2, 3],   availability: "both" },
  { key: "9:32", name: "详情页",    ratio: [9, 32],  availability: "both" },
  { key: "auto", name: "跟随参考图", ratio: null,    availability: "edit" },
];

export const DEFAULT_SIZE = "1:1";

export const presetsForAction = (action: "generate" | "edit"): SizePreset[] =>
  SIZE_PRESETS.filter((p) => p.availability === "both" || action === "edit");

const PRESET_BY_KEY: Record<string, SizePreset> = Object.fromEntries(
  SIZE_PRESETS.map((p) => [p.key, p]),
);

/** 解析任意 size 字符串 → [w, h] 比例数对。
 * - 新比例格式 '1:1' / '16:9'              → [1,1] / [16,9]
 * - v0.7 像素格式 '2048x2048'              → [2048, 2048]
 * - v0.7 像素格式 '1024x2560' (小写 x)     → [1024, 2560]
 * - 'auto' 或非法                           → null
 */
export const parseSize = (size: string): [number, number] | null => {
  const ratio = /^(\d+):(\d+)$/.exec(size);
  if (ratio) return [Number(ratio[1]), Number(ratio[2])];
  const pixel = /^(\d+)x(\d+)$/.exec(size);
  if (pixel) return [Number(pixel[1]), Number(pixel[2])];
  return null;
};

/** 历史/当前 size → 显示场景名。
 * - 在预设清单内：直接返回场景名（如 '方图'）
 * - 像素值（老历史）：返回 '1024×2560' 之类的兜底
 * - 比例字符串但不在清单内：原样返回
 */
export const sizeDisplayName = (size: string): string => {
  const p = PRESET_BY_KEY[size];
  if (p) return p.name;
  if (size === "auto") return "自动";
  const pixel = /^(\d+)x(\d+)$/.exec(size);
  if (pixel) return `${pixel[1]}×${pixel[2]}`;
  return size;
};

/** inline style 用的 aspect-ratio 值。Tailwind JIT 扫不到 `aspect-[${w}/${h}]`
 *  这种动态拼接的类名，所以走 inline style。 */
export const aspectRatioStyle = (
  size: string,
): React.CSSProperties => {
  const wh = parseSize(size);
  if (!wh) return { aspectRatio: "1 / 1" };
  return { aspectRatio: `${wh[0]} / ${wh[1]}` };
};

// ───── Resolution（v0.8 新增）─────

export type ResolutionKey = "1k" | "2k" | "4k";

export const RESOLUTION_PRESETS: Array<{ key: ResolutionKey; label: string }> = [
  { key: "1k", label: "1K" },
  { key: "2k", label: "2K" },
  { key: "4k", label: "4K" },
];

export const DEFAULT_RESOLUTION: ResolutionKey = "1k";

export const resolutionLabel = (k: string | null | undefined): string => {
  if (!k) return "";
  return k.toUpperCase();
};
