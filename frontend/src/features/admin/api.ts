import { api } from "@/lib/api";

export type AdminSession = {
  is_admin: boolean;
  is_admin_elevated: boolean;
};

export type AdminCount = {
  total: number;
  failed: number;
  failure_rate: number;
};

export type AdminPeriod = {
  total: AdminCount;
  generate: AdminCount;
  edit: AdminCount;
};

export type AdminTopUser = {
  user_id: string;
  work_id: string;
  name: string;
  total: number;
  failed: number;
  generate: number;
  edit: number;
};

export type AdminTrendDay = {
  date: string;
  total: number;
  failed: number;
};

export type AdminFailure = {
  generation_id: string;
  user_id: string;
  work_id: string;
  name: string;
  action: "generate" | "edit";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AdminStats = {
  today: AdminPeriod;
  month: AdminPeriod;
  last_7_days: AdminTrendDay[];
  top_users: AdminTopUser[];
  recent_failures: AdminFailure[];
};

export const elevateAdmin = (secret: string): Promise<AdminSession> =>
  api<AdminSession>("/api/admin/elevate", {
    method: "POST",
    json: { secret },
  });

export const lockAdmin = (): Promise<null> =>
  api<null>("/api/admin/lock", { method: "POST" });

export const fetchAdminStats = (): Promise<AdminStats> =>
  api<AdminStats>("/api/admin/stats");

export type AdminGalleryItem = {
  id: string;
  user_id: string;
  work_id: string;
  name: string;
  action: "generate" | "edit";
  status: "pending" | "running" | "completed" | "failed";
  prompt: string;
  // v0.8 起 params = { size, resolution }；老历史可能含 quality / n（v0.7 之前）
  // 或缺 resolution（v0.8 早期），全部宽松 optional
  params: {
    size: string;
    resolution?: string | null;
    quality?: string | null;
    n?: number | null;
  };
  thumbnail_url: string | null;
  output_count: number;
  error_code: string | null;
  created_at: string;
};

export type AdminGalleryPage = {
  items: AdminGalleryItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export type AdminGalleryFilter = {
  user_id?: string;
  action?: "generate" | "edit";
  status?: "pending" | "running" | "completed" | "failed";
};

export const fetchAdminGallery = (
  cursor: string | null,
  filter: AdminGalleryFilter = {},
): Promise<AdminGalleryPage> => {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  if (filter.user_id) qs.set("user_id", filter.user_id);
  if (filter.action) qs.set("action", filter.action);
  if (filter.status) qs.set("status", filter.status);
  const tail = qs.toString();
  return api<AdminGalleryPage>(`/api/admin/gallery${tail ? `?${tail}` : ""}`);
};

export type AdminFileRef = {
  file_id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type AdminGenerationDetail = {
  id: string;
  user_id: string;
  work_id: string;
  name: string;
  action: "generate" | "edit";
  status: "pending" | "running" | "completed" | "failed";
  prompt: string;
  // v0.8 起 params = { size, resolution }；老历史可能含 quality / n（v0.7 之前）
  // 或缺 resolution（v0.8 早期），全部宽松 optional
  params: {
    size: string;
    resolution?: string | null;
    quality?: string | null;
    n?: number | null;
  };
  revised_prompt: string | null;
  reference_files: AdminFileRef[];
  output_files: AdminFileRef[];
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export const fetchAdminGenerationDetail = (
  id: string,
): Promise<AdminGenerationDetail> =>
  api<AdminGenerationDetail>(`/api/admin/generations/${id}`);

export type AdminStorageBucket = {
  file_count: number;
  bytes: number;
  oldest_at: string | null;
  expired_count: number;
  retention_days: number;
};

export type AdminStorage = {
  uploads: AdminStorageBucket;
  outputs: AdminStorageBucket;
  cleanup_implemented: boolean;
};

export const fetchAdminStorage = (): Promise<AdminStorage> =>
  api<AdminStorage>("/api/admin/storage");

export type AdminUser = {
  id: string;
  work_id: string;
  name: string;
  last_login_at: string | null;
};

export const fetchAdminUsers = (q: string): Promise<AdminUser[]> => {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const tail = qs.toString();
  return api<AdminUser[]>(`/api/admin/users${tail ? `?${tail}` : ""}`);
};
