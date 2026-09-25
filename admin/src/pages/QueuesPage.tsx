import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Ban, Eye, Layers, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminTaskListRes, type AdminTaskRow, type AdminTaskStats } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { StatCard } from "@/components/admin/StatCard";
import { PageSection } from "@/components/admin/PageSection";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import { PageHeader, Toolbar } from "@/components/ui/page";
import { PaginationBar } from "@/components/PaginationBar";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import { compactJsonPreview, hasJsonContent } from "@/lib/jsonPreview";
import { cn, fenToYuan } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { taskDomainLabel, taskStatusLabel, taskTypeLabel } from "@/lib/statusLabels";
import { formatDateTime, formatTimeOfDay, useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

const REFRESH_MS = 15000;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

// 任务状态 → 样式
function statusClass(status: string): string {
  if (status === "running" || status === "leased") return "is-run";
  if (status === "succeeded") return "is-done";
  if (status === "failed") return "is-fail";
  if (status === "cancelled" || status === "cancel_requested") return "is-warn";
  return "is-warn";
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return formatDateTime(value);
}

// 阻止冒泡到行 onClick，避免链接跳转时同时打开详情
function stopRowClick(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function scopeLinks(task: AdminTaskRow): ReactNode {
  const parts: ReactNode[] = [];
  if (task.drama_project_id) {
    parts.push(
      <span key="drama" onClick={stopRowClick}>
        <AdminEntityLink kind="drama" id={task.drama_project_id} />
      </span>,
    );
  }
  if (task.project_id) {
    parts.push(
      <span key="project" onClick={stopRowClick}>
        <AdminEntityLink kind="project" id={task.project_id} />
      </span>,
    );
  }
  if (task.asset_id) {
    parts.push(
      <span key="asset" onClick={stopRowClick}>
        <AdminEntityLink kind="drama_asset" id={task.asset_id} />
      </span>,
    );
  }
  if (task.episode_id) parts.push(<span key="ep">{tr("queues.episodeRef", { id: task.episode_id })}</span>);
  if (task.fragment_id) parts.push(<span key="frag">{tr("queues.fragmentRef", { id: task.fragment_id })}</span>);
  if (parts.length === 0) return <span className="text-[#909399]">—</span>;
  return <div className="flex flex-wrap gap-1">{parts}</div>;
}

function canCancel(task: AdminTaskRow): boolean {
  return task.cancelable && !TERMINAL_STATUSES.has(task.status);
}

// 列表单元格：参数/结果单行摘要；title 也截断，避免巨 payload 塞进 DOM
function jsonCell(value: Record<string, unknown> | null | undefined) {
  if (!hasJsonContent(value)) {
    return <span className="text-[#909399]">—</span>;
  }
  const preview = compactJsonPreview(value, 72);
  const tip = compactJsonPreview(value, 280);
  return (
    <pre className="task-list-json" title={tip}>
      {preview}
    </pre>
  );
}

// 统一任务平台监控页
export function QueuesPage() {
  const { t: tx } = useI18n();
  /*
   * stats 平台聚合统计
   * data 分页任务列表
   * loading 首次加载
   * refreshing 刷新中
   * page / pageSize 分页
   * q 搜索关键词
   * domain / status 筛选
   * viewTab 快捷视图
   * cancelLoading 取消中的任务 id
   */
  const [stats, setStats] = useState<AdminTaskStats | null>(null);
  const [data, setData] = useState<AdminTaskListRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("");
  const [filterUserId, setFilterUserId] = useState<number | null>(null);
  const [taskType, setTaskType] = useState("");
  const [viewTab, setViewTab] = useState<"all" | "active">("all");
  const [cancelLoading, setCancelLoading] = useState<number | null>(null);
  const taskDetail = useAdminDetailQuery("task");

  const loadStats = useCallback(async () => {
    const res = await api<AdminTaskStats>("/api/admin/tasks/stats");
    setStats(res);
  }, []);

  const loadTasks = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        });
        if (domain) params.set("domain", domain);
        if (status) params.set("status", status);
        if (filterUserId) params.set("user_id", String(filterUserId));
        if (taskType.trim()) params.set("task_type", taskType.trim());
        if (q.trim()) params.set("q", q.trim());
        if (viewTab === "active" && !status) params.set("active_only", "true");
        const res = await api<AdminTaskListRes>(`/api/admin/tasks?${params}`);
        setData(res);
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : tr("queues.couldLoadTasks"));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [domain, filterUserId, page, pageSize, q, status, taskType, viewTab],
  );

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        await Promise.all([loadStats(), loadTasks(true)]);
      } catch (err) {
        if (!silent) toast.error(err instanceof Error ? err.message : tr("queues.refreshFailed"));
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [loadStats, loadTasks],
  );

  useEffect(() => {
    void refreshAll();
  }, [page, pageSize, domain, status, q, viewTab, filterUserId, taskType, refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshAll(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  function openDetail(taskId: number) {
    taskDetail.open(taskId);
  }

  const handleCancel = useCallback(
    async (task: AdminTaskRow) => {
      if (!canCancel(task)) return;
      if (!window.confirm(tr("queues.confirmCancel", { id: task.id, type: taskTypeLabel(task.task_type) }))) return;
      setCancelLoading(task.id);
      try {
        await api(`/api/admin/tasks/${task.id}/cancel`, { method: "POST" });
        toast.success(tr("queues.cancelRequestSubmitted"));
        await refreshAll(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tr("queues.couldCancel"));
      } finally {
        setCancelLoading(null);
      }
    },
    [refreshAll],
  );

  const domainOptions = useMemo(() => {
    const fromStats = stats?.domains.map((d) => d.domain) ?? [];
    return Array.from(new Set(fromStats));
  }, [stats]);

  return (
    <div className="admin-page">
      <PageHeader
        description={tx("queues.platformDesc", { sec: REFRESH_MS / 1000, running: stats?.scheduler_running_jobs ?? 0, max: stats?.max_concurrency ?? 0 })}
        actions={
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => void refreshAll()}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {tx("queues.refresh")}
          </button>
        }
      />

      {loading && !stats ? (
        <div className="admin-panel flex items-center justify-center py-16 text-[var(--admin-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {tx("queues.loading")}
        </div>
      ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={tx("queues.queued")}
              value={stats?.pending_count ?? 0}
              hint={tx("queues.includesPendingAwaitingScheduling")}
              icon={Layers}
              tone="warn"
            />
            <StatCard
              label={tx("queues.progress")}
              value={stats?.active_count ?? 0}
              hint={tx("queues.hintRunning", { run: stats?.running_count ?? 0, poll: stats?.awaiting_poll_count ?? 0 })}
              icon={Activity}
              tone="info"
            />
            <StatCard
              label={tx("queues.runtimeSlots")}
              value={
                <>
                  {stats?.scheduler_running_jobs ?? 0}
                  <span className="text-lg text-[var(--admin-muted)]"> / {stats?.max_concurrency ?? 0}</span>
                </>
              }
              hint={tx("queues.hintLeased", { n: stats?.leased_count ?? 0 })}
              icon={RefreshCw}
            />
            <div className="admin-panel admin-stat-card tone-success">
              <div className="admin-stat-icon">
                <Ban className="h-5 w-5" />
              </div>
              <div className="admin-stat-label">{tx("queues.finalStateStats")}</div>
              <div className="admin-stat-value !text-base !leading-relaxed">
                {tx("queues.finalStats", { ok: stats?.succeeded_count ?? 0, fail: stats?.failed_count ?? 0, cancel: stats?.cancelled_count ?? 0 })}
              </div>
              <div className="admin-stat-hint">
                {tx("queues.updatedAt", { t: stats?.fetched_at ? formatTimeOfDay(stats.fetched_at) : "—" })}
              </div>
            </div>
          </div>

          {(stats?.domains.length ?? 0) > 0 ? (
            <PageSection title={tx("queues.tasksDomain")} bodyClassName="!pt-0">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {stats?.domains.map((d) => (
                  <div key={d.domain} className="admin-domain-card">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{taskDomainLabel(d.domain)}</div>
                        <div className="mt-0.5 font-mono text-xs text-[var(--admin-muted)]">{d.domain}</div>
                      </div>
                      <span
                        className={cn(
                          "admin-status-pill",
                          d.pending + d.active > 0 ? "is-warn" : "is-done",
                        )}
                      >
                        {d.pending + d.active}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[var(--admin-muted)]">
                      {tx("queues.perDomain", { p: d.pending, a: d.active, s: d.succeeded })}
                    </div>
                  </div>
                ))}
              </div>
            </PageSection>
          ) : null}

          <PageSection
            title={tx("queues.taskList")}
            actions={
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["active", tx("queues.activeTab", { p: stats?.pending_count ?? 0, a: stats?.active_count ?? 0 })],
                    ["all", tx("queues.all")],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn("admin-tab !min-h-[30px] !px-3 !text-xs", viewTab === key && "is-active")}
                    onClick={() => {
                      setViewTab(key);
                      setPage(1);
                      if (key === "active") setStatus("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
            bodyClassName="space-y-4 !pt-0"
          >
            <Toolbar>
              <select
                className="admin-select"
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{tx("queues.allDomains")}</option>
                {domainOptions.map((d) => (
                  <option key={d} value={d}>
                    {taskDomainLabel(d)}
                  </option>
                ))}
              </select>
              <select
                className="admin-select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                  if (e.target.value) setViewTab("all");
                }}
              >
                <option value="">{tx("queues.allStatuses")}</option>
                {Object.entries({
                  pending: tx("queues.queued"),
                  leased: tx("queues.leased"),
                  running: tx("queues.running"),
                  awaiting_poll: tx("queues.awaitingPoll"),
                  cancel_requested: tx("queues.cancelling"),
                  succeeded: tx("queues.succeeded"),
                  failed: tx("queues.failed"),
                  cancelled: tx("queues.cancelled"),
                }).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <AdminUserSearchSelect
                value={filterUserId}
                onChange={(id) => {
                  setFilterUserId(id);
                  setPage(1);
                }}
              />
              <input
                className="admin-input"
                placeholder={tx("queues.taskType")}
                value={taskType}
                onChange={(e) => {
                  setTaskType(e.target.value);
                  setPage(1);
                }}
              />
              <AdminSearchInput
                value={searchInput}
                onChange={setSearchInput}
                placeholder={tx("queues.taskTypeUserEmail")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setQ(searchInput);
                    setPage(1);
                  }
                }}
              />
              <button
                type="button"
                className="admin-btn admin-btn-primary admin-filter-action"
                onClick={() => {
                  setQ(searchInput);
                  setPage(1);
                }}
              >
                {tx("queues.search")}
              </button>
            </Toolbar>

            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{tx("queues.domainType")}</th>
                    <th>{tx("queues.user")}</th>
                    <th>{tx("queues.linked")}</th>
                    <th>{tx("queues.status")}</th>
                    <th>{tx("queues.progress2")}</th>
                    <th>{tx("queues.cost")}</th>
                    <th>{tx("queues.submittedParameters")}</th>
                    <th>{tx("queues.result")}</th>
                    <th>{tx("queues.time")}</th>
                    <th>{tx("queues.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        <div className="admin-empty !py-10">
                          <div className="admin-empty-title">{tx("queues.tasks")}</div>
                          <div className="admin-empty-desc">{tx("queues.switchAllSeeHistorical")}</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    data?.items.map((task) => (
                      <tr
                        key={task.id}
                        className="cursor-pointer hover:bg-[#f8faf9]"
                        onClick={() => openDetail(task.id)}
                      >
                        <td className="font-mono text-xs">#{task.id}</td>
                        <td>
                          <div className="text-sm">{taskDomainLabel(task.domain)}</div>
                          <div className="font-mono text-[11px] text-[#909399]">
                            {taskTypeLabel(task.task_type)}
                          </div>
                        </td>
                        <td onClick={stopRowClick}>
                          <AdminEntityLink
                            kind="user"
                            id={task.requested_by}
                            label={task.user_email ?? undefined}
                            className="text-xs"
                          />
                        </td>
                        <td className="max-w-[200px] text-xs" onClick={stopRowClick}>
                          {scopeLinks(task)}
                        </td>
                        <td>
                          <span className={`admin-status-pill ${statusClass(task.status)}`}>
                            {taskStatusLabel(task.status)}
                          </span>
                          {task.error_message ? (
                            <div className="mt-1 max-w-[200px] truncate text-[11px] text-[#f56c6c]" title={task.error_message}>
                              {task.error_message}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-xs">{task.progress_percent}%</td>
                        <td className="text-xs">
                          {task.billing_charged_fen != null && task.billing_charged_fen > 0
                            ? `¥${fenToYuan(task.billing_charged_fen)}`
                            : task.billing_status === "frozen"
                              ? tx("queues.billed", { amount: fenToYuan(task.billing_estimate_fen ?? 0) })
                              : "—"}
                        </td>
                        <td className="task-list-json-cell">{jsonCell(task.payload)}</td>
                        <td className="task-list-json-cell">{jsonCell(task.result_payload)}</td>
                        <td className="text-xs text-[#909399]">
                          <div>{tx("queues.created", { t: formatTime(task.created_at) })}</div>
                          {task.started_at ? <div>{tx("queues.started", { t: formatTime(task.started_at) })}</div> : null}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary !min-h-[28px] !px-2 !text-xs"
                              onClick={() => openDetail(task.id)}
                            >
                              <Eye className="mr-1 inline h-3 w-3" />
                              {tx("queues.details")}
                            </button>
                            {canCancel(task) ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn-danger !min-h-[28px] !px-2 !text-xs"
                                disabled={cancelLoading === task.id}
                                onClick={() => void handleCancel(task)}
                              >
                                {cancelLoading === task.id ? tx("queues.cancelling2") : tx("queues.cancel")}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data?.meta ? (
              <PaginationBar
                page={page}
                pageSize={pageSize}
                total={data.meta.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : null}
          </PageSection>
        </>
      )}

      <TaskDetailDialog
        taskId={taskDetail.id}
        open={taskDetail.isOpen}
        onOpenChange={(open) => {
          if (!open) taskDetail.close();
        }}
        onCancelled={() => void refreshAll(true)}
      />
    </div>
  );
}
