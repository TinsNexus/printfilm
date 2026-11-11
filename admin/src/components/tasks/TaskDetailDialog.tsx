import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Ban, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminTaskDetail } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskUpstreamPanel } from "@/components/tasks/TaskUpstreamPanel";
import { TaskEventsPanel } from "@/components/tasks/TaskEventsPanel";
import { TaskDetailSummary } from "@/components/tasks/TaskDetailSummary";
import { useTaskClock } from "@/hooks/useTaskClock";
import { taskDomainLabel, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { hasJsonContent, prettyJson } from "@/lib/jsonPreview";
import { cn, fenToYuan } from "@/lib/utils";
import { redactTaskData, redactTaskText, taskBilling, taskStatusTone } from "@/lib/taskObservability";
import { tr } from "../../i18n/translate.ts";

type TaskDetailDialogProps = {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
};

type DetailTab = "overview" | "upstream" | "billing" | "steps" | "events" | "json";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

// 只存 key（模块级常量不能存已翻译文字），渲染时 tr
const PAYLOAD_FIELD_LABELS: Record<string, string> = {
  prompt: "taskUi.dd.field.prompt",
  name: "taskUi.dd.field.name",
  kind: "taskUi.dd.field.kind",
  model_id: "taskUi.dd.field.model_id",
  image_style_id: "taskUi.dd.field.image_style_id",
  aspect_ratio: "taskUi.dd.field.aspect_ratio",
  resolution: "taskUi.dd.field.resolution",
  duration_sec: "taskUi.dd.field.duration_sec",
  duration: "taskUi.dd.field.duration",
  force: "taskUi.dd.field.force",
  total: "taskUi.dd.field.total",
  project_id: "taskUi.dd.field.project_id",
  user_id: "taskUi.dd.field.user_id",
  asset_id: "taskUi.dd.field.asset_id",
  episode_count: "taskUi.dd.field.episode_count",
  phase: "taskUi.dd.field.phase",
  sync: "taskUi.dd.field.sync",
  refresh_prompts: "taskUi.dd.field.refresh_prompts",
  reextract_props: "taskUi.dd.field.reextract_props",
};

// 格式化时间为本地字符串
function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// 美化 JSON 展示
function fmtJson(value: unknown): string {
  return prettyJson(redactTaskData(value));
}

function money(value: number | null | undefined): string {
  return value == null ? tr("taskUi.notRecorded") : `¥${fenToYuan(value)}`;
}

// 仅在有值时渲染一行定义列表项
function DlRow({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "" || children === "—") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// DlRow 未渲染时 children 仍是元素描述符；按 props 判断是否会出内容。
function dlRowWillShow(child: ReactNode): boolean {
  if (child == null || child === false) return false;
  if (!isValidElement(child)) return Boolean(child);
  if (child.type !== DlRow) return true;
  const c = (child.props as { children?: ReactNode }).children;
  return c != null && c !== "" && c !== "—";
}

// 有内容才包一层 section，避免「标识」等空壳标题
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  const visible = Children.toArray(children).filter(dlRowWillShow);
  if (visible.length === 0) return null;
  return (
    <section className="task-detail-section">
      <h4>{title}</h4>
      <dl className="task-detail-dl">{visible}</dl>
    </section>
  );
}

// 从 payload 抽出可读字段摘要（其余仍看下方 JSON）
function payloadSummaryRows(
  payload: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  const rows: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, labelKey] of Object.entries(PAYLOAD_FIELD_LABELS)) {
    const label = tr(labelKey);
    if (!(key in payload)) continue;
    const raw = payload[key];
    if (raw == null || raw === "") continue;
    if (typeof raw === "boolean") {
      rows.push({ key, label, value: tr(raw ? "taskUi.dd.yes" : "taskUi.dd.no") });
      continue;
    }
    const text = String(raw).trim();
    if (!text) continue;
    rows.push({ key, label, value: text.length > 240 ? `${text.slice(0, 240)}…` : text });
  }
  return rows;
}

