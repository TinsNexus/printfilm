/** Project pipeline status → Chinese label */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SCRIPTING: "脚本生成中",
  SCRIPT_READY: "脚本就绪",
  IMAGING: "分镜图生成中",
  IMAGE_READY: "分镜图就绪",
  VIDEOING: "视频生成中",
  VIDEO_READY: "视频就绪",
  AUDIOING: "配音中",
  COMPOSING: "合成中",
  AUDITING: "审核中",
  DONE: "已完成",
  REJECTED: "已拒绝",
  FAILED: "失败",
  CANCELLED: "已取消",
};

/** Order payment status → Chinese */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  closed: "已关闭",
};

/** Work audit / visibility → Chinese */
export const AUDIT_STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  passed: "已通过",
  rejected: "已拒绝",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  public: "公开",
  private: "私密",
  unlisted: "不公开列出",
};

/** Wallet ledger kind → Chinese */
export const LEDGER_KIND_LABELS: Record<string, string> = {
  topup: "充值",
  grant: "赠送",
  adjust: "调账",
  freeze: "冻结",
  unfreeze: "解冻",
  settle: "结算",
  refund: "退款",
};

/** Payment channel → Chinese */
export const PAY_TYPE_LABELS: Record<string, string> = {
  alipay: "支付宝",
  wxpay: "微信",
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

/** Filter options for project status select (value stays English for API) */
export const PROJECT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  ...Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
