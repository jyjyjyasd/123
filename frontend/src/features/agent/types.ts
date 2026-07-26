// features/agent/types.ts
// 移植自 prd src/models/session.ts，适配 PosterForge 前端 TypeScript 类型体系

export type SessionStatus =
  | "init"
  | "clarifying_strategy"
  | "clarifying"
  | "prompting"
  | "generating"
  | "review"
  | "done"
  | "failed";

export interface ClarifyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface StreamA {
  copy: string;
  layout_notes: string;
  layout_prompt: string;
  layout_recommendations?: StyleRecommendation[] | null;
  pdf_document_url?: string | null;
  pdf_document_text?: string | null;
  pdf_document_name?: string | null;
  pdf_document_size?: number | null;
  density?: string;
  poster_strategy?: Record<string, any> | null;
  quick_replies?: string[] | null;
}

export interface StreamB {
  visual_description: string;
  denoising_strength: number;
  reference_image?: string | null;
  style_reference_image?: string | null;
  layout_reference_image?: string | null;
  subject_reference_image?: string | null;
  subject_reference_image_type?: "subject" | "logo" | "other" | null;
  subject_materials?: Array<{ id: string; url: string; type: string }> | null;
  style_recommendations?: StyleRecommendation[] | null;
}

export interface StyleRecommendation {
  index: number;
  name: string;
  name_en: string;
  visual_description: string;
}

export interface LayoutRecommendation {
  index: number;
  name: string;
  description: string;
}

export interface ExtendedImage {
  id?: string;
  ratio: string;
  generation_id?: string | null;
  url?: string | null;
  resolution?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  source?: string | null;
  archived_at?: string | null;
  status?: "pending" | "running" | "completed" | "failed" | null;
  progress?: number | null;
  error_message?: string | null;
}

export interface VersionGroup {
  batch_id: string;
  created_at: string;
  core_strategy?: string | null;
  text_outline?: string | null;
  primary_image?: ExtendedImage | null;
  extended_images: ExtendedImage[];
}

export interface AgentSession {
  id: string;
  user_id: string;
  status: SessionStatus;
  aspect_ratio: string;
  resolution: string;
  clarify_messages: ClarifyMessage[];
  stream_a?: StreamA | null;
  stream_b?: StreamB | null;
  final_prompt?: string | null;
  generation_id?: string | null;
  primary_ratio?: string | null;
  primary_resolution?: string | null;
  extended_images: ExtendedImage[];
  archived_images?: VersionGroup[];
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

// SSE 帧格式（来自 /clarify 端点）
export interface SseChunkFrame {
  chunk: string;
  session: AgentSession;
}

export interface SseDoneFrame {
  done: true;
  session: AgentSession;
}

export type SseFrame = SseChunkFrame | SseDoneFrame;
