// features/agent/api.ts
// API 调用层：封装所有 /api/agent/sessions/* 端点

import type { AgentSession, StreamA, StreamB } from "./types";

const BASE = "/api/agent/sessions";

// ─── 类型 ───────────────────────────────────────────────────────────────────

export interface CreateSessionResult {
  session_id: string;
  status: string;
}

export interface ChatRequest {
  message: string;
  style_file_id?: string;
  layout_file_id?: string;
  subject_file_id?: string;
}

export interface UpdateRequest {
  status?: string;
  aspect_ratio?: string;
  resolution?: string;
  stream_a?: Partial<StreamA>;
  stream_b?: Partial<StreamB>;
  extended_images?: any[];
}

export interface ExtendRequest {
  ratios: string[];
  resolution?: string;
  base_image_url?: string;
}

// ─── API 函数 ───────────────────────────────────────────────────────────────

/** 创建新 Agent 会话 */
export async function createSession(): Promise<CreateSessionResult> {
  const res = await fetch(BASE, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(`创建会话失败: ${res.status}`);
  return res.json();
}

/** 获取会话 */
export async function getSession(sessionId: string): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`获取会话失败: ${res.status}`);
  return res.json();
}

/** 更新会话参数（内联编辑） */
export async function updateSession(
  sessionId: string,
  body: UpdateRequest
): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新会话失败: ${res.status}`);
  return res.json();
}

/** 删除会话 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}`, { method: "DELETE", credentials: "include" });
}

/** 批量删除会话 */
export async function batchDeleteSessions(sessionIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/batch-delete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds }),
  });
  if (!res.ok) throw new Error(`批量删除会话失败: ${res.status}`);
}

/**
 * 对话 SSE 流式请求。
 * 返回 ReadableStreamDefaultReader，调用方负责消费。
 */
export function startClarifyStream(
  sessionId: string,
  body: ChatRequest
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  return fetch(`${BASE}/${sessionId}/clarify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error(`对话请求失败: ${res.status}`);
    if (!res.body) throw new Error("响应无 body");
    return res.body.getReader();
  });
}

/** 编译最终 prompt */
export async function compilePrompt(sessionId: string): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/compile`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`编译提示词失败: ${res.status}`);
  return res.json();
}

/** 触发最终海报生成 */
export async function generatePoster(sessionId: string): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/generate`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`触发生成失败: ${res.status}`);
  return res.json();
}

/** 多尺寸延伸 */
export async function extendPoster(
  sessionId: string,
  body: ExtendRequest
): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/extend`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`多尺寸延伸失败: ${res.status}`);
  return res.json();
}

/** 刷新风格推荐 */
export async function refreshStyles(sessionId: string): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/refresh-styles`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`刷新风格推荐失败: ${res.status}`);
  return res.json();
}

/** 刷新排版推荐 */
export async function refreshLayouts(sessionId: string): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/refresh-layouts`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`刷新排版推荐失败: ${res.status}`);
  return res.json();
}

/** 上传参考图或PDF文档 */
export async function uploadReferenceImage(
  sessionId: string,
  file: File,
  type: "style" | "layout" | "subject" | "pdf_document" | "other",
  subjectType?: "subject" | "logo" | "other"
): Promise<AgentSession> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", type);
  if (type === "subject" && subjectType) {
    fd.append("subjectType", subjectType);
  }

  const res = await fetch(`${BASE}/${sessionId}/upload`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) throw new Error(`上传图片失败: ${res.status}`);
  return res.json();
}

/** 获取所有 Agent 会话 */
export async function listSessions(): Promise<AgentSession[]> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok) throw new Error(`获取会话列表失败: ${res.status}`);
  return res.json();
}





export interface RefreshCopyRequest {
  density: string;
  current_copy: string;
  selected_style_name?: string;
  selected_style_desc?: string;
}

export interface RefreshCopyResult {
  refreshed_copy: string;
}

/** 根据指定密度刷新并重写海报文案 */
export async function refreshCopy(
  sessionId: string,
  body: RefreshCopyRequest
): Promise<RefreshCopyResult> {
  const res = await fetch(`${BASE}/${sessionId}/refresh-copy`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.error?.message || `文案刷新失败: ${res.status}`);
  }
  return res.json();
}


/** 直接海报圈画修改（局部图生图编辑） */
export async function editPoster(
  sessionId: string,
  body: { edit_description: string; subject_file_id: string; size: string; resolution: string }
): Promise<AgentSession> {
  const res = await fetch(`${BASE}/${sessionId}/edit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.error?.message || `提交修改失败: ${res.status}`);
  }
  return res.json();
}


