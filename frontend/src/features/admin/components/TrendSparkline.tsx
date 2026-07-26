import type { AdminTrendDay } from "../api";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

const parseDayUTC = (iso: string): { day: number; weekday: number } => {
  // Backend ISO date is UTC calendar day; render label in the same calendar
  // so bar numbers match the date string. Phase 1 LAN single-tz tolerance.
  const day = Number(iso.split("-")[2]);
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return { day, weekday };
};

export const TrendSparkline = ({ days }: { days: AdminTrendDay[] }) => {
  const max = Math.max(1, ...days.map((d) => d.total));
  const total = days.reduce((s, d) => s + d.total, 0);
  const failed = days.reduce((s, d) => s + d.failed, 0);

  return (
    <section className="rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium text-text-primary">近 7 天趋势</div>
          <div className="text-xs text-text-tertiary">UTC 自然日</div>
        </div>
        <div className="text-xs text-text-tertiary tabular-nums">
          7 天合计 {total} 次 · 失败 {failed}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d, idx) => {
          const isToday = idx === days.length - 1;
          const { day, weekday } = parseDayUTC(d.date);
          const success = d.total - d.failed;
          const successPct = (success / max) * 100;
          const failedPct = (d.failed / max) * 100;

          return (
            <div
              key={d.date}
              className="flex flex-col items-center gap-1.5"
              title={`${d.date} · ${d.total} 次${d.failed > 0 ? ` · 失败 ${d.failed}` : ""}`}
            >
              {/* bar area */}
              <div className="relative w-full h-24 flex flex-col justify-end">
                {d.total === 0 ? (
                  <div className="w-full h-px bg-border-default" />
                ) : (
                  <div className="w-full flex flex-col justify-end gap-px">
                    {d.failed > 0 && (
                      <div
                        className="w-full bg-error/70 rounded-t-sm"
                        style={{ height: `${failedPct}%` }}
                      />
                    )}
                    <div
                      className={
                        "w-full " +
                        (d.failed > 0 ? "" : "rounded-t-sm ") +
                        "bg-text-primary"
                      }
                      style={{ height: `${successPct}%` }}
                    />
                  </div>
                )}
              </div>

              {/* labels */}
              <div className="flex flex-col items-center leading-tight">
                <div
                  className={
                    "text-xs tabular-nums " +
                    (isToday ? "text-text-primary font-medium" : "text-text-secondary")
                  }
                >
                  {isToday ? "今" : day}
                </div>
                <div className="text-[10px] text-text-tertiary">
                  {WEEKDAY[weekday]}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
