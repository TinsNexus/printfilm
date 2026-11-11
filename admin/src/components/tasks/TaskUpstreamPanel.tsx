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
import { tr } from "../../i18n/translate.ts";

function time(value?: string | null) {
  return value ? new Date(value).toLocaleString() : tr("taskUi.notRecorded");
}

function JsonRecord({ title, value, paginated = false }: { title: string; value: unknown; paginated?: boolean }) {
  return (
    <details className="task-json-toggle">
      <summary>{title}<span>{tr("taskUi.up.redacted")}</span></summary>
      {value === undefined ? <p className="mt-3 text-xs text-[var(--admin-muted)]">{paginated ? tr("taskUi.up.notOnPage") : tr("taskUi.notRecorded")}</p> : <pre className="task-detail-json mt-3">{prettyJson(redactTaskData(value))}</pre>}
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
          <span><span className="text-[var(--admin-muted)]">{tr("taskUi.up.latestPhase")}</span> <strong>{summary.phase}</strong></span>
          <span className="text-[var(--admin-muted)]">{tr("taskUi.up.pageCount", { page: pageRecords.length, total: history.data?.total ?? task.upstream_events_total ?? "—" })}</span>
        </div>
        <Button variant="outline" size="sm" disabled={history.loading} onClick={history.refresh}>{tr("taskUi.up.refresh")}</Button>
      </div>
      <p className="text-[11px] leading-5 text-[var(--admin-muted)]">{tr("taskUi.up.pagingNote")}</p>
      {history.error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{history.error}<Button className="ml-3" variant="outline" size="sm" onClick={history.refresh}>{tr("taskUi.retry")}</Button></div> : null}

      {history.loading ? <p className="py-8 text-center text-sm text-[var(--admin-muted)]" role="status">{tr("taskUi.up.loading")}</p> : history.error ? null : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--admin-border)] px-5 py-8 text-sm text-[var(--admin-muted)]">{tr("taskUi.up.empty")}</div>
      ) : requests.map((request) => {
        const failed = request.latest.phase === "failed" || (request.httpStatus ?? 0) >= 400;
        const simulated = request.latest.phase === "simulated";
        return (
          <section key={request.key} className={cn("task-upstream-card", failed && "is-fail")}>
            <header className="task-upstream-head">
              <Badge variant={failed ? "destructive" : request.latest.phase === "started" ? "warning" : "info"}>{UPSTREAM_PHASE_LABELS[request.latest.phase]}</Badge>
              {request.latest.upstreamStatus ? <Badge variant="secondary">{upstreamStateLabel(request.latest.upstreamStatus)}</Badge> : null}
              <code className="task-upstream-endpoint" title={request.endpoint}>
                <strong>{request.method || (simulated ? tr("taskUi.up.localSim") : "METHOD?")}</strong> {request.endpoint ? shortEndpoint(request.endpoint) : simulated ? request.operation || tr("taskUi.up.mediaGen") : tr("taskUi.up.endpointNotRecorded")}
              </code>
              <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                <span className={cn("task-http-chip", failed && "is-fail")}>{simulated ? tr("taskUi.up.httpNotSent") : request.httpStatus ?? "—"}</span>
                <span>{request.elapsedMs == null ? "—" : `${Math.round(request.elapsedMs)} ms`}</span>
                <span className="text-[var(--admin-muted)]">{time(request.latest.createdAt)}</span>
              </span>
            </header>
            <div className="task-upstream-meta">
              <span><span className="text-[var(--admin-muted)]">{tr("taskUi.up.model")}</span> {request.model || tr("taskUi.notRecorded")} / {request.provider || tr("taskUi.notRecorded")}</span>
              <span className="flex min-w-0 items-center gap-1"><span className="text-[var(--admin-muted)]">{tr("taskUi.up.upstreamTask")}</span> {request.providerTaskId ? <CopyText value={request.providerTaskId} /> : tr("taskUi.notRecorded")}</span>
              <span className="flex min-w-0 items-center gap-1"><span className="text-[var(--admin-muted)]">{tr("taskUi.up.requestId")}</span> {request.requestId ? <CopyText value={request.requestId} /> : tr("taskUi.up.eventN", { id: request.latest.id })}</span>
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
            {simulated ? <p className="mb-3 text-sm text-[var(--admin-muted)]">{tr(request.endpoint ? "taskUi.up.simWithEndpoint" : "taskUi.up.simLegacy")}</p> : null}
            <div className={cn("grid items-start gap-2", !simulated && "xl:grid-cols-2")}>
              <JsonRecord title={tr(simulated ? "taskUi.up.simParams" : "taskUi.up.request")} value={request.request} paginated />
              {!simulated ? <JsonRecord title={tr("taskUi.up.response")} value={request.response} paginated /> : null}
            </div>
            {request.error !== undefined ? <div className="mt-2"><JsonRecord title={tr("taskUi.up.error")} value={request.error} paginated /></div> : null}
          </section>
        );
      })}

      {history.data ? <PaginationBar page={history.page} pageSize={history.pageSize} total={history.data.total} onPageChange={history.setPage} onPageSizeChange={history.changePageSize} pageSizeOptions={[20, 50, 100]} /> : null}

      {(task.steps || []).some((step) => step.input_payload || step.output_payload) ? (
        <details className="task-detail-section">
          <summary className="cursor-pointer text-sm font-semibold">{tr("taskUi.up.stepData")}</summary>
          <p className="my-3 text-xs text-[var(--admin-muted)]">{tr("taskUi.up.stepDataNote")}</p>
          <div className="space-y-4">{task.steps.filter((step) => step.input_payload || step.output_payload).map((step) => <section key={step.id}><h5 className="mb-2 text-xs font-semibold">{step.step_key}{step.provider_name ? ` · ${redactTaskText(step.provider_name)}` : ""}</h5><div className="grid items-start gap-3 xl:grid-cols-2"><JsonRecord title={tr("taskUi.up.stepInput")} value={step.input_payload ?? undefined} /><JsonRecord title={tr("taskUi.up.stepOutput")} value={step.output_payload ?? undefined} /></div></section>)}</div>
        </details>
      ) : null}
    </div>
  );
}
