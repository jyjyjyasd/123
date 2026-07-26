import { AlertTriangle, HardDrive } from "lucide-react";

import type { AdminStorageBucket } from "../api";
import { useAdminStorage } from "../hooks";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

const formatBytes = (n: number): string => {
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  if (n < GB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
};

const formatRelativeAge = (iso: string | null): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days < 1) return "今天";
  return `${days} 天前`;
};

const Bucket = ({
  label,
  bucket,
  hint,
}: {
  label: string;
  bucket: AdminStorageBucket;
  hint: string;
}) => {
  const expired = bucket.expired_count;
  return (
    <div className="rounded-md border border-border-default bg-bg-primary p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="text-xs text-text-tertiary">{hint}</div>
      </div>

      <div className="flex items-baseline gap-3">
        <div className="text-xl font-semibold text-text-primary tabular-nums">
          {formatBytes(bucket.bytes)}
        </div>
        <div className="text-xs text-text-tertiary tabular-nums">
          {bucket.file_count} 个文件
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-default">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs text-text-tertiary">最早</div>
          <div className="text-sm text-text-secondary tabular-nums">
            {formatRelativeAge(bucket.oldest_at)}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xs text-text-tertiary">逾期</div>
          <div
            className={
              "text-sm tabular-nums " +
              (expired > 0 ? "text-warning" : "text-text-secondary")
            }
          >
            {expired} 个
          </div>
        </div>
      </div>
    </div>
  );
};

export const StorageCard = ({ enabled }: { enabled: boolean }) => {
  const q = useAdminStorage(enabled);

  return (
    <section className="rounded-md border border-border-default bg-bg-primary p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive size={14} strokeWidth={1.75} className="text-text-secondary" />
          <div className="text-sm font-medium text-text-primary">存储水位</div>
        </div>
        {q.data && !q.data.cleanup_implemented && (
          <div className="inline-flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle size={12} strokeWidth={1.75} />
            自动清理未启用
          </div>
        )}
      </div>

      {q.isPending && (
        <div className="text-sm text-text-tertiary">加载中…</div>
      )}
      {q.error && (
        <div className="text-sm text-error">加载失败：{q.error.message}</div>
      )}

      {q.data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Bucket
              label="参考图（uploads）"
              bucket={q.data.uploads}
              hint={`保留 ${q.data.uploads.retention_days} 天`}
            />
            <Bucket
              label="生成结果（outputs）"
              bucket={q.data.outputs}
              hint={`保留 ${q.data.outputs.retention_days} 天`}
            />
          </div>
          <div className="text-xs text-text-tertiary leading-relaxed">
            「逾期」按 PRD §4.6 保留期判定，但 Phase 1 暂未实现自动清理任务，逾期文件仍占用磁盘。
          </div>
        </>
      )}
    </section>
  );
};
