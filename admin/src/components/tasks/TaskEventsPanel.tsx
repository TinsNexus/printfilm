import type { AdminTaskDetail } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { Button } from "@/components/ui/button";
import { useTaskEventPage } from "@/hooks/useTaskEventPage";
import { prettyJson } from "@/lib/jsonPreview";
import { redactTaskData, redactTaskText } from "@/lib/taskObservability";

// 分页查看任务的完整历史，避免渲染全部事件。
export function TaskEventsPanel({ task }: { task: AdminTaskDetail }) {
  const refreshToken = `${task.events_total}:${task.updated_at}:${task.status}`;
  const history = useTaskEventPage(task.id, refreshToken);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--admin-muted)]">Phân trang theo ID sự kiện giảm dần; bản ghi lịch sử được giữ trong cơ sở dữ liệu, không bị mất do chi tiết bị cắt bớt.</p>
        <Button size="sm" variant="outline" disabled={history.loading} onClick={history.refresh}>Làm mới sự kiện</Button>
      </div>
      {history.error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{history.error}<Button className="ml-3" variant="outline" size="sm" onClick={history.refresh}>Thử lại</Button></div> : null}
      {history.loading ? <p className="py-8 text-center text-sm text-[var(--admin-muted)]" role="status">Đang tải sự kiện của trang này…</p> : !history.error ? (
        <div className="task-detail-events">
          {history.data?.items.length ? history.data.items.map((event) => (
            <div key={event.id} className="task-detail-event">
              <div className="task-detail-event-head">
                <span className="font-mono text-xs">#{event.id} · {event.event_type}</span>
                <span className="text-[11px] text-[var(--admin-muted)]">{event.created_at ? new Date(event.created_at).toLocaleString() : "Chưa ghi nhận"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--admin-muted)]">
                {event.status ? <span>status={event.status}</span> : null}
                {event.phase ? <span>phase={event.phase}</span> : null}
              </div>
              {event.message ? <p className="mt-1 text-sm">{redactTaskText(event.message)}</p> : null}
              {event.payload ? <details className="mt-3"><summary className="cursor-pointer text-xs text-[var(--admin-muted)]">Dữ liệu sự kiện (đã ẩn thông tin nhạy cảm)</summary><pre className="task-detail-json task-detail-json--compact mt-2">{prettyJson(redactTaskData(event.payload))}</pre></details> : null}
            </div>
          )) : <p className="text-sm text-[var(--admin-muted)]">Trang này chưa có nhật ký sự kiện</p>}
        </div>
      ) : null}
      {history.data ? <PaginationBar page={history.page} pageSize={history.pageSize} total={history.data.total} onPageChange={history.setPage} onPageSizeChange={history.changePageSize} pageSizeOptions={[20, 50, 100]} /> : null}
    </div>
  );
}
