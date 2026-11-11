import type { AdminTaskEvent, AdminTaskRow } from "../api/types/tasks";
import { tr } from "../i18n/translate.ts";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const SENSITIVE_KEY = /(?:authorization|cookie|apikey|accesstoken|refreshtoken|securitytoken|password|passwd|secret|signature|credential|privatekey)|^(?:(?:api|x)?token|sig|sign|auth|sessionkey)$/i;

/** Redact credentials and every URL query value before data reaches text or tooltips. */
export function redactTaskText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
        if (url.hash) url.hash = "#REDACTED";
        return url.toString();
      } catch {
        return "[URL REDACTED]";
      }
    })
    .replace(/(["'](?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|signature|password)["']\s*:\s*["'])[^"']*/gi, "$1[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, "$1 [REDACTED]")
    .replace(/\b((?:authorization|cookie|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|secret|signature|password)\s*[=:]\s*)[^\s,;"'}]+/gi, "$1[REDACTED]");
}

export function redactTaskData(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED]";
  if (typeof value === "string") {
    const safe = redactTaskText(value);
    return safe.length > 32_000 ? `${safe.slice(0, 32_000)}…[TRUNCATED]` : safe;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactTaskData(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 150).map(([key, item]) => {
    const normalized = key.replace(/[^a-z0-9]/gi, "");
    const sensitive = SENSITIVE_KEY.test(normalized) || (typeof item === "string" && /token$/i.test(normalized)) || /^(?:xamz|xoss).*(?:signature|credential|securitytoken)$/i.test(normalized);
    return [key, sensitive ? "[REDACTED]" : redactTaskData(item, depth + 1)];
  }));
}

/** 任务可取消：后端允许且未进入终态 */
export function canCancelTask(task: Pick<AdminTaskRow, "cancelable" | "status">): boolean {
  return task.cancelable && !TERMINAL.has(task.status);
}

export type TaskStatusTone = "run" | "done" | "fail" | "warn";

/** 任务状态归为四种色调，列表色条、状态 pill 与详情摘要共用 */
export function taskStatusTone(status: string): TaskStatusTone {
  if (status === "running" || status === "leased" || status === "awaiting_poll") return "run";
  if (status === "succeeded") return "done";
  if (status === "failed") return "fail";
  return "warn";
}

/** 列表只展示路径部分，域名固定为 TokenFree，完整地址放 title */
export function shortEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.pathname}${url.search}`;
  } catch {
    return endpoint;
  }
}

export function formatTaskDuration(milliseconds: number | null | undefined): string {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return tr("taskObs.notRecorded");
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return tr("taskObs.durSeconds", { s: seconds });
  if (seconds < 3600) return tr("taskObs.durMinutes", { m: Math.floor(seconds / 60), s: seconds % 60 });
  return tr("taskObs.durHours", { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) });
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export function taskDurations(task: Pick<AdminTaskRow, "status" | "created_at" | "started_at" | "finished_at">, now = Date.now()) {
  const created = timestamp(task.created_at);
  const started = timestamp(task.started_at);
  const end = timestamp(task.finished_at) ?? (TERMINAL.has(task.status) ? null : now);
  const difference = (a: number | null, b: number | null) => a == null || b == null ? null : Math.max(0, a - b);
  return {
    waitingMs: difference(started ?? end, created),
    runningMs: difference(end, started),
    totalMs: difference(end, created),
    live: !TERMINAL.has(task.status),
  };
}

export function taskBilling(task: Pick<AdminTaskRow, "billing_status" | "billing_estimate_fen" | "billing_charged_fen" | "billing_refunded_fen">) {
  const status = task.billing_status;
  const labels: Record<string, string> = { none: tr("taskObs.billing.none"), frozen: tr("taskObs.billing.frozen"), settled: tr("taskObs.billing.settled"), skipped: tr("taskObs.billing.skipped") };
  return {
    label: status ? labels[status] || status : tr("taskObs.billing.unknown"),
    settled: status === "settled",
    estimateFen: task.billing_estimate_fen,
    frozenFen: status === "frozen" ? task.billing_estimate_fen : status ? 0 : undefined,
    chargedFen: task.billing_charged_fen,
    refundedFen: task.billing_refunded_fen,
  };
}

export type UpstreamPhase = "started" | "accepted" | "failed" | "poll" | "simulated";
export type UpstreamRecord = {
  id: number;
  phase: UpstreamPhase;
  createdAt?: string | null;
  requestId?: string;
  method?: string;
  endpoint?: string;
  operation?: string;
  model?: string;
  provider?: string;
  providerTaskId?: string;
  elapsedMs?: number;
  httpStatus?: number;
  upstreamStatus?: string;
  request?: unknown;
  response?: unknown;
  error?: unknown;
};

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? redactTaskText(value.trim()) : undefined;
}

export function upstreamRecords(events: AdminTaskEvent[] | undefined): UpstreamRecord[] {
  return (events || []).flatMap((event) => {
    const match = event.event_type.match(/^upstream\.request\.(started|accepted|failed|poll|simulated)$/);
    if (!match) return [];
    const payload = event.payload || {};
    const response = payload.response && typeof payload.response === "object" ? payload.response as Record<string, unknown> : {};
    const body = response.body && typeof response.body === "object" ? response.body as Record<string, unknown> : {};
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const statusCode = payload.http_status ?? payload.status_code ?? response.status_code;
    return [{
      id: event.id,
      phase: match[1] as UpstreamPhase,
      createdAt: event.created_at,
      requestId: textField(payload.request_id),
      method: textField(payload.method),
      endpoint: textField(payload.endpoint),
      operation: textField(payload.operation),
      model: textField(payload.model),
      provider: textField(payload.provider),
      providerTaskId: textField(payload.provider_task_id),
      elapsedMs: typeof payload.elapsed_ms === "number" ? payload.elapsed_ms : undefined,
      httpStatus: typeof statusCode === "number" ? statusCode : undefined,
      upstreamStatus: textField(payload.upstream_status) || textField(body.status) || textField(data.status),
      request: payload.request == null ? undefined : redactTaskData(payload.request),
      response: payload.response == null ? undefined : redactTaskData(payload.response),
      error: payload.error == null ? undefined : redactTaskData(payload.error),
    }];
  }).sort((a, b) => a.id - b.id);
}

// getter：读取时按当前语言取文案
export const UPSTREAM_PHASE_LABELS: Record<UpstreamPhase, string> = {
  get started() { return tr("taskObs.phase.started"); },
  get accepted() { return tr("taskObs.phase.accepted"); },
  get failed() { return tr("taskObs.phase.failed"); },
  get poll() { return tr("taskObs.phase.poll"); },
  get simulated() { return tr("taskObs.phase.simulated"); },
};

export function upstreamStateLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: tr("taskObs.state.queued"), queued: tr("taskObs.state.queued"), submitted: tr("taskObs.state.queued"), waiting: tr("taskObs.state.queued"),
    running: tr("taskObs.state.running"), processing: tr("taskObs.state.running"), generating: tr("taskObs.state.running"), in_progress: tr("taskObs.state.running"),
    succeeded: tr("taskObs.state.done"), success: tr("taskObs.state.done"), completed: tr("taskObs.state.done"), done: tr("taskObs.state.done"), finished: tr("taskObs.state.done"),
    failed: tr("taskObs.state.failed"), error: tr("taskObs.state.failed"), failure: tr("taskObs.state.failed"), cancelled: tr("taskObs.state.cancelled"), canceled: tr("taskObs.state.cancelled"),
  };
  return labels[status.toLowerCase()] || tr("taskObs.upstreamStatus", { status: redactTaskText(status) });
}

export function groupUpstreamRecords(records: UpstreamRecord[]) {
  const grouped = new Map<string, UpstreamRecord[]>();
  for (const record of records) {
    const key = record.requestId || `event-${record.id}`;
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }
  return [...grouped.entries()].map(([key, items]) => {
    const latest = items.at(-1)!;
    const reverse = [...items].reverse();
    return {
      key, records: items, latest,
      requestId: latest.requestId,
      method: reverse.find((item) => item.method)?.method,
      endpoint: reverse.find((item) => item.endpoint)?.endpoint,
      operation: reverse.find((item) => item.operation)?.operation,
      model: reverse.find((item) => item.model)?.model,
      provider: reverse.find((item) => item.provider)?.provider,
      providerTaskId: reverse.find((item) => item.providerTaskId)?.providerTaskId,
      request: reverse.find((item) => item.request !== undefined)?.request,
      response: reverse.find((item) => item.response !== undefined)?.response,
      error: reverse.find((item) => item.error !== undefined)?.error,
      elapsedMs: reverse.find((item) => item.elapsedMs !== undefined)?.elapsedMs,
      httpStatus: reverse.find((item) => item.httpStatus !== undefined)?.httpStatus,
    };
  }).reverse();
}

export function taskUpstream(task: Pick<AdminTaskRow, "events" | "upstream_events" | "steps" | "payload" | "provider_task_id">) {
  // Dedicated bounded evidence remains available when the general event list is omitted or paginated.
  const records = upstreamRecords(task.upstream_events ?? task.events);
  const latest = records.at(-1);
  const modelRecord = [...records].reverse().find((record) => record.model);
  const providerRecord = [...records].reverse().find((record) => record.provider);
  const taskIdRecord = [...records].reverse().find((record) => record.providerTaskId);
  const providerStep = [...(task.steps || [])].reverse().find((step) => step.provider_name);
  const taskIdStep = [...(task.steps || [])].reverse().find((step) => step.provider_task_id);
  const providerTaskId = taskIdRecord?.providerTaskId || textField(task.provider_task_id) || textField(taskIdStep?.provider_task_id);
  return {
    records,
    latest,
    model: modelRecord?.model || textField(task.payload?.model_id) || textField(task.payload?.model),
    modelFromRequest: Boolean(modelRecord),
    provider: providerRecord?.provider || textField(providerStep?.provider_name),
    providerTaskId,
    phase: latest?.upstreamStatus ? upstreamStateLabel(latest.upstreamStatus) : latest ? UPSTREAM_PHASE_LABELS[latest.phase] : providerTaskId ? tr("taskObs.hasTaskNoHttp") : tr("taskObs.noRequests"),
  };
}
