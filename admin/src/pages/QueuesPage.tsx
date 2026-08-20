import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Ban, Eye, Layers, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminTaskListRes, type AdminTaskRow, type AdminTaskStats } from "@/api/client";
import { StatCard } from "@/components/admin/StatCard";
import { PageSection } from "@/components/admin/PageSection";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import { PageHeader, Toolbar } from "@/components/ui/page";
import { PaginationBar } from "@/components/PaginationBar";
import { cn } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { taskDomainLabel, taskStatusLabel } from "@/lib/statusLabels";

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
  return new Date(value).toLocaleString();
}

function scopeLabel(task: AdminTaskRow): string {
  const parts: string[] = [];
  if (task.drama_project_id) parts.push(`漫剧#${task.drama_project_id}`);
  if (task.project_id) parts.push(`科普#${task.project_id}`);
  if (task.episode_id) parts.push(`分集#${task.episode_id}`);
  if (task.fragment_id) parts.push(`分镜#${task.fragment_id}`);
  return parts.length ? parts.join(" · ") : "—";
}

function canCancel(task: AdminTaskRow): boolean {
  return task.cancelable && !TERMINAL_STATUSES.has(task.status);
}

// 统一任务平台监控页
export function QueuesPage() {
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
  const [viewTab, setViewTab] = useState<"all" | "active">("all");
  const [cancelLoading, setCancelLoading] = useState<number | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
        if (q.trim()) params.set("q", q.trim());
        if (viewTab === "active" && !status) params.set("active_only", "true");
        const res = await api<AdminTaskListRes>(`/api/admin/tasks?${params}`);
        setData(res);
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "加载任务失败");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [domain, page, pageSize, q, status, viewTab],
  );

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        await Promise.all([loadStats(), loadTasks(true)]);
      } catch (err) {
        if (!silent) toast.error(err instanceof Error ? err.message : "刷新失败");
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [loadStats, loadTasks],
  );

  useEffect(() => {
    void refreshAll();
  }, [page, pageSize, domain, status, q, viewTab, refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshAll(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const handleCancel = useCallback(
    async (task: AdminTaskRow) => {
      if (!canCancel(task)) return;
      if (!window.confirm(`确定取消任务 #${task.id}（${task.task_type}）？`)) return;
      setCancelLoading(task.id);
      try {
        await api(`/api/admin/tasks/${task.id}/cancel`, { method: "POST" });
        toast.success("已提交取消请求");
        await refreshAll(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "取消失败");
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

  function openDetail(taskId: number) {
    setDetailTaskId(taskId);
    setDetailOpen(true);
  }

  return (
    <div className="admin-page">
      <PageHeader
        description={`统一任务平台 · 自动刷新 ${REFRESH_MS / 1000}s · 并发 ${stats?.scheduler_running_jobs ?? 0}/${stats?.max_concurrency ?? 0}`}
        actions={
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => void refreshAll()}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </button>
        }
      />

      {loading && !stats ? (
        <div className="admin-panel flex items-center justify-center py-16 text-[var(--admin-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="排队中"
              value={stats?.pending_count ?? 0}
              hint="含待调度 pending"
              icon={Layers}
              tone="warn"
            />
            <StatCard
              label="进行中"
              value={stats?.active_count ?? 0}
              hint={`执行 ${stats?.running_count ?? 0} · 轮询 ${stats?.awaiting_poll_count ?? 0}`}
              icon={Activity}
              tone="info"
            />
            <StatCard
              label="运行时槽位"
              value={
                <>
                  {stats?.scheduler_running_jobs ?? 0}
                  <span className="text-lg text-[var(--admin-muted)]"> / {stats?.max_concurrency ?? 0}</span>
                </>
              }
              hint={`已租约 ${stats?.leased_count ?? 0}`}
              icon={RefreshCw}
            />
            <div className="admin-panel admin-stat-card tone-success">
              <div className="admin-stat-icon">
                <Ban className="h-5 w-5" />
              </div>
              <div className="admin-stat-label">终态统计</div>
              <div className="admin-stat-value !text-base !leading-relaxed">
                成功 {stats?.succeeded_count ?? 0} · 失败 {stats?.failed_count ?? 0} · 取消{" "}
                {stats?.cancelled_count ?? 0}
              </div>
              <div className="admin-stat-hint">
                更新 {stats?.fetched_at ? new Date(stats.fetched_at).toLocaleTimeString() : "—"}
              </div>
            </div>
          </div>

          {(stats?.domains.length ?? 0) > 0 ? (
            <PageSection title="各领域任务" bodyClassName="!pt-0">
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
                      排队 {d.pending} · 进行 {d.active} · 成功 {d.succeeded}
                    </div>
                  </div>
                ))}
              </div>
            </PageSection>
          ) : null}

          <PageSection
            title="任务列表"
            actions={
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["active", `进行中 (${stats?.pending_count ?? 0}+${stats?.active_count ?? 0})`],
                    ["all", "全部"],
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
              <label className="admin-field">
                <span className="admin-field-label">领域</span>
                <select
                  className="admin-select"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">全部</option>
                  {domainOptions.map((d) => (
                    <option key={d} value={d}>
                      {taskDomainLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-field-label">状态</span>
                <select
                  className="admin-select"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                    if (e.target.value) setViewTab("all");
                  }}
                >
                  <option value="">全部</option>
                  {Object.entries({
                    pending: "排队中",
                    leased: "已租约",
                    running: "执行中",
                    awaiting_poll: "等待轮询",
                    cancel_requested: "取消中",
                    succeeded: "已成功",
                    failed: "失败",
                    cancelled: "已取消",
                  }).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQ(searchInput);
                  setPage(1);
                }}
              >
                <label className="admin-field flex-1">
                  <span className="admin-field-label">搜索</span>
                  <div className="admin-input-search-wrap">
                    <Search className="h-4 w-4" />
                    <input
                      className="admin-input"
                      placeholder="任务类型 / 用户邮箱 / dedupe_key"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                    />
                  </div>
                </label>
                <button type="submit" className="admin-btn admin-btn-primary">
                  查询
                </button>
              </form>
            </Toolbar>

            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>领域 / 类型</th>
                    <th>用户</th>
                    <th>关联</th>
                    <th>状态</th>
                    <th>进度</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="admin-empty !py-10">
                          <div className="admin-empty-title">暂无任务</div>
                          <div className="admin-empty-desc">切换到「全部」查看历史任务</div>
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
                          <div className="font-mono text-[11px] text-[#909399]">{task.task_type}</div>
                        </td>
                        <td>
                          <div className="text-xs">{task.user_email ?? `#${task.requested_by}`}</div>
                        </td>
                        <td className="max-w-[180px] truncate text-xs text-[#909399]" title={scopeLabel(task)}>
                          {scopeLabel(task)}
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
                        <td className="text-xs text-[#909399]">
                          <div>创建 {formatTime(task.created_at)}</div>
                          {task.started_at ? <div>开始 {formatTime(task.started_at)}</div> : null}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary !min-h-[28px] !px-2 !text-xs"
                              onClick={() => openDetail(task.id)}
                            >
                              <Eye className="mr-1 inline h-3 w-3" />
                              详情
                            </button>
                            {canCancel(task) ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn-danger !min-h-[28px] !px-2 !text-xs"
                                disabled={cancelLoading === task.id}
                                onClick={() => void handleCancel(task)}
                              >
                                {cancelLoading === task.id ? "取消中…" : "取消"}
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
        taskId={detailTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCancelled={() => void refreshAll(true)}
      />
    </div>
  );
}
