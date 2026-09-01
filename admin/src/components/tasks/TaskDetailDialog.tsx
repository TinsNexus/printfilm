import { useEffect, useMemo, useState } from "react";
import { Ban, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminTaskDetail } from "@/api/client";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/ui/button";
import { taskDomainLabel, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { cn, fenToYuan } from "@/lib/utils";

type TaskDetailDialogProps = {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
};

type DetailTab = "overview" | "billing" | "steps" | "events" | "json";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

// 格式化时间为本地字符串
function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// 美化 JSON 展示
function fmtJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// 状态 pill 样式
function statusClass(status: string): string {
  if (status === "running" || status === "leased") return "is-run";
  if (status === "succeeded") return "is-done";
  if (status === "failed") return "is-fail";
  if (status === "cancelled" || status === "cancel_requested") return "is-warn";
  return "is-warn";
}

// 任务详情弹窗：概览 / 步骤 / 事件 / 原始 JSON
export function TaskDetailDialog({ taskId, open, onOpenChange, onCancelled }: TaskDetailDialogProps) {
  const [task, setTask] = useState<AdminTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [cancelling, setCancelling] = useState(false);

  async function loadDetail(id: number) {
    setLoading(true);
    try {
      setTask(await api<AdminTaskDetail>(`/api/admin/tasks/${id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载任务详情失败");
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

  const canCancel = useMemo(() => {
    if (!task) return false;
    return task.cancelable && !TERMINAL.has(task.status);
  }, [task]);

  const waitingChain = useMemo(() => {
    if (!task) return false;
    return task.status === "pending" && !task.next_action_at && Boolean(task.batch_key);
  }, [task]);

  async function handleCancel() {
    if (!task || !canCancel) return;
    if (!window.confirm(`确定取消任务 #${task.id}？`)) return;
    setCancelling(true);
    try {
      const updated = await api<AdminTaskDetail>(`/api/admin/tasks/${task.id}/cancel`, { method: "POST" });
      setTask(updated);
      toast.success("已提交取消请求");
      onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取消失败");
    } finally {
      setCancelling(false);
    }
  }

  const title = task ? `任务 #${task.id} · ${taskDomainLabel(task.domain)}` : "任务详情";

  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      className="task-detail-modal max-h-[90vh]"
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
            关闭
          </Button>
          {taskId ? (
            <Button variant="outline" disabled={loading} onClick={() => void loadDetail(taskId)}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              刷新
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="destructive" disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              取消任务
            </Button>
          ) : null}
        </>
      }
    >
      {loading && !task ? (
        <div className="task-detail-loading">
          <Loader2 className="h-6 w-6 animate-spin text-[#67c23a]" />
          <span>加载任务详情…</span>
        </div>
      ) : task ? (
        <div className="task-detail-body">
          <div className="task-detail-tabs" role="tablist">
            {(
              [
                ["overview", "概览"],
                ["billing", `计费 (${task.usage_lines?.length ?? 0})`],
                ["steps", `步骤 (${task.steps?.length ?? 0})`],
                ["events", `事件 (${task.events?.length ?? 0})`],
                ["json", "原始 JSON"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={cn("task-detail-tab", tab === key && "is-active")}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="task-detail-panel">
            {tab === "overview" ? (
              <div className="task-detail-grid">
                <section className="task-detail-section">
                  <h4>状态</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`admin-status-pill ${statusClass(task.status)}`}>
                      {taskStatusLabel(task.status)}
                    </span>
                    <span className="text-sm text-[#606266]">进度 {task.progress_percent}%</span>
                    {waitingChain ? (
                      <span className="admin-status-pill is-warn">等待前置（序列批次）</span>
                    ) : null}
                  </div>
                  {task.current_step_key ? (
                    <p className="task-detail-meta">
                      当前步骤 {task.current_step_key}
                      {task.current_step_status ? ` · ${task.current_step_status}` : ""}
                    </p>
                  ) : null}
                  {task.error_message ? (
                    <pre className="task-detail-error">{task.error_message}</pre>
                  ) : null}
                </section>

                <section className="task-detail-section">
                  <h4>调度</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>优先级</dt>
                      <dd>{task.priority}</dd>
                    </div>
                    <div>
                      <dt>next_action_at</dt>
                      <dd>{fmtTime(task.next_action_at)}</dd>
                    </div>
                    <div>
                      <dt>scheduled_at</dt>
                      <dd>{fmtTime(task.scheduled_at)}</dd>
                    </div>
                    <div>
                      <dt>租约到期</dt>
                      <dd>{fmtTime(task.lease_until)}</dd>
                    </div>
                    <div>
                      <dt>provider_task_id</dt>
                      <dd className="font-mono text-xs">{task.provider_task_id ?? "—"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section">
                  <h4>关联实体</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>用户</dt>
                      <dd>{task.user_email ?? `#${task.requested_by}`}</dd>
                    </div>
                    <div>
                      <dt>漫剧项目</dt>
                      <dd>{task.drama_project_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>分集</dt>
                      <dd>{task.episode_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>分镜</dt>
                      <dd>{task.fragment_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>科普项目</dt>
                      <dd>{task.project_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>镜头</dt>
                      <dd>{task.shot_id ?? "—"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section">
                  <h4>标识</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>batch_key</dt>
                      <dd className="font-mono text-xs break-all">{task.batch_key ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>dedupe_key</dt>
                      <dd className="font-mono text-xs break-all">{task.dedupe_key ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>client_request_id</dt>
                      <dd className="font-mono text-xs break-all">{task.client_request_id ?? "—"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>时间线</h4>
                  <dl className="task-detail-dl task-detail-dl--inline">
                    <div>
                      <dt>创建</dt>
                      <dd>{fmtTime(task.created_at)}</dd>
                    </div>
                    <div>
                      <dt>开始</dt>
                      <dd>{fmtTime(task.started_at)}</dd>
                    </div>
                    <div>
                      <dt>结束</dt>
                      <dd>{fmtTime(task.finished_at)}</dd>
                    </div>
                    <div>
                      <dt>更新</dt>
                      <dd>{fmtTime(task.updated_at)}</dd>
                    </div>
                  </dl>
                </section>

                {task.result_payload && Object.keys(task.result_payload).length > 0 ? (
                  <section className="task-detail-section task-detail-section--full">
                    <h4>结果摘要</h4>
                    <pre className="task-detail-json">{fmtJson(task.result_payload)}</pre>
                  </section>
                ) : null}
              </div>
            ) : null}

            {tab === "billing" ? (
              <div className="task-detail-grid">
                <section className="task-detail-section">
                  <h4>结算摘要</h4>
                  <dl className="task-detail-dl">
                    <div>
                      <dt>计费状态</dt>
                      <dd>{task.billing_status ?? "none"}</dd>
                    </div>
                    <div>
                      <dt>预扣估算</dt>
                      <dd>¥{fenToYuan(task.billing_estimate_fen ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>实扣</dt>
                      <dd>¥{fenToYuan(task.billing_charged_fen ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>退回</dt>
                      <dd>¥{fenToYuan(task.billing_refunded_fen ?? 0)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="task-detail-section task-detail-section--full">
                  <h4>用量明细</h4>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>能力</th>
                          <th>billing_key</th>
                          <th>模型</th>
                          <th>Tokens</th>
                          <th>扣费</th>
                          <th>上游成本</th>
                          <th>计费依据</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(task.usage_lines?.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center text-sm text-[#909399]">
                              暂无用量记录
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
                              <td>¥{fenToYuan(line.cost_fen ?? 0)}</td>
                              <td>{line.billing_basis_label ?? (line.estimated ? "估算" : "实测")}</td>
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
                      <th>步骤</th>
                      <th>状态</th>
                      <th>尝试</th>
                      <th>Provider</th>
                      <th>错误</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(task.steps?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-sm text-[#909399]">
                          暂无步骤记录
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
                            <span className={`admin-status-pill ${statusClass(step.status)}`}>
                              {taskStatusLabel(step.status)}
                            </span>
                          </td>
                          <td className="text-xs">{step.attempt_count}</td>
                          <td className="max-w-[140px] truncate font-mono text-[11px]" title={step.provider_task_id ?? ""}>
                            {step.provider_name ?? "—"}
                            {step.provider_task_id ? ` · ${step.provider_task_id}` : ""}
                          </td>
                          <td className="max-w-[200px] truncate text-[11px] text-[#f56c6c]" title={step.error_message ?? ""}>
                            {step.error_message ?? "—"}
                          </td>
                          <td className="text-[11px] text-[#909399]">
                            <div>始 {fmtTime(step.started_at)}</div>
                            <div>终 {fmtTime(step.finished_at)}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "events" ? (
              <div className="task-detail-events">
                {(task.events?.length ?? 0) === 0 ? (
                  <p className="text-sm text-[#909399]">暂无事件日志</p>
                ) : (
                  [...(task.events ?? [])]
                    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                    .map((ev) => (
                      <div key={ev.id} className="task-detail-event">
                        <div className="task-detail-event-head">
                          <span className="font-mono text-xs text-[#303133]">{ev.event_type}</span>
                          <span className="text-[11px] text-[#909399]">{fmtTime(ev.created_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#909399]">
                          {ev.status ? <span>status={ev.status}</span> : null}
                          {ev.phase ? <span>phase={ev.phase}</span> : null}
                        </div>
                        {ev.message ? <p className="mt-1 text-sm text-[#606266]">{ev.message}</p> : null}
                        {ev.payload ? (
                          <pre className="task-detail-json task-detail-json--compact">{fmtJson(ev.payload)}</pre>
                        ) : null}
                      </div>
                    ))
                )}
              </div>
            ) : null}

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
          </div>
        </div>
      ) : null}
    </AdminModal>
  );
}
