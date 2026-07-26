import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLogout, useMe } from "@/features/auth/hooks";
import { BrandMark } from "./brand-mark";
import { GlobalHistoryDrawer } from "@/features/history/components/GlobalHistoryDrawer";
import { HistoryDrawer } from "@/features/history/components/HistoryDrawer";
import { stashReuse } from "@/features/generation/reuse";

export const TopNav = () => {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [showGlobalHistory, setShowGlobalHistory] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const isWorkspace = location.pathname === "/";
  const activeTab = searchParams.get("tab") === "agent" ? "agent" : "quick";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (profileMenuRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <>
      <div className="relative z-50 h-12 flex items-center justify-between px-6 border-b border-border-default bg-bg-primary">
        <div className="relative z-10 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-base font-semibold text-text-primary hover:text-text-primary"
          >
            <BrandMark size={20} />
            <span>Poster Forge</span>
          </Link>

          {me.data && (
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-sm text-text-primary hover:bg-bg-hover"
              >
                <span className="font-medium">{me.data.name}</span>
                <ChevronDown size={14} className="text-text-tertiary" />
              </button>

              {open && (
                <div className="absolute left-0 top-full mt-1 w-32 bg-bg-primary border border-border-default rounded-md shadow-popover overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout.mutate();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-hover"
                  >
                    退出
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {isWorkspace && me.data && (
          <div className="absolute left-1/2 top-1/2 z-50 grid w-[280px] -translate-x-1/2 -translate-y-1/2 grid-cols-2 gap-0.5 rounded-lg border border-border-default bg-bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: "quick" })}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-xs transition-colors cursor-pointer",
                activeTab === "quick"
                  ? "bg-bg-primary text-text-primary font-semibold shadow-sm"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              )}
            >
              <span className="flex w-4 items-center justify-center text-sm leading-none">✦</span>
              <span className="text-center">快速生成</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: "agent" })}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-xs transition-colors cursor-pointer",
                activeTab === "agent"
                  ? "bg-bg-primary text-text-primary font-semibold shadow-sm"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              )}
            >
              <span className="flex w-4 items-center justify-center text-sm leading-none">✳</span>
              <span className="text-center">AI 设计助理</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {me.data?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  "px-2.5 py-1 rounded-md text-sm transition-colors",
                  "text-text-secondary hover:bg-bg-hover",
                  isActive && "text-text-primary bg-bg-hover",
                )
              }
            >
              管理
            </NavLink>
          )}

          {activeTab === "agent" && me.data && (
            <>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("pf:agent-history"))}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-border-default text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>会话记录</span>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("pf:agent-newchat"))}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-border-default text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>新会话</span>
              </button>
            </>
          )}

          {me.data && (
            <button
              type="button"
              onClick={() => setShowGlobalHistory(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <span>历史记录</span>
            </button>
          )}

          {me.data && (
            <div className="relative hidden">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-sm text-text-primary hover:bg-bg-hover"
              >
                <span className="font-medium">{me.data.name}</span>
                <ChevronDown size={14} className="text-text-tertiary" />
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-bg-primary border border-border-default rounded-md shadow-popover overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout.mutate();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-hover"
                  >
                    退出
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showGlobalHistory && (
        <GlobalHistoryDrawer
          onClose={() => setShowGlobalHistory(false)}
          onSelectJob={(id) => {
            setShowGlobalHistory(false);
            setActiveId(id);
          }}
        />
      )}

      <HistoryDrawer
        key={activeId ?? "closed"}
        jobId={activeId}
        onClose={() => setActiveId(null)}
        onReuse={(payload) => {
          stashReuse({ ...payload, action: "generate" });
          const event = new CustomEvent("pf:reuse-trigger", { detail: payload });
          window.dispatchEvent(event);

          if (window.location.pathname !== "/") {
            navigate("/");
          }
          setActiveId(null);
        }}
      />
    </>
  );
};
