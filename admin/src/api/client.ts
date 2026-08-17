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
  worker?: string | null;
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

export type AdminWorkerRow = {
  name: string;
  status: string;
  active_count: number;
  processed?: number | null;
  pool?: string | null;
};

export type AdminWorkerControl = {
  mode: string;
  systemd_unit?: string | null;
  systemd_active?: boolean | null;
  pools: Array<{
    name: string;
    pool_implementation?: string;
    max_concurrency?: number | null;
    process_count?: number | null;
  }>;
  total_processes: number;
  max_concurrency?: number | null;
  pool_max_limit: number;
  can_pool_grow: boolean;
  can_pool_shrink: boolean;
  can_restart: boolean;
  autoscale_running: boolean;
  autoscale_enabled: boolean;
  autoscale_pid?: number | null;
  autoscale_workers: number;
  bounds_min: number;
  bounds_max: number;
  bounds_source: string;
};

export type AdminQueuesSnapshot = {
  ok: boolean;
  redis_ok: boolean;
  use_celery: boolean;
  worker_queues: string;
  unacked: number;
  total_pending: number;
  active_count: number;
  reserved_count: number;
  workers_online: number;
  queues: AdminQueueSummary[];
  pending_tasks: AdminQueueTask[];
  active_tasks: AdminQueueTask[];
  reserved_tasks: AdminQueueTask[];
  workers: AdminWorkerRow[];
  worker_control?: AdminWorkerControl | null;
  autoscale: Record<string, number>;
  fetched_at: string;
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