// 任务详情弹窗：概览 / 步骤 / 事件 / 原始 JSON
export function TaskDetailDialog({ taskId, open, onOpenChange, onCancelled }: TaskDetailDialogProps) {
  const [task, setTask] = useState<AdminTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [cancelling, setCancelling] = useState(false);
  const now = useTaskClock(open && Boolean(task) && !TERMINAL.has(task?.status || ""));
  const billing = taskBilling(task || {});

  async function loadDetail(id: number) {
    setLoading(true);
    try {
      setTask(await api<AdminTaskDetail>(`/api/admin/tasks/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("taskUi.dd.loadFailed"));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !taskId) {
      setTask(null);
      setTab("overview");
      return;
    }
    void loadDetail(taskId);
  }, [open, taskId]);

  useEffect(() => {
    if (!open || !taskId || !task || (TERMINAL.has(task.status) && task.billing_status !== "frozen")) return;
    let cancelled = false;
    let inFlight = false;
    const timer = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const current = await api<AdminTaskDetail>(`/api/admin/tasks/${taskId}`);
        if (!cancelled) setTask(current);
      } catch {
        // A transient refresh failure keeps the last verified snapshot visible.
      } finally {
        inFlight = false;
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, taskId, task?.status, task?.billing_status]);

  const canCancel = useMemo(() => {
    if (!task) return false;
    return task.cancelable && !TERMINAL.has(task.status);
  }, [task]);

  const waitingActivation = useMemo(() => {
    if (!task) return false;
    return task.status === "pending" && task.next_action_at === null;
  }, [task]);

  const payloadRows = useMemo(() => payloadSummaryRows(redactTaskData(task?.payload) as Record<string, unknown> | null), [task?.payload]);

  async function handleCancel() {
    if (!task || !canCancel) return;
    if (!window.confirm(tr("taskUi.dd.confirmCancel", { id: task.id }))) return;
    setCancelling(true);
    try {
      const updated = await api<AdminTaskDetail>(`/api/admin/tasks/${task.id}/cancel`, { method: "POST" });
      setTask(updated);
      toast.success(tr("taskUi.dd.cancelRequested"));
      onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("taskUi.dd.cancelFailed"));
    } finally {
      setCancelling(false);
    }
  }

  const title = task ? tr("taskUi.dd.title", { id: task.id, domain: taskDomainLabel(task.domain) }) : tr("taskUi.dd.titleEmpty");

  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      className="task-detail-modal max-h-[92vh]"
      bodyClassName="p-0 overflow-hidden"
      title={title}
      subtitle={
        task ? (
          <span className="font-mono text-xs">
            {taskTypeLabel(task.task_type)}
            {task.user_email ? ` · ${task.user_email}` : ""}
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("taskUi.dd.close")}
          </Button>
          {taskId ? (
            <Button variant="outline" disabled={loading} onClick={() => void loadDetail(taskId)}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              {tr("taskUi.dd.refresh")}
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="destructive" disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              {tr("taskUi.cancelTask")}
            </Button>
          ) : null}
        </>
      }
    >
      {loading && !task ? (
        <div className="task-detail-loading">
          <Loader2 className="h-6 w-6 animate-spin text-[#67c23a]" />
          <span>{tr("taskUi.dd.loading")}</span>
        </div>
      ) : task ? (
        <Tabs className="task-detail-body" value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
          <TaskDetailSummary task={task} now={now} onJump={setTab} />
          <TabsList className="task-detail-tabs !h-auto !justify-start !rounded-none !bg-white !p-0">
            {(
              [
                ["overview", tr("taskUi.dd.tabOverview")],
                ["upstream", tr("taskUi.dd.tabUpstream")],
                ["billing", tr("taskUi.dd.tabBilling", { n: task.usage_lines?.length ?? 0 })],
                ["steps", tr("taskUi.dd.tabSteps", { n: task.steps?.length ?? 0 })],
                ["events", tr("taskUi.dd.tabEvents", { n: task.events_total ?? task.events?.length ?? 0 })],
                ["json", tr("taskUi.dd.tabJson")],
              ] as const
            ).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className={cn("task-detail-tab", tab === key && "is-active")}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="task-detail-panel !mt-0">
            {tab === "overview" ? (
              <div className="task-detail-grid">
                {waitingActivation || task.error_code || task.error_message ? (
                  <section className="task-detail-section task-detail-section--full">
                    <h4>{tr("taskUi.dd.alerts")}</h4>
                    {waitingActivation ? <p className="task-detail-meta !mt-0">{tr("taskUi.dd.waitingActivation")}</p> : null}
                    {task.error_code || task.error_message ? (
                      <pre className="task-detail-error">
                        {redactTaskText([task.error_code, task.error_message].filter(Boolean).join(" · "))}
                      </pre>
                    ) : null}
                  </section>
                ) : null}

                <DetailSection title={tr("taskUi.dd.secSchedule")}>
                  <DlRow label={tr("taskUi.dd.priority")}>{task.priority}</DlRow>
                  <DlRow label="scheduled_at">{task.scheduled_at ? fmtTime(task.scheduled_at) : null}</DlRow>
                  <DlRow label="next_action_at">{task.next_action_at ? fmtTime(task.next_action_at) : null}</DlRow>
                  <DlRow label={tr("taskUi.dd.leaseUntil")}>{task.lease_until ? fmtTime(task.lease_until) : null}</DlRow>
                  <DlRow label="provider_task_id">
                    {task.provider_task_id ? (
                      <span className="font-mono text-xs break-all">{redactTaskText(task.provider_task_id)}</span>
                    ) : null}
                  </DlRow>
                </DetailSection>

                <DetailSection title={tr("taskUi.dd.secEntities")}>
                  <DlRow label={tr("taskUi.dd.user")}>
                    <AdminEntityLink kind="user" id={task.requested_by} label={task.user_email ?? undefined} />
                  </DlRow>
                  <DlRow label={tr("taskUi.dd.dramaProject")}>
                    {task.drama_project_id ? <AdminEntityLink kind="drama" id={task.drama_project_id} /> : null}
                  </DlRow>
                  <DlRow label={tr("taskUi.dd.asset")}>
                    {task.asset_id ? <AdminEntityLink kind="drama_asset" id={task.asset_id} /> : null}
                  </DlRow>
                  <DlRow label={tr("taskUi.dd.script")}>{task.script_id ? `#${task.script_id}` : null}</DlRow>
                  <DlRow label={tr("taskUi.dd.episode")}>{task.episode_id ? `#${task.episode_id}` : null}</DlRow>
                  <DlRow label={tr("taskUi.dd.shot")}>{task.fragment_id ? `#${task.fragment_id}` : null}</DlRow>
                  <DlRow label={tr("taskUi.dd.explainerProject")}>
                    {task.project_id ? <AdminEntityLink kind="project" id={task.project_id} /> : null}
                  </DlRow>
                  <DlRow label={tr("taskUi.dd.camShot")}>{task.shot_id ? `#${task.shot_id}` : null}</DlRow>
                </DetailSection>

                <DetailSection title={tr("taskUi.dd.secIds")}>
                  <DlRow label="dedupe_key">
                    {task.dedupe_key ? <span className="font-mono text-xs break-all">{task.dedupe_key}</span> : null}
                  </DlRow>
                  <DlRow label="batch_key">
                    {task.batch_key ? <span className="font-mono text-xs break-all">{task.batch_key}</span> : null}
                  </DlRow>
                  <DlRow label="client_request_id">
                    {task.client_request_id ? (
                      <span className="font-mono text-xs break-all">{task.client_request_id}</span>
                    ) : null}
                  </DlRow>
                </DetailSection>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{tr("taskUi.dd.timeline")}</h4>
                  <ol className="task-timeline">
                    {(
                      [
                        [tr("taskUi.dd.tCreated"), task.created_at],
                        [tr("taskUi.dd.tStarted"), task.started_at],
                        [tr("taskUi.dd.tFinished"), task.finished_at],
                        [tr("taskUi.dd.tUpdated"), task.updated_at],
                      ] as const
                    ).map(([label, value]) => (
                      <li key={label} className={cn(value && "is-reached")}>
                        <span className="task-timeline-label">{label}</span>
                        <span className="task-timeline-time">{fmtTime(value)}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{tr("taskUi.dd.payloadTitle")}</h4>
                  <p className="mb-3 text-xs text-[var(--admin-muted)]">{tr("taskUi.dd.payloadNote")}</p>
                  {payloadRows.length > 0 ? (
                    <dl className="task-detail-dl task-detail-dl--payload mb-3">
                      {payloadRows.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd className={row.key === "prompt" ? "whitespace-pre-wrap break-words" : "break-all"}>
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {hasJsonContent(task.payload) ? (
                    <pre className="task-detail-json">{fmtJson(task.payload)}</pre>
                  ) : (
                    <p className="task-detail-meta">{tr("taskUi.dd.noPayload")}</p>
                  )}
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{tr("taskUi.dd.result")}</h4>
                  {hasJsonContent(task.result_payload) ? (
                    <pre className="task-detail-json">{fmtJson(task.result_payload)}</pre>
                  ) : (
                    <p className="task-detail-meta">{tr("taskUi.dd.noResult")}</p>
                  )}
                </section>
              </div>
            ) : null}

            {tab === "upstream" ? <TaskUpstreamPanel key={task.id} task={task} /> : null}

            {tab === "billing" ? (
              <div className="task-detail-grid">
                <section className="task-detail-section">
                  <h4>{tr("taskUi.dd.settlementTitle")}</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>{tr("taskUi.dd.billingStatus")}</dt>
                      <dd><Badge variant={billing.settled ? "success" : "warning"}>{billing.label}</Badge></dd>
                    </div>
                    <div>
                      <dt>{tr("taskUi.dd.estimate")}</dt>
                      <dd>{money(billing.estimateFen)}</dd>
                    </div>
                    <div>
                      <dt>{tr("taskUi.dd.frozen")}</dt>
                      <dd>{money(billing.frozenFen)}</dd>
                    </div>
                    <div>
                      <dt>{tr("taskUi.dd.charged")}</dt>
                      <dd>{billing.settled || (billing.chargedFen ?? 0) > 0 ? money(billing.chargedFen) : tr("taskUi.dd.notSettled")}</dd>
                    </div>
                    <div>
                      <dt>{tr("taskUi.dd.refunded")}</dt>
                      <dd>{billing.settled || (billing.refundedFen ?? 0) > 0 ? money(billing.refundedFen) : tr("taskUi.dd.notSettled")}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>{tr("taskUi.dd.usageTitle")}</h4>
                  {task.billing_snapshot && <div className="mb-3 text-xs text-[var(--admin-muted)]">
                    <p>{tr("taskUi.dd.billingMode", { mode: task.billing_snapshot.mode === "fixed_media" ? tr("taskUi.dd.sitePrice", { v: task.billing_snapshot.price_version }) : tr("taskUi.dd.legacyRules") })}</p>
                    {task.billing_snapshot.items.map((item, index) => <p key={index}>{item.model_id} · {item.params.resolution} · {item.params.duration ? tr("taskUi.dd.nSeconds", { n: item.params.duration }) : tr("taskUi.dd.nImages", { n: item.params.count })} · {item.route.channel_name || item.route.channel_id} → {item.route.upstream_model}</p>)}
                  </div>}
                  <p className="mb-3 text-xs text-[var(--admin-muted)]">{tr("taskUi.dd.usageNote")}</p>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{tr("taskUi.dd.colTime")}</th>
                          <th>{tr("taskUi.dd.colCapability")}</th>
                          <th>billing_key</th>
                          <th>Model</th>
                          <th>Tokens</th>
                          <th>{tr("taskUi.dd.colCharge")}</th>
                          <th>{tr("taskUi.dd.colBasis")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(task.usage_lines?.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center text-sm text-[#909399]">
                              {tr("taskUi.dd.noUsage")}
                            </td>
                          </tr>
                        ) : (
                          task.usage_lines?.map((line) => (
                            <tr key={line.id}>
                              <td className="text-[11px] text-[#909399]">{fmtTime(line.created_at)}</td>
                              <td>{line.capability ?? "—"}</td>
                              <td className="font-mono text-xs">{line.billing_key}</td>
                              <td className="max-w-[120px] truncate text-xs">{line.model || "—"}</td>
                              <td>{line.total_tokens ?? 0}</td>
                              <td>¥{fenToYuan(line.charge_fen ?? 0)}</td>
                              <td>{line.billing_detail?.mode === 'fixed_media' ? <>
                                <div>{line.billing_detail.resolution} · ¥{line.billing_detail.unit_price_yuan} × {line.billing_detail.duration ?? 1}{tr(line.billing_detail.duration ? "taskUi.dd.unitSecond" : "taskUi.dd.unitImage")}</div>
                                <div className="text-xs text-[var(--admin-muted)]">{tr("taskUi.dd.priceN", { v: line.billing_detail.price_version })} · {line.billing_detail.route.channel_name || line.billing_detail.route.channel_id} · {tr(line.billing_detail.delivered ? "taskUi.dd.delivered" : "taskUi.dd.notDelivered")}</div>
                              </> : line.billing_basis_label ?? (line.estimated ? tr("taskUi.dd.estimated") : tr("taskUi.dd.measured"))}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "steps" ? (
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("taskUi.dd.colStep")}</th>
                      <th>{tr("taskUi.status")}</th>
                      <th>{tr("taskUi.dd.colAttempt")}</th>
                      <th>Provider</th>
                      <th>{tr("taskUi.up.error")}</th>
                      <th>{tr("taskUi.dd.colTime")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(task.steps?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-sm text-[#909399]">
                          {tr("taskUi.dd.noSteps")}
                        </td>
                      </tr>
                    ) : (
                      task.steps.map((step) => (
                        <tr key={step.id}>
                          <td>
                            <div className="font-mono text-xs">{step.step_key}</div>
                            <div className="text-[11px] text-[#909399]">{step.step_type}</div>
                          </td>
                          <td>
                            <span className={`admin-status-pill is-${taskStatusTone(step.status)}`}>
                              {taskStatusLabel(step.status)}
                            </span>
                          </td>
                          <td className="text-xs">{step.attempt_count}</td>
                          <td className="max-w-[140px] truncate font-mono text-[11px]" title={redactTaskText(step.provider_task_id ?? "")}>
                            {redactTaskText(step.provider_name ?? "—")}
                            {step.provider_task_id ? ` · ${redactTaskText(step.provider_task_id)}` : ""}
                          </td>
                          <td className="max-w-[200px] truncate text-[11px] text-[#f56c6c]" title={redactTaskText(step.error_message ?? "")}>
                            {redactTaskText(step.error_message ?? "—")}
                          </td>
                          <td className="text-[11px] text-[#909399]">
                            <div>{tr("taskUi.dd.stepStart", { time: fmtTime(step.started_at) })}</div>
                            <div>{tr("taskUi.dd.stepEnd", { time: fmtTime(step.finished_at) })}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "events" ? <TaskEventsPanel key={task.id} task={task} /> : null}

            {tab === "json" ? (
              <div className="space-y-4">
                <div>
                  <h4 className="task-detail-json-title">payload</h4>
                  <pre className="task-detail-json">{fmtJson(task.payload)}</pre>
                </div>
                <div>
                  <h4 className="task-detail-json-title">result_payload</h4>
                  <pre className="task-detail-json">{fmtJson(task.result_payload)}</pre>
                </div>
                <div>
                  <h4 className="task-detail-json-title">targets</h4>
                  <pre className="task-detail-json">{fmtJson(task.targets)}</pre>
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      ) : null}
    </AdminModal>
  );
}
