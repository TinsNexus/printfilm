/** Project pipeline status → Chinese label */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bản nháp",
  SCRIPTING: "Đang tạo kịch bản",
  SCRIPT_READY: "Kịch bản sẵn sàng",
  IMAGING: "Đang tạo ảnh phân cảnh",
  IMAGE_READY: "Ảnh phân cảnh sẵn sàng",
  VIDEOING: "Đang tạo video",
  VIDEO_READY: "Video sẵn sàng",
  AUDIOING: "Đang lồng tiếng",
  COMPOSING: "Đang ghép phim",
  AUDITING: "Đang duyệt",
  DONE: "Đã hoàn tất",
  REJECTED: "Đã từ chối",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
};

/** Order payment status → Chinese */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  closed: "Đã tắt",
};

/** Work audit / visibility → Chinese */
export const AUDIT_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  passed: "Đã duyệt",
  rejected: "Đã từ chối",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  public: "Công khai",
  private: "Riêng tư",
  unlisted: "Không liệt kê công khai",
};

/** Wallet ledger kind → Chinese */
export const LEDGER_KIND_LABELS: Record<string, string> = {
  topup: "Nạp tiền",
  grant: "Tặng",
  adjust: "Điều chỉnh",
  freeze: "Đóng băng",
  unfreeze: "Mở băng",
  settle: "Quyết toán",
  refund: "Hoàn tiền",
};

/** Payment channel → Chinese */
export const PAY_TYPE_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wxpay: "WeChat",
  stripe: "Thẻ ngân hàng · Stripe",
};

/** Unified task platform status → Chinese */
export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Đang xếp hàng",
  leased: "Đã thuê",
  running: "Đang thực thi",
  awaiting_poll: "Chờ thăm dò",
  awaiting_review: "Chờ duyệt",
  cancel_requested: "Đang hủy",
  succeeded: "Đã thành công",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

/** Task domain → Chinese */
export const TASK_DOMAIN_LABELS: Record<string, string> = {
  drama: "Phim truyện",
  kepu: "Video ngắn AI",
  tools: "Công cụ",
  studio: "Studio",
};

/** Task type → Chinese（轻量同步 + 平台任务） */
export const TASK_TYPE_LABELS: Record<string, string> = {
  agent_chat: "Trò chuyện trợ lý phim truyện",
  skill_optimize: "Prompt tối ưu Skill",
  voice_prompt: "Mô tả giọng nhân vật",
  content_expand: "Mở rộng chủ đề",
  script_summary: "Tóm tắt kịch bản",
  episode_script: "Kịch bản tập",
  fragment_plan: "Phân cảnh AI",
  fragment_video: "Video phân cảnh",
  seed_assets: "Trích xuất tài sản",
  asset_image: "Tạo ảnh tài sản",
  asset_video: "Video tài sản",
  voice_synthesis: "Tổng hợp lồng tiếng",
  project_pipeline: "Pipeline khoa học",
  shot_regen_image: "Vẽ lại một cảnh",
  shot_regen_video: "Video một cảnh",
  shot_regen_audio: "Lồng tiếng một cảnh",
  project_regen_audio: "Lồng tiếng toàn phim",
  project_compose_only: "Chỉ ghép phim",
  tool_image: "Tạo ảnh bằng công cụ",
  tool_video: "Tạo video bằng công cụ",
};

// Resolve project status display text
export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

// Resolve order status display text
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

// Resolve audit status display text
export function auditStatusLabel(status: string): string {
  return AUDIT_STATUS_LABELS[status] ?? status;
}

// Resolve visibility display text
export function visibilityLabel(status: string): string {
  return VISIBILITY_LABELS[status] ?? status;
}

// Resolve ledger kind display text
export function ledgerKindLabel(kind: string): string {
  return LEDGER_KIND_LABELS[kind] ?? kind;
}

// Resolve pay type display text
export function payTypeLabel(payType: string): string {
  return PAY_TYPE_LABELS[payType] ?? payType;
}

// Resolve task status display text
export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

// Resolve task domain display text
export function taskDomainLabel(domain: string): string {
  return TASK_DOMAIN_LABELS[domain] ?? domain;
}

// Resolve task type display text
export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType;
}

/** Filter options for project status select (value stays English for API) */
export const PROJECT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  ...Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
