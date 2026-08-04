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

export function getRatioAspect(ratio: string): string {
  return RATIO_ASPECT[ratio] ?? "1/1";
}
