import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { AdminTaskDetail } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { formatTaskDuration, taskBilling, taskDurations, taskStatusTone, taskUpstream } from "@/lib/taskObservability";
import { taskStatusLabel } from "@/lib/statusLabels";
import { cn, fenToYuan } from "@/lib/utils";
import { tr } from "@/i18n";

type TaskDetailSummaryProps = {
  task: AdminTaskDetail;
  now: number;
  onJump: (tab: "upstream" | "billing") => void;
};

function money(value: number | null | undefined): string {
  return value == null ? "—" : `¥${fenToYuan(value)}`;
}

// 可复制的等宽文本，长 ID 截断显示、完整值放 title
export function CopyText({ value, className }: { value: string; className?: string }) {
  async function copy(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success(tr("taskUi.copied"));
    } catch {
      toast.error(tr("taskUi.copyFailed"));
    }
  }
  return (
    <span className={cn("task-copy", className)} title={value}>
      <span className="truncate">{value}</span>
      <button type="button" aria-label={tr("taskUi.copy")} onClick={(e) => void copy(e)}>
        <Copy className="h-3 w-3" />
      </button>
    </span>
  );
}

// 详情弹窗顶部关键指标条：切换标签页时始终可见，概览不再重复这些信息
export function TaskDetailSummary({ task, now, onJump }: TaskDetailSummaryProps) {
  const tone = taskStatusTone(task.status);
  const duration = taskDurations(task, now);
  const billing = taskBilling(task);
  const upstream = taskUpstream(task);
  const waitingActivation = task.status === "pending" && task.next_action_at === null;
  const charged = billing.settled || (billing.chargedFen ?? 0) > 0;
  return (
    <div className={cn("task-summary", `is-${tone}`)}>
      <div className="task-summary-item">
        <span className="task-summary-label">{tr("taskUi.status")}</span>
        <div className="flex items-center gap-2">
          <span className={`admin-status-pill is-${tone}`}>{waitingActivation ? tr("taskUi.wait.deferred") : taskStatusLabel(task.status)}</span>
          <span className="text-xs tabular-nums text-[var(--admin-muted)]">{task.progress_percent}%</span>
        </div>
        <div className="task-progress"><span style={{ width: `${task.progress_percent}%` }} /></div>
        <span className="task-summary-sub font-mono">{task.current_step_key || tr("taskUi.stepNotRecorded")}{task.current_step_status ? ` · ${task.current_step_status}` : ""}</span>
        {task.execution_mode === "direct" ? <span className="task-summary-sub">{tr("taskUi.directLlm")}</span> : task.queue_type ? <span className="task-summary-sub">{tr("taskUi.queueOf", { kind: tr(`taskUi.queue.${task.queue_type}`) })}{task.provider_status ? tr("taskUi.upstreamStatusSuffix", { status: task.provider_status }) : ""}</span> : null}
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">{tr(upstream.latest?.phase === "simulated" ? "taskUi.simulatedModel" : upstream.modelFromRequest ? "taskUi.actualModelShort" : "taskUi.selectedModel")}</span>
        <span className="task-summary-value break-all">{upstream.model || tr("taskUi.notRecorded")}</span>
        <span className="task-summary-sub">Provider · {upstream.provider || tr("taskUi.notRecorded")}</span>
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">{tr("taskUi.upstream")}<button type="button" className="task-summary-jump" onClick={() => onJump("upstream")}>{tr("taskUi.viewRequest")}</button></span>
        <Badge variant={upstream.latest?.phase === "failed" ? "destructive" : upstream.records.length ? "info" : "secondary"}>{upstream.phase}</Badge>
        {upstream.providerTaskId ? <CopyText value={upstream.providerTaskId} className="task-summary-sub" /> : <span className="task-summary-sub">{tr("taskUi.upstreamIdNotRecorded")}</span>}
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">{tr("taskUi.duration")}{duration.live ? <span className="task-live-dot" title={tr("taskUi.timing")} /> : null}</span>
        <span className="task-summary-value tabular-nums">{formatTaskDuration(duration.totalMs)}</span>
        <span className="task-summary-sub tabular-nums">
          {tr("taskUi.waitRun", { wait: formatTaskDuration(duration.waitingMs), run: duration.runningMs == null && !task.started_at && duration.live ? tr("taskUi.notStarted") : formatTaskDuration(duration.runningMs) })}
        </span>
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">{tr("taskUi.billing")} · {tr(billing.settled ? "taskUi.settled" : "taskUi.unsettled")}<button type="button" className="task-summary-jump" onClick={() => onJump("billing")}>{tr("taskUi.breakdown")}</button></span>
        <span className="task-summary-value tabular-nums">{charged ? money(billing.chargedFen) : (billing.frozenFen ?? 0) > 0 ? tr("taskUi.frozenAmount", { amount: money(billing.frozenFen) }) : tr("taskUi.notCharged")}</span>
        <span className="task-summary-sub tabular-nums">
          {tr("taskUi.estimate", { amount: money(billing.estimateFen) })}{charged ? tr("taskUi.refundLong", { amount: money(billing.refundedFen) }) : ""}
        </span>
      </div>
    </div>
  );
}
