import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import type { AdminUser } from "../api";
import { useAdminUsers } from "../hooks";

export const UserPicker = ({
  value,
  onChange,
}: {
  value: AdminUser | null;
  onChange: (u: AdminUser | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const users = useAdminUsers(debounced, open && value === null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebounced(val), 220);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Cleanup the debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  if (value) {
    return (
      <button
        type="button"
        onClick={() => {
          onChange(null);
          setQuery("");
          setDebounced("");
        }}
        className="inline-flex items-center gap-2 max-w-full px-2.5 py-1 rounded-md bg-bg-tertiary text-xs text-text-primary hover:bg-bg-active transition-colors duration-150"
        title="点击清除筛选"
      >
        <X size={12} strokeWidth={2} className="text-text-secondary shrink-0" />
        <span className="truncate">{value.name}</span>
        <span className="text-text-tertiary tabular-nums shrink-0">· {value.work_id}</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-[260px]">
      <div className="relative">
        <Search
          size={12}
          strokeWidth={1.75}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="输入工号 / 姓名"
          className="w-full h-7 pl-7 pr-2.5 text-xs bg-bg-primary text-text-primary border border-border-default rounded-md placeholder:text-text-tertiary focus:outline-none focus:border-border-strong transition-colors"
        />
      </div>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border border-border-default bg-bg-primary shadow-popover overflow-hidden max-h-[280px] overflow-y-auto animate-[slideUp_120ms_ease-out]">
          {users.isPending && (
            <div className="px-3 py-2 text-xs text-text-tertiary">加载中…</div>
          )}
          {users.error && (
            <div className="px-3 py-2 text-xs text-error">{users.error.message}</div>
          )}
          {users.data && users.data.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">无匹配用户</div>
          )}
          {users.data?.map((u) => (
            <button
              key={u.id}
              type="button"
              // preventDefault on mousedown so the input doesn't blur
              // before our onClick fires.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(u);
                setOpen(false);
                setQuery("");
                setDebounced("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-bg-hover flex items-center justify-between gap-3"
            >
              <span className="text-sm text-text-primary truncate">{u.name}</span>
              <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                {u.work_id}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
