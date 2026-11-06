import { useMemo } from "react";
import type { AdminTaskDetail } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/PaginationBar";
import { useTaskEventPage } from "@/hooks/useTaskEventPage";
import { prettyJson } from "@/lib/jsonPreview";
import { CopyText } from "@/components/tasks/TaskDetailSummary";
import { groupUpstreamRecords, redactTaskData, redactTaskText, shortEndpoint, taskUpstream, upstreamRecords, upstreamStateLabel, UPSTREAM_PHASE_LABELS } from "@/lib/taskObservability";
import { cn } from "@/lib/utils";

function time(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Chưa ghi nhận";
}

function JsonRecord({ title, value, paginated = false }: { title: string; value: unknown; paginated?: boolean }) {
  return (
    <details className="task-json-toggle">
      <summary>{title}<span>Đã ẩn</span></summary>
      {value === undefined ? <p className="mt-3 text-xs text-[var(--admin-muted)]">{paginated ? "Trang này không có, có thể lật trang xem bản ghi lịch sử" : "Chưa ghi nhận"}</p> : <pre className="task-detail-json mt-3">{prettyJson(redactTaskData(value))}</pre>}
    </details>
  );
}

/** 展示真实 HTTP 留痕及明确标记的本地模拟参数，模拟事件不代表实际网络请求。 */
export function TaskUpstreamPanel({ task }: { task: AdminTaskDetail }) {
  const summary = useMemo(() => taskUpstream(task), [task]);
  const refreshToken = `${task.upstream_events_total}:${task.updated_at}:${task.status}`;
  const history = useTaskEventPage(task.id, refreshToken, "upstream.request.");
  const pageRecords = useMemo(() => upstreamRecords(history.data?.items), [history.data]);
  const requests = useMemo(() => groupUpstreamRecords(pageRecords), [pageRecords]);
  return (
    <div className="space-y-3">
      <div className="task-upstream-toolbar">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span><span className="text-[var(--admin-muted)]">Giai đoạn gần nhất</span> <strong>{summary.phase}</strong></span>
          <span className="text-[var(--admin-muted)]">Trang này {pageRecords.length} mục · lịch sử {history.data?.total ?? task.upstream_events_total ?? "—"} mục</span>
        </div>
        <Button variant="outline" size="sm" disabled={history.loading} onClick={history.refresh}>Làm mới bản ghi upstream</Button>
      </div>
      <p className="text-[11px] leading-5 text-[var(--admin-muted)]">Phân trang theo ID sự kiện giảm dần, trong trang này liên kết yêu cầu và phản hồi theo ID yêu cầu; cùng một yêu cầu có thể nằm ở nhiều trang, sự kiện truy vấn có thể là bản ghi lấy mẫu.</p>
      {history.error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{history.error}<Button className="ml-3" variant="outline" size="sm" onClick={history.refresh}>Thử lại</Button></div> : null}

      {history.loading ? <p className="py-8 text-center text-sm text-[var(--admin-muted)]" role="status">Đang tải sự kiện upstream của trang này…</p> : history.error ? null : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--admin-border)] px-5 py-8 text-sm text-[var(--admin-muted)]">Trang này không ghi nhận yêu cầu HTTP upstream hoặc tham số yêu cầu mô phỏng. Dù đã có ID tác vụ upstream hoặc tác vụ đã hoàn tất, cũng không thể khôi phục nội dung yêu cầu thực tế từ đó.</div>
      ) : requests.map((request) => {
        const failed = request.latest.phase === "failed" || (request.httpStatus ?? 0) >= 400;
        const simulated = request.latest.phase === "simulated";
        return (
          <section key={request.key} className={cn("task-upstream-card", failed && "is-fail")}>
            <header className="task-upstream-head">
              <Badge variant={failed ? "destructive" : request.latest.phase === "started" ? "warning" : "info"}>{UPSTREAM_PHASE_LABELS[request.latest.phase]}</Badge>
              {request.latest.upstreamStatus ? <Badge variant="secondary">{upstreamStateLabel(request.latest.upstreamStatus)}</Badge> : null}
              <code className="task-upstream-endpoint" title={request.endpoint}>
                <strong>{request.method || (simulated ? "Mô phỏng cục bộ" : "METHOD?")}</strong> {request.endpoint ? shortEndpoint(request.endpoint) : simulated ? request.operation || "Tạo phương tiện" : "Chưa ghi nhận Endpoint"}
              </code>
              <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                <span className={cn("task-http-chip", failed && "is-fail")}>{simulated ? "Chưa gửi HTTP" : request.httpStatus ?? "—"}</span>
                <span>{request.elapsedMs == null ? "—" : `${Math.round(request.elapsedMs)} ms`}</span>
                <span className="text-[var(--admin-muted)]">{time(request.latest.createdAt)}</span>
              </span>
            </header>
            <div className="task-upstream-meta">
              <span><span className="text-[var(--admin-muted)]">Model</span> {request.model || "Chưa ghi nhận"} / {request.provider || "Chưa ghi nhận"}</span>
              <span className="flex min-w-0 items-center gap-1"><span className="text-[var(--admin-muted)]">Tác vụ upstream</span> {request.providerTaskId ? <CopyText value={request.providerTaskId} /> : "Chưa ghi nhận"}</span>
              <span className="flex min-w-0 items-center gap-1"><span className="text-[var(--admin-muted)]">ID yêu cầu</span> {request.requestId ? <CopyText value={request.requestId} /> : `Sự kiện #${request.latest.id}`}</span>
            </div>
            {request.records.length > 1 ? (
              <ol className="task-upstream-steps">
                {request.records.map((record) => (
                  <li key={record.id}>
                    <span className="font-medium">{UPSTREAM_PHASE_LABELS[record.phase]}</span>
                    {record.upstreamStatus ? <span>{upstreamStateLabel(record.upstreamStatus)}</span> : null}
                    <span className="text-[var(--admin-muted)]">{record.createdAt ? new Date(record.createdAt).toLocaleTimeString() : "—"}</span>
                    {record.elapsedMs != null ? <span className="text-[var(--admin-muted)]">{Math.round(record.elapsedMs)} ms</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {simulated ? <p className="mb-3 text-sm text-[var(--admin-muted)]">{request.endpoint ? "Dưới đây là URL, header và JSON body thực tế chuẩn bị gửi sau khi hoàn tất định tuyến kênh, ánh xạ model và chuyển đổi giao thức (thông tin xác thực đã ẩn). Bị chặn trước khi gửi HTTP, dùng kết quả phương tiện mặc định." : "Bản ghi lịch sử chỉ lưu tham số đầu vào nghiệp vụ, không phải body HTTP cuối cùng; các tác vụ mô phỏng tạo sau này sẽ ghi lại tham số yêu cầu cuối cùng."}</p> : null}
            <div className={cn("grid items-start gap-2", !simulated && "xl:grid-cols-2")}>
              <JsonRecord title={simulated ? "Tham số yêu cầu mô phỏng" : "Yêu cầu"} value={request.request} paginated />
              {!simulated ? <JsonRecord title="Phản hồi" value={request.response} paginated /> : null}
            </div>
            {request.error !== undefined ? <div className="mt-2"><JsonRecord title="Lỗi" value={request.error} paginated /></div> : null}
          </section>
        );
      })}

      {history.data ? <PaginationBar page={history.page} pageSize={history.pageSize} total={history.data.total} onPageChange={history.setPage} onPageSizeChange={history.changePageSize} pageSizeOptions={[20, 50, 100]} /> : null}

      {(task.steps || []).some((step) => step.input_payload || step.output_payload) ? (
        <details className="task-detail-section">
          <summary className="cursor-pointer text-sm font-semibold">Dữ liệu bước hiện có (bản ghi thực thi nội bộ)</summary>
          <p className="my-3 text-xs text-[var(--admin-muted)]">Dưới đây là đầu vào và kết quả của bước, không đại diện cho body HTTP thực sự gửi tới upstream.</p>
          <div className="space-y-4">{task.steps.filter((step) => step.input_payload || step.output_payload).map((step) => <section key={step.id}><h5 className="mb-2 text-xs font-semibold">{step.step_key}{step.provider_name ? ` · ${redactTaskText(step.provider_name)}` : ""}</h5><div className="grid items-start gap-3 xl:grid-cols-2"><JsonRecord title="Đầu vào bước" value={step.input_payload ?? undefined} /><JsonRecord title="Kết quả bước" value={step.output_payload ?? undefined} /></div></section>)}</div>
        </details>
      ) : null}
    </div>
  );
}
