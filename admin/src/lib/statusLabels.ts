import { tr } from "@/i18n/translate";
/** Project pipeline status → Chinese label */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  get DRAFT() { return tr("status.draft") },
  get SCRIPTING() { return tr("status.scriptGenerating") },
  get SCRIPT_READY() { return tr("status.scriptReady") },
  get IMAGING() { return tr("status.storyboardImagesGenerating") },
  get IMAGE_READY() { return tr("status.storyboardImagesReady") },
  get VIDEOING() { return tr("status.videoGenerating") },
  get VIDEO_READY() { return tr("status.videoReady") },
  get AUDIOING() { return tr("status.voicing") },
  get COMPOSING() { return tr("status.composing") },
  get AUDITING() { return tr("status.review") },
  get DONE() { return tr("status.done") },
  get REJECTED() { return tr("status.rejected") },
  get FAILED() { return tr("status.failed") },
  get CANCELLED() { return tr("status.cancelled") },
};

/** Order payment status → Chinese */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  get pending() { return tr("status.pendingPayment") },
  get paid() { return tr("status.paid") },
  get closed() { return tr("status.closed") },
};

/** Work audit / visibility → Chinese */
export const AUDIT_STATUS_LABELS: Record<string, string> = {
  get pending() { return tr("status.pendingReview") },
  get passed() { return tr("status.approved") },
  get rejected() { return tr("status.rejected") },
};

export const VISIBILITY_LABELS: Record<string, string> = {
  get public() { return tr("status.public") },
  get private() { return tr("status.private") },
  get unlisted() { return tr("status.unlisted") },
};

/** Wallet ledger kind → Chinese */
export const LEDGER_KIND_LABELS: Record<string, string> = {
  get topup() { return tr("status.topUp") },
  get grant() { return tr("status.grant") },
  get adjust() { return tr("status.adjustment") },
  get freeze() { return tr("status.hold") },
  get unfreeze() { return tr("status.release") },
  get settle() { return tr("status.settlement") },
  get refund() { return tr("status.refund") },
};

/** Payment channel → Chinese */
export const PAY_TYPE_LABELS: Record<string, string> = {
  get alipay() { return tr("status.alipay") },
  get wxpay() { return tr("status.wechat") },
};

/** Unified task platform status → Chinese */
export const TASK_STATUS_LABELS: Record<string, string> = {
  get pending() { return tr("status.queued") },
  get leased() { return tr("status.leased") },
  get running() { return tr("status.running") },
  get awaiting_poll() { return tr("status.awaitingPoll") },
  get awaiting_review() { return tr("status.pendingReview") },
  get cancel_requested() { return tr("status.cancelling") },
  get succeeded() { return tr("status.succeeded") },
  get failed() { return tr("status.failed") },
  get cancelled() { return tr("status.cancelled") },
};

/** Task domain → Chinese */
export const TASK_DOMAIN_LABELS: Record<string, string> = {
  get drama() { return tr("status.drama") },
  get kepu() { return tr("status.aiShortVideo") },
  get tools() { return tr("status.tools") },
  get studio() { return tr("status.studio") },
  get api() { return tr("status.openApi") },
};

/** Task type → Chinese（轻量同步 + 平台任务） */
export const TASK_TYPE_LABELS: Record<string, string> = {
  get agent_chat() { return tr("status.dramaAssistantChat") },
  get skill_optimize() { return tr("status.skillPromptOptimization") },
  get voice_prompt() { return tr("status.characterVoiceDescription") },
  get content_expand() { return tr("status.topicExpansion") },
  get script_summary() { return tr("status.scriptSummary") },
  get episode_script() { return tr("status.episodeScript") },
  get fragment_plan() { return tr("status.aiShotPlanning") },
  get fragment_video() { return tr("status.shotVideo") },
  get seed_assets() { return tr("status.assetExtraction") },
  get asset_image() { return tr("status.assetImage") },
  get asset_video() { return tr("status.assetVideo") },
  get voice_synthesis() { return tr("status.voiceSynthesis") },
  get project_pipeline() { return tr("status.explainerPipeline") },
  get shot_regen_image() { return tr("status.singleShotRedraw") },
  get shot_regen_video() { return tr("status.singleShotVideo") },
  get shot_regen_audio() { return tr("status.singleShotVoice") },
  get project_regen_audio() { return tr("status.wholeFilmVoice") },
  get project_compose_only() { return tr("status.composeOnly") },
  get v1_image() { return tr("status.apiImage") },
  get v1_video() { return tr("status.apiVideo") },
  v1_seedance: "API Seedance",
  get tool_image() { return tr("status.toolImage") },
  get tool_video() { return tr("status.toolVideo") },
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
  { value: "", label: tr("status.allStatuses") },
  ...Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
