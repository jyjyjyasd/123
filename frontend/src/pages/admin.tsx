import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/features/auth/hooks";
import { useAdminElevate, useAdminLock, useAdminStats } from "@/features/admin/hooks";
import { AdminGallery } from "@/features/admin/components/AdminGallery";
import { AdminGenerationDrawer } from "@/features/admin/components/AdminGenerationDrawer";
import { TrendSparkline } from "@/features/admin/components/TrendSparkline";
import { StorageCard } from "@/features/admin/components/StorageCard";
import type { AdminPeriod } from "@/features/admin/api";

type TabKey = "overview" | "gallery";

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return "未完成";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const AdminPage = () => {
  const me = useMe();
  const unlock = useAdminElevate();
  const lock = useAdminLock();
  const [secret, setSecret] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");
  const [activeId, setActiveId] = useState<string | null>(null);

  const canAccessAdmin = me.data?.is_admin ?? false;
  const isUnlocked = me.data?.is_admin_elevated ?? false;
  const stats = useAdminStats(canAccessAdmin && isUnlocked && tab === "overview");

  if (me.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        加载中…
      </div>
    );
  }

  if (!me.data) return <Navigate to="/login" replace />;
  if (!canAccessAdmin) return <Navigate to="/" replace />;

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) return;
    unlock.mutate(secret.trim(), {
      onSuccess: () => setSecret(""),
    });
  };

  return (
    <div className="max-w-[1120px] mx-auto px-6 py-8 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-text-primary">管理员面板</h1>
          <div className="text-sm text-text-tertiary">
            查看用量、失败情况和近期异常任务。
          </div>
        </div>
        {isUnlocked && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => lock.mutate()}
            disabled={lock.isPending}
          >
            {lock.isPending ? "锁定中…" : "锁定"}
          </Button>
        )}
      </div>

      {!isUnlocked && (
        <form
          onSubmit={handleUnlock}
          className="max-w-[420px] rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-text-primary">管理员二次验证</div>
            <div className="text-sm text-text-secondary">
              当前账号已在管理员白名单内，继续前需要输入管理员口令。
            </div>
          </div>

          <Input
            type="password"
            placeholder="管理员口令"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            disabled={unlock.isPending}
            autoComplete="current-password"
          />

          {unlock.error && (
            <div className="text-sm text-error" role="alert">
              {unlock.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="md"
              disabled={unlock.isPending || secret.trim().length === 0}
            >
              {unlock.isPending ? "解锁中…" : "解锁"}
            </Button>
            <div className="text-xs text-text-tertiary">
              解锁后 4 小时内有效，重新登录会失效。
            </div>
          </div>
        </form>
      )}

      {isUnlocked && (
        <>
          <TabBar tab={tab} onChange={setTab} />

          {tab === "gallery" && <AdminGallery enabled={isUnlocked} />}

          {tab === "overview" && (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard label="今日" period={stats.data?.today ?? null} />
            <MetricCard label="本月" period={stats.data?.month ?? null} />
          </div>

          {stats.data?.last_7_days && (
            <TrendSparkline days={stats.data.last_7_days} />
          )}

          {stats.isPending && (
            <div className="rounded-md border border-border-default bg-bg-primary p-6 text-sm text-text-tertiary">
              统计加载中…
            </div>
          )}

          {stats.error && (
            <div className="rounded-md border border-border-default bg-bg-primary p-6 flex items-center justify-between gap-4">
              <div className="text-sm text-error">加载统计失败：{stats.error.message}</div>
              <Button variant="ghost" size="sm" onClick={() => stats.refetch()}>
                重试
              </Button>
            </div>
          )}

          {!stats.isPending && !stats.error && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr] gap-4">
              <section className="rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">本月用量 Top 10</div>
                    <div className="text-xs text-text-tertiary">按任务数排序</div>
                  </div>
                </div>

                {stats.data?.top_users.length ? (
                  <div className="flex flex-col divide-y divide-border-default">
                    {stats.data.top_users.map((user, idx) => (
                      <div
                        key={user.user_id}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-6 text-sm text-text-tertiary tabular-nums">{idx + 1}</div>
                          <div className="min-w-0">
                            <div className="text-sm text-text-primary truncate">
                              {user.name}
                            </div>
                            <div className="text-xs text-text-tertiary truncate tabular-nums">
                              {user.work_id}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                          <div className="text-sm text-text-secondary tabular-nums">
                            {user.total} 次
                            <span className="text-text-tertiary"> · 失败 {user.failed}</span>
                          </div>
                          <div className="text-xs text-text-tertiary tabular-nums">
                            生成 {user.generate} · 编辑 {user.edit}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-text-tertiary">本月还没有任务记录。</div>
                )}
              </section>

              <section className="rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-4">
                <div>
                  <div className="text-sm font-medium text-text-primary">最近失败任务</div>
                  <div className="text-xs text-text-tertiary">最多显示 50 条</div>
                </div>

                {stats.data?.recent_failures.length ? (
                  <div className="flex flex-col gap-3">
                    {stats.data.recent_failures.map((failure) => (
                      <button
                        key={failure.generation_id}
                        type="button"
                        onClick={() => setActiveId(failure.generation_id)}
                        className="text-left rounded-md bg-bg-secondary hover:bg-bg-tertiary px-4 py-3 flex flex-col gap-2 transition-colors duration-150"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-sm text-text-primary">
                            {failure.name} <span className="text-text-tertiary">· {failure.work_id}</span>
                          </div>
                          <div className="text-xs text-text-tertiary tabular-nums">
                            {formatTimestamp(failure.completed_at ?? failure.created_at)}
                          </div>
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {failure.action === "edit" ? "编辑" : "生成"}
                          {" · "}
                          {failure.error_code ?? "unknown"}
                        </div>
                        <div className="text-sm text-text-secondary break-words line-clamp-2">
                          {failure.error_message ?? "无错误详情"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-text-tertiary">最近没有失败任务。</div>
                )}
              </section>
            </div>
          )}

          <StorageCard enabled={isUnlocked && tab === "overview"} />
            </>
          )}
        </>
      )}

      <AdminGenerationDrawer
        key={activeId ?? "closed"}
        generationId={activeId}
        onClose={() => setActiveId(null)}
      />
    </div>
  );
};

const TabBar = ({ tab, onChange }: { tab: TabKey; onChange: (k: TabKey) => void }) => {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "概览" },
    { key: "gallery", label: "画廊" },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-border-default -mb-2">
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              active
                ? "relative px-3 py-2 text-sm font-medium text-text-primary after:content-[''] after:absolute after:bottom-[-1px] after:left-2 after:right-2 after:h-[2px] after:bg-[#37352F] after:rounded-full"
                : "px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors duration-150"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

const MetricCard = ({
  label,
  period,
}: {
  label: string;
  period: AdminPeriod | null;
}) => {
  const total = period?.total.total ?? 0;
  const failed = period?.total.failed ?? 0;
  const failureRate = period?.total.failure_rate ?? 0;
  const gen = period?.generate ?? { total: 0, failed: 0, failure_rate: 0 };
  const edit = period?.edit ?? { total: 0, failed: 0, failure_rate: 0 };

  return (
    <section className="rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-3">
      <div className="text-sm font-medium text-text-primary">{label}</div>
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-semibold text-text-primary tabular-nums">{total}</div>
        <div className="text-xs text-text-tertiary tabular-nums">
          失败 {failed} · {failureRate.toFixed(1)}%
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-default">
        <SplitCell label="生成" total={gen.total} failed={gen.failed} />
        <SplitCell label="编辑" total={edit.total} failed={edit.failed} />
      </div>
    </section>
  );
};

const SplitCell = ({
  label,
  total,
  failed,
}: {
  label: string;
  total: number;
  failed: number;
}) => (
  <div className="flex flex-col gap-0.5">
    <div className="text-xs text-text-tertiary">{label}</div>
    <div className="flex items-baseline gap-2">
      <span className="text-base font-medium text-text-primary tabular-nums">{total}</span>
      {failed > 0 && (
        <span className="text-xs text-text-tertiary tabular-nums">失败 {failed}</span>
      )}
    </div>
  </div>
);

export default AdminPage;
