import { api, apiUpload } from "@/lib/api";

// 自 v0.7 起 size 是 'WIDTHxHEIGHT'（小写 x）或 'auto'（仅 edit）。
// 可选预设见 features/generation/size-presets.ts；后端按白名单校验，
// 但类型放宽为 string 是为了让历史卡片能展示老像素值（迁移过来的
// 1792x1024 等不在新预设里，但仍合法）。
export type SizeKey = string;
export type ActionKind = "generate" | "edit";

export type GenerationStatus = "pending" | "running" | "completed" | "failed";

export type FileRef = {
  file_id: string;
  url: string;
  width: number | null;
  height: number | null;
};

// v0.8 起 size 是 apimart 比例字符串（'1:1' 等）或 'auto'；resolution 是
// '1k' / '2k' / '4k' 档位。老历史里可能：(a) size 是像素 'WxH'（v0.7 之
// 前的任务），(b) 无 resolution（v0.8 早期短暂状态），(c) 还带 quality / n
// (v0.7 之前)。所有遗留字段都做 nullable / optional 兼容展示。
export type GenerationParams = {
  size: SizeKey;
  resolution?: "1k" | "2k" | "4k" | null;
  quality?: "low" | "medium" | "high" | "auto" | null;
  n?: number | null;
};

export type Generation = {
  id: string;
  action: ActionKind;
  status: GenerationStatus;
  prompt: string;
  params: GenerationParams;
  revised_prompt: string | null;
  reference_files: FileRef[];
  output_files: FileRef[];
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

// 编辑模式：1–5 张参考图。每张先 POST /api/uploads 拿 file_id，
// 再带 reference_file_ids 提交 /api/generations（自 v0.4 起的解耦上传）。
export const MAX_REFERENCE_IMAGES = 5;

export type UploadResult = {
  file_id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export const uploadReferenceFile = (
  file: File,
  options: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> => {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload<UploadResult>("/api/uploads", fd, options);
};

export type CreateGenerationInput = {
  action: ActionKind;
  prompt: string;
  size: SizeKey;
  resolution: "1k" | "2k" | "4k";
  reference_file_ids?: string[];
};

export const createGeneration = async (
  input: CreateGenerationInput,
): Promise<{ job_id: string; status: "pending" }> => {
  const fd = new FormData();
  fd.append("action", input.action);
  fd.append("prompt", input.prompt);
  fd.append("size", input.size);
  fd.append("resolution", input.resolution);
  for (const id of input.reference_file_ids ?? []) {
    fd.append("reference_file_ids", id);
  }
  return apiUpload("/api/generations", fd);
};

export const fetchGeneration = (jobId: string): Promise<Generation> =>
  api<Generation>(`/api/generations/${jobId}`);

export const deleteGeneration = (jobId: string): Promise<null> =>
  api<null>(`/api/generations/${jobId}`, { method: "DELETE" });

export type HistoryItem = {
  id: string;
  action: ActionKind;
  status: GenerationStatus;
  prompt: string;
  params: GenerationParams;
  thumbnail_url: string | null;
  output_count: number;
  error_code: string | null;
  created_at: string;
};

export type HistoryPage = {
  items: HistoryItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export const fetchHistory = (cursor: string | null, pageSize = 20): Promise<HistoryPage> => {
  const params = new URLSearchParams();
  params.set("page_size", String(pageSize));
  if (cursor) params.set("cursor", cursor);
  return api<HistoryPage>(`/api/history?${params.toString()}`);
};
