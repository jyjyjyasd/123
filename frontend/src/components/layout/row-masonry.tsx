import { useEffect, useState, type ReactNode } from "react";

// 行优先瀑布流：把 items 按 index % colCount 轮询分发到 N 列。
// 与 CSS columns 的"先填满第 1 列"不同，顶行就是最新的 N 张，
// 阅读顺序与 created_at DESC 直观一致。
//
// 代价：列归属由 index 决定，prepend 一张会让所有现有项跨列移动 →
// React 卸载/重建。规模小（屏内 ~20 张），缩略图走浏览器缓存，可接受。

const breakpoints = [
  { min: 1280, cols: 3 }, // xl
  { min: 768, cols: 2 }, // md
  { min: 0, cols: 1 },
] as const;

const computeCols = (): number => {
  const w = window.innerWidth;
  return breakpoints.find((b) => w >= b.min)?.cols ?? 1;
};

const useColumnCount = (): number => {
  const [n, setN] = useState(computeCols);
  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1280px)");
    const md = window.matchMedia("(min-width: 768px)");
    const update = () => setN(computeCols());
    xl.addEventListener("change", update);
    md.addEventListener("change", update);
    return () => {
      xl.removeEventListener("change", update);
      md.removeEventListener("change", update);
    };
  }, []);
  return n;
};

export const RowMasonry = <T,>({
  items,
  getKey,
  gap = "gap-4",
  children,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  gap?: string;
  children: (item: T, index: number) => ReactNode;
}) => {
  const cols = useColumnCount();
  const buckets: Array<Array<{ item: T; index: number }>> = Array.from(
    { length: cols },
    () => [],
  );
  items.forEach((item, index) => {
    buckets[index % cols].push({ item, index });
  });
  return (
    <div className={`flex items-start ${gap}`}>
      {buckets.map((bucket, i) => (
        <div key={i} className={`flex-1 min-w-0 flex flex-col ${gap}`}>
          {bucket.map(({ item, index }) => (
            <div key={getKey(item, index)}>{children(item, index)}</div>
          ))}
        </div>
      ))}
    </div>
  );
};
