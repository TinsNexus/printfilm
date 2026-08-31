import { clearAuth, getToken, setCachedUser, setToken, type AdminUser } from "@/lib/auth";

export type PageMeta = {
  page: number;
  page_size: number;
  total: number;
};

type ApiError = {
  detail?: string | { msg?: string }[];
};

// Parse FastAPI error detail into a string
function errorMessage(data: ApiError, status: number): string {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return `请求失败 (${status})`;
}

// Authenticated JSON fetch against /api
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearAuth();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("未登录或登录已失效");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as ApiError & T) : ({} as T);
  if (!res.ok) {
    throw new Error(errorMessage(data as ApiError, res.status));
  }
  return data as T;
}

// Login then verify admin role via /auth/me
export async function loginAsAdmin(email: string, password: string): Promise<AdminUser> {
  const tokenRes = await api<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(tokenRes.access_token);
  const me = await api<AdminUser>("/api/auth/me");
  if (me.role !== "admin") {
    clearAuth();
    throw new Error("该账号没有管理员权限");
  }
  setCachedUser(me);
  return me;
}

export type AdminStats = {
  user_count: number;
  order_paid_total_fen: number;
  order_paid_today_fen: number;
  project_status_counts: Record<string, number>;
};

export type AdminUserRow = {
  id: number;
  email: string;
  nickname: string;
  quota_left: number;
  balance_fen: number;
  frozen_fen: number;
  plan: string;
  billing_unlimited: boolean;
  role: string;
  created_at?: string | null;
};

export type AdminOrder = {
  id: number;
  out_trade_no: string;
  user_id: number;
  user_email?: string | null;
  sku_id: string;
  amount_fen: number;
  credit_fen: number;
  pay_type: string;
  status: string;
  trade_no?: string | null;
  paid_at?: string | null;
  created_at: string;
};

export type AdminLedger = {
  id: number;
  user_id: number;
  user_email?: string | null;
  delta_fen: number;
  balance_after: number;
  kind: string;
  ref_type: string;
  ref_id: string;
  note: string;
  created_at: string;
};

export type AdminProject = {
  id: number;
  user_id: number;
  user_email?: string | null;
  template_id: string;
  title: string;
  status: string;
  progress: number;
  error_msg?: string | null;
  cover_url?: string | null;
  final_video_url?: string | null;
  pipeline_mode: string;
  created_at: string;
  updated_at: string;
  shot_count: number;
  source_type?: string;
  source_text?: string;
  resolution_mode?: string;
  output_ratio?: string;
  voice_id?: string;
};

export type AdminWork = {
  id: number;
  project_id: number;
  user_id: number;
  user_email?: string | null;
  title: string;
  cover_url?: string | null;
  video_url: string;
  visibility: string;
  audit_status: string;
  published_at: string;
};

export type AdminQueueTask = {
  task_id: string;
  task_name: string;
  label: string;
  args_repr: string;
  queue: string;
  state: string;
  started_at?: number | null;
  ref_id?: number | null;
  position?: number | null;
};

export type AdminQueueSummary = {
  name: string;
  label: string;
  pending: number;
  sample: AdminQueueTask[];
};

export type AdminQueuesSnapshot = {
  ok: boolean;
  redis_ok: boolean;
  unacked: number;
  total_pending: number;
  active_count: number;
  reserved_count: number;
  queues: AdminQueueSummary[];
  pending_tasks: AdminQueueTask[];
  active_tasks: AdminQueueTask[];
  reserved_tasks: AdminQueueTask[];
  runtime: Record<string, number | string>;
  fetched_at: string;
};

export type AdminTaskRow = {
  id: number;
  domain: string;
  task_type: string;
  status: string;
  priority: number;
  requested_by: number;
  user_email?: string | null;
  progress_percent: number;
  cancel_requested: boolean;
  cancelable: boolean;
  current_step_key?: string | null;
  current_step_status?: string | null;
  error_message?: string | null;
  project_id?: number | null;
  drama_project_id?: number | null;
  episode_id?: number | null;
  fragment_id?: number | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  billing_estimate_fen?: number;
  billing_charged_fen?: number;
  billing_refunded_fen?: number;
  billing_status?: string;
};

export type AdminUsageEventBrief = {
  id: number;
  billing_key: string;
  capability?: string | null;
  model?: string;
  total_tokens?: number;
  charge_fen?: number;
  estimated?: boolean;
  created_at?: string | null;
};

export type AdminUsageEvent = {
  id: number;
  user_id: number;
  user_email?: string | null;
  task_run_id?: number | null;
  domain?: string | null;
  capability?: string | null;
  billing_key: string;
  model?: string;
  total_tokens?: number;
  charge_fen?: number;
  cost_fen?: number;
  estimated?: boolean;
  created_at?: string | null;
  task_domain?: string | null;
  task_type?: string | null;
  task_status?: string | null;
};

export type AdminUsageEventListRes = {
  items: AdminUsageEvent[];
  meta: PageMeta;
};

