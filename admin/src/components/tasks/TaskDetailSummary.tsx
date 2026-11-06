import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { AdminTaskDetail } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { formatTaskDuration, taskBilling, taskDurations, taskStatusTone, taskUpstream } from "@/lib/taskObservability";
import { taskStatusLabel } from "@/lib/statusLabels";
import { cn, fenToYuan } from "@/lib/utils";

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
      toast.success("Đã sao chép");
    } catch {
      toast.error("Sao chép thất bại, vui lòng chọn thủ công");
    }
  }
  return (
    <span className={cn("task-copy", className)} title={value}>
      <span className="truncate">{value}</span>
      <button type="button" aria-label="Sao chép" onClick={(e) => void copy(e)}>
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
        <span className="task-summary-label">Trạng thái</span>
        <div className="flex items-center gap-2">
          <span className={`admin-status-pill is-${tone}`}>{waitingActivation ? "Chờ kích hoạt" : taskStatusLabel(task.status)}</span>
          <span className="text-xs tabular-nums text-[var(--admin-muted)]">{task.progress_percent}%</span>
        </div>
        <div className="task-progress"><span style={{ width: `${task.progress_percent}%` }} /></div>
        <span className="task-summary-sub font-mono">{task.current_step_key || "Chưa ghi nhận bước"}{task.current_step_status ? ` · ${task.current_step_status}` : ""}</span>
        {task.execution_mode === "direct" ? <span className="task-summary-sub">?? LLM ? ????</span> : task.queue_type ? <span className="task-summary-sub">{{ text: "Văn bản", image: "Hình ảnh", video: "Video" }[task.queue_type]}Hàng đợi{task.provider_status ? ` · Upstream ${task.provider_status}` : ""}</span> : null}
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">{upstream.latest?.phase === "simulated" ? "Model mô phỏng" : upstream.modelFromRequest ? "Model thực tế" : "Model tác vụ đã chọn"}</span>
        <span className="task-summary-value break-all">{upstream.model || "Chưa ghi nhận"}</span>
        <span className="task-summary-sub">Provider · {upstream.provider || "Chưa ghi nhận"}</span>
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">Upstream<button type="button" className="task-summary-jump" onClick={() => onJump("upstream")}>Xem yêu cầu</button></span>
        <Badge variant={upstream.latest?.phase === "failed" ? "destructive" : upstream.records.length ? "info" : "secondary"}>{upstream.phase}</Badge>
        {upstream.providerTaskId ? <CopyText value={upstream.providerTaskId} className="task-summary-sub" /> : <span className="task-summary-sub">Chưa ghi nhận ID tác vụ upstream</span>}
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">Thời gian xử lý{duration.live ? <span className="task-live-dot" title="Đang tính giờ" /> : null}</span>
        <span className="task-summary-value tabular-nums">{formatTaskDuration(duration.totalMs)}</span>
        <span className="task-summary-sub tabular-nums">
          Chờ {formatTaskDuration(duration.waitingMs)} · Đang chạy {duration.runningMs == null && !task.started_at && duration.live ? "Chưa bắt đầu" : formatTaskDuration(duration.runningMs)}
        </span>
      </div>

      <div className="task-summary-item">
        <span className="task-summary-label">Tính phí · {billing.settled ? "Đã quyết toán" : "Chưa quyết toán"}<button type="button" className="task-summary-jump" onClick={() => onJump("billing")}>Chi tiết</button></span>
        <span className="task-summary-value tabular-nums">{charged ? money(billing.chargedFen) : (billing.frozenFen ?? 0) > 0 ? `Đóng băng ${money(billing.frozenFen)}` : "Chưa trừ phí"}</span>
        <span className="task-summary-sub tabular-nums">
          Ước tính {money(billing.estimateFen)}{charged ? ` · Hoàn lại ${money(billing.refundedFen)}` : ""}
        </span>
      </div>
    </div>
  );
}
