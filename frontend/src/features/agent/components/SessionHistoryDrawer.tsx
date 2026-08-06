import { useState, useEffect } from "react";
import type { AgentSession } from "../types";

interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSession: AgentSession | null;
  onLoadSession: (id: string) => Promise<void>;
  listSessions: () => Promise<AgentSession[]>;
  deleteSession: (id: string) => Promise<void>;
  deleteSessions: (ids: string[]) => Promise<void>;
}

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  currentSession,
  onLoadSession,
  listSessions,
  deleteSession,
  deleteSessions,
}: SessionHistoryDrawerProps) {
  const [sessionsList, setSessionsList] = useState<AgentSession[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchSessions = async () => {
    try {
      const list = await listSessions();
      setSessionsList(list);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    } else {
      setIsEditMode(false);
      setSelectedIds([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} 
      onClick={() => {
        onClose();
        setIsEditMode(false);
        setSelectedIds([]);
      }}
    >
      <div 
        style={{ width: 320, height: "100%", background: "#fff", display: "flex", flexDirection: "column", position: "relative" }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ borderBottom: "1px solid rgba(55,53,47,0.09)", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>AI 设计助理会话记录</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sessionsList.length > 0 && (
              <button 
                onClick={() => {
                  if (isEditMode) {
                    setIsEditMode(false);
                    setSelectedIds([]);
                  } else {
                    setIsEditMode(true);
                    setSelectedIds([]);
                  }
                }} 
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#787774", fontWeight: 600, padding: "4px 8px", borderRadius: 4 }}
                className="hover:bg-black/5"
              >
                {isEditMode ? "取消" : "管理"}
              </button>
            )}
            <button 
              onClick={() => {
                onClose();
                setIsEditMode(false);
                setSelectedIds([]);
              }} 
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4 }}
              className="hover:bg-black/5"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Batch Select Header (Edit Mode only) */}
        {isEditMode && sessionsList.length > 0 && (
          <div style={{ padding: "8px 16px", background: "#F7F6F3", borderBottom: "1px solid rgba(55,53,47,0.09)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#787774" }}>
            <label 
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
              onClick={(e) => {
                e.preventDefault();
                const allSelected = selectedIds.length === sessionsList.length;
                if (allSelected) {
                  setSelectedIds([]);
                } else {
                  setSelectedIds(sessionsList.map(s => s.id));
                }
              }}
            >
              <div 
                style={{ 
                  width: 14, 
                  height: 14, 
                  border: "1.5px solid rgba(55, 53, 47, 0.16)", 
                  borderRadius: 3, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  background: selectedIds.length === sessionsList.length ? "#37352F" : "#fff",
                  borderColor: selectedIds.length === sessionsList.length ? "#37352F" : "rgba(55, 53, 47, 0.16)"
                }}
              >
                {selectedIds.length === sessionsList.length && (
                  <div style={{ width: 6, height: 6, background: "#fff", borderRadius: 1 }} />
                )}
              </div>
              <span style={{ fontWeight: 500 }}>全选</span>
            </label>
            <span>{selectedIds.length > 0 ? `已选择 ${selectedIds.length} 项` : "未选择项目"}</span>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {sessionsList.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9B9A97", fontSize: 12, padding: "40px 0" }}>
              暂无历史会话记录
            </div>
          ) : (
            sessionsList.map((item) => {
              const isActive = currentSession?.id === item.id;
              const isChecked = selectedIds.includes(item.id);

              return (
                <div 
                  key={item.id} 
                  onClick={async () => {
                    if (isEditMode) {
                      if (isChecked) {
                        setSelectedIds(prev => prev.filter(id => id !== item.id));
                      } else {
                        setSelectedIds(prev => [...prev, item.id]);
                      }
                    } else {
                      await onLoadSession(item.id);
                      onClose();
                    }
                  }} 
                  style={{ 
                    padding: "10px", 
                    borderRadius: 8, 
                    border: isChecked || (isActive && !isEditMode) ? "1px solid #37352F" : "1px solid rgba(55,53,47,0.08)", 
                    marginBottom: 8, 
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    background: isChecked ? "rgba(55, 53, 47, 0.02)" : "#fff",
                    transition: "all 0.2s ease"
                  }}
                  className="group"
                >
                  {/* Left Checkbox (Edit Mode only) */}
                  {isEditMode && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginRight: 8, width: 20 }}>
                      <div 
                        style={{ 
                          width: 14, 
                          height: 14, 
                          border: "1.5px solid rgba(55, 53, 47, 0.16)", 
                          borderRadius: 3, 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "center",
                          background: isChecked ? "#37352F" : "#fff",
                          borderColor: isChecked ? "#37352F" : "rgba(55, 53, 47, 0.16)"
                        }}
                      >
                        {isChecked && (
                          <div style={{ width: 6, height: 6, background: "#fff", borderRadius: 1 }} />
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.subject_description || "新会话"}
                    </div>
                    <div style={{ fontSize: 11, color: "#9b9a97", marginTop: 4 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Right Single Delete Button (Standard Mode only, Hover to show) */}
                  {!isEditMode && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm("确定要删除此会话记录吗？")) {
                          await deleteSession(item.id);
                          await fetchSessions();
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "#9b9a97",
                        padding: 4,
                        marginLeft: 8,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#eb5757";
                        e.currentTarget.style.backgroundColor = "rgba(235, 87, 87, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#9b9a97";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                      title="删除会话"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Action Bar (Edit Mode only) */}
        {isEditMode && sessionsList.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(55,53,47,0.09)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#787774" }}>
              <span>已选择 <strong style={{ color: "#37352F" }}>{selectedIds.length}</strong> 项</span>
              <span style={{ fontSize: 11, color: "#9B9A97" }}>删除后不可恢复</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={() => {
                  setIsEditMode(false);
                  setSelectedIds([]);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(55,53,47,0.09)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "center"
                }}
                className="hover:bg-black/5"
              >
                取消
              </button>
              <button 
                onClick={async () => {
                  if (selectedIds.length === 0) return;
                  if (window.confirm(`确定要批量删除选中的 ${selectedIds.length} 个会话记录吗？`)) {
                    await deleteSessions(selectedIds);
                    await fetchSessions();
                    setIsEditMode(false);
                    setSelectedIds([]);
                  }
                }}
                disabled={selectedIds.length === 0}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #eb5757",
                  background: selectedIds.length === 0 ? "#F4C7C7" : "#eb5757",
                  borderColor: selectedIds.length === 0 ? "#F4C7C7" : "#eb5757",
                  color: "#fff",
                  cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "center"
                }}
                onMouseEnter={(e) => {
                  if (selectedIds.length > 0) {
                    e.currentTarget.style.backgroundColor = "#D13F3F";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedIds.length > 0) {
                    e.currentTarget.style.backgroundColor = "#eb5757";
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