export type AdminTaskStep = {
  id: number;
  step_key: string;
  step_type: string;
  status: string;
  attempt_count: number;
  provider_name?: string | null;
  provider_task_id?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type AdminTaskEvent = {
  id: number;
  event_type: string;
  status?: string | null;
  phase?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type AdminTaskDetail = AdminTaskRow & {
  client_request_id?: string | null;
  dedupe_key?: string | null;
  batch_key?: string | null;
  provider_task_id?: string | null;
  scheduled_at?: string | null;
  next_action_at?: string | null;
  lease_until?: string | null;
  error_code?: string | null;
  payload?: Record<string, unknown> | null;
  result_payload?: Record<string, unknown> | null;
  script_id?: number | null;
  asset_id?: number | null;
  shot_id?: number | null;
  updated_at?: string | null;
  steps: AdminTaskStep[];
  events: AdminTaskEvent[];
  targets: Array<{ id: number; target_type: string; target_id: number }>;
  usage_lines?: AdminUsageEventBrief[];
  billing_estimate_fen?: number;
  billing_charged_fen?: number;
  billing_refunded_fen?: number;
  billing_status?: string;
};

export type AdminTaskStats = {
  pending_count: number;
  active_count: number;
  leased_count: number;
  running_count: number;
  awaiting_poll_count: number;
  cancel_requested_count: number;
  succeeded_count: number;
  failed_count: number;
  cancelled_count: number;
  scheduler_running_jobs: number;
  max_concurrency: number;
  domains: Array<{
    domain: string;
    pending: number;
    active: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  }>;
  fetched_at?: string | null;
};

export type AdminTaskListRes = {
  items: AdminTaskRow[];
  meta: PageMeta;
};

export type ModelCapabilityReadiness = {
  capability: string;
  label: string;
  model: string;
  ready: boolean;
  message: string;
};

export type AdminModelSettings = {
  openai_api_key: string;
  openai_base_url: string;
  model_llm: string;
  has_openai_api_key: boolean;
  ark_api_key: string;
  ark_base_url: string;
  model_image: string;
  model_image_45: string;
  model_video: string;
  model_audio: string;
  has_ark_api_key: boolean;
  volc_tts_app_id: string;
  volc_tts_access_key: string;
  volc_tts_api_key: string;
  volc_tts_resource_id: string;
  volc_tts_speaker: string;
  volc_tts_url: string;
  volc_tts_voice_design_url: string;
  volc_tts_voice_design_speaker_ids: string;
  has_volc_tts_access_key: boolean;
  has_volc_tts_api_key: boolean;
  ark_image_size: string;
  ark_video_resolution: string;
  ark_video_ratio: string;
  seedance_duration_min: number;
  seedance_duration_max: number;
  ark_video_poll_interval: number;
  ark_video_poll_timeout: number;
  pipeline_image_concurrency: number;
  pipeline_video_concurrency: number;
  pipeline_audio_concurrency: number;
  task_runtime_max_concurrency: number;
  task_user_max_concurrency: number;
  task_poll_max_concurrency: number;
  drama_user_video_job_limit: number;
  drama_fragment_max_attempts: number;
  ark_mock: boolean;
  oss_enabled: boolean;
  oss_endpoint: string;
  oss_region: string;
  oss_bucket: string;
  oss_folder: string;
  oss_access_key_id: string;
  oss_access_key_secret: string;
  oss_public_base: string;
  oss_upload_async: boolean;
  oss_upload_queue: string;
  has_oss_access_key_id: boolean;
  has_oss_access_key_secret: boolean;
  tos_endpoint: string;
  tos_bucket: string;
  tos_access_key: string;
  tos_secret_key: string;
  has_tos_access_key: boolean;
  has_tos_secret_key: boolean;
  cdn_base: string;
  epay_api_url: string;
  epay_pid: string;
  epay_key: string;
  epay_notify_url: string;
  epay_return_url: string;
  has_epay_key: boolean;
  billing_enabled: boolean;
  billing_markup: number;
  billing_estimate_buffer: number;
  billing_seedance_video0: number;
  billing_seedance_video1: number;
  billing_llm_per_m: number;
  billing_seedream_per_m: number;
  billing_tts_per_m: number;
  billing_est_llm_tokens: number;
  billing_est_seedream_tokens: number;
  billing_est_tts_tokens: number;
  billing_est_seedance_tokens_per_sec: number;
  billing_signup_grant_fen: number;
  quota_enabled: boolean;
  new_user_quota: number;
  public_base_url: string;
  ffmpeg_path: string;
  ffprobe_path: string;
  source: string;
  updated_at?: string | null;
  readiness: ModelCapabilityReadiness[];
};

export type AdminRoutingChannel = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  has_api_key: boolean;
  api_format: "openai" | "ark";
  protocol: "auto" | "openai" | "ark" | "volc_tts";
  models: string[];
  enabled: boolean;
  sort_order: number;
};

export type AdminLogicalModelBinding = {
  id: string;
  channel_id: string;
  upstream_model: string;
  enabled: boolean;
  priority: number;
  weight?: number | null;
};

export type AdminLogicalModel = {
  id: string;
  name: string;
  capability: "text" | "image" | "video" | "audio";
  enabled: boolean;
  bindings: AdminLogicalModelBinding[];
};

export type AdminDefaultModels = {
  text_model: string;
  image_model: string;
  video_model: string;
  audio_model: string;
};

export type AdminRoutingSettings = {
  system_channels: AdminRoutingChannel[];
  logical_models: AdminLogicalModel[];
  default_models: AdminDefaultModels;
  validation_errors: string[];
  updated_at?: string | null;
};

export type AdminTemplate = {
  id: string;
  name: string;
  description: string;
  category: string[];
  preview_cover: string;
  style_prefix: string;
  negative_prompt: string;
  default_ratio: string;
  shot_duration_min: number;
  shot_duration_max: number;
  llm_system_addon: string;
  seedream_config: Record<string, unknown>;
  seedance_config: Record<string, unknown>;
  audio_config: Record<string, unknown>;
  subtitle_config: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  is_premium: boolean;
};
