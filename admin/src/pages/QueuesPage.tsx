import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Layers, Loader2, Minus, Plus, Power, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminQueuesSnapshot, type AdminQueueTask } from "@/api/client";
import { cn } from "@/lib/utils";

const REFRESH_MS = 15000;
const LIGHT_QUERY = "?detail=0";
const FULL_QUERY = "?detail=1";

// 任务状态 → 样式
function stateClass(state: string): string {
  if (state === "active") return "is-run";
  if (state === "reserved") return "is-warn";
  return "is-warn";
}

function stateLabel(state: string): string {
  if (state === "active") return "执行中";
  if (state === "reserved") return "已预取";
  return "排队中";
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

// 队列任务监控页
export function QueuesPage() {
  /*
   * data 最新快照
   * loading 首次加载
   * refreshing 手动/定时刷新
   * tab 当前任务列表视图
   */
  const [data, setData] = useState<AdminQueuesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"pending" | "active" | "reserved">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [boundsMin, setBoundsMin] = useState("1");
  const [boundsMax, setBoundsMax] = useState("3");

  const control = data?.worker_control;

  useEffect(() => {
    if (!control) return;
    setBoundsMin(String(control.bounds_min));
    setBoundsMax(String(control.bounds_max));
  }, [control?.bounds_min, control?.bounds_max]);

  const load = useCallback(async (silent = false, full = false) => {
    if (!silent) setRefreshing(true);
    try {
      const snap = await api<AdminQueuesSnapshot>(
        `/api/admin/queues${full ? FULL_QUERY : LIGHT_QUERY}`,
      );
      setData(snap);
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : "加载队列失败");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false, true);
    const timer = window.setInterval(() => void load(true, false), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const runAction = useCallback(
    async (key: string, path: string, options?: RequestInit) => {
      setActionLoading(key);
      try {
        await api(path, options);
        toast.success("操作已提交");
        await load(true, true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失败");
      } finally {
        setActionLoading(null);
      }
    },
    [load],
  );

  const modeLabel = (mode: string | undefined) => {
    if (mode === "systemd") return "Systemd 托管";
    if (mode === "autoscale") return "Autoscale 动态进程";
    return "Celery";
  };

  const tasks = useMemo(() => {
    if (!data) return [] as AdminQueueTask[];
    if (tab === "active") return data.active_tasks;
    if (tab === "reserved") return data.reserved_tasks;
    return data.pending_tasks;
  }, [data, tab]);

  const maxPending = useMemo(() => {
    if (!data?.queues.length) return 1;
    return Math.max(1, ...data.queues.map((q) => q.pending));
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#303133]">队列任务</h2>
          <p className="mt-1 text-sm text-[#909399]">
            Celery 各队列排队与 Worker 执行状态 · 轻量刷新 {REFRESH_MS / 1000}s · 手动刷新拉全量明细
          </p>
        </div>
        <button
          type="button"
          className="admin-quick-btn !inline-flex !w-auto items-center gap-2 px-4"
          onClick={() => void load(false, true)}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
      </div>

      {loading && !data ? (
        <div className="admin-panel flex items-center justify-center py-16 text-[#909399]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="admin-panel admin-stat-card">
              <div className="admin-stat-icon">
                <Layers className="h-5 w-5" />
              </div>
              <div className="text-sm text-[#909399]">排队总数</div>
              <div className="mt-2 text-3xl font-semibold">{data?.total_pending ?? 0}</div>
              <div className="mt-1 text-xs text-[#c0c4cc]">unacked {data?.unacked ?? 0}</div>
            </div>
            <div className="admin-panel admin-stat-card">
              <div className="admin-stat-icon">
                <Activity className="h-5 w-5" />
              </div>
              <div className="text-sm text-[#909399]">执行中</div>
              <div className="mt-2 text-3xl font-semibold">{data?.active_count ?? 0}</div>
              <div className="mt-1 text-xs text-[#c0c4cc]">预取 {data?.reserved_count ?? 0}</div>
            </div>
            <div className="admin-panel admin-stat-card">
              <div className="admin-stat-icon">
                <Server className="h-5 w-5" />
              </div>
              <div className="text-sm text-[#909399]">Worker 在线</div>
              <div className="mt-2 text-3xl font-semibold">{data?.workers_online ?? 0}</div>
              <div className="mt-1 text-xs text-[#c0c4cc]">
                Redis {data?.redis_ok ? "正常" : "异常"} · Celery {data?.use_celery ? "开" : "关"}
              </div>
            </div>
            <div className="admin-panel admin-stat-card">
              <div className="admin-stat-icon">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="text-sm text-[#909399]">监听队列</div>
              <div className="mt-2 text-sm font-medium leading-snug">{data?.worker_queues ?? "—"}</div>
              <div className="mt-1 text-xs text-[#c0c4cc]">
                更新 {data?.fetched_at ? new Date(data.fetched_at).toLocaleTimeString() : "—"}
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="mb-4 text-sm font-medium text-[#303133]">各队列积压</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(data?.queues ?? []).map((q) => (
                <div key={q.name} className="rounded-xl border border-[#ebeef5] bg-[#fafbfc] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-[#303133]">{q.label}</div>
                      <div className="mt-0.5 font-mono text-xs text-[#909399]">{q.name}</div>
                    </div>
                    <span
                      className={cn(
                        "admin-status-pill",
                        q.pending > 20 ? "is-fail" : q.pending > 0 ? "is-warn" : "is-done",
                      )}
                    >
                      {q.pending}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ebeef5]">
                    <div
                      className="h-full rounded-full bg-[#67c23a] transition-all"
                      style={{ width: `${Math.min(100, (q.pending / maxPending) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {control ? (
            <div className="admin-panel">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[#303133]">Worker 动态管理</div>
                  <p className="mt-1 text-xs text-[#909399]">
                    模式：{modeLabel(control.mode)}
                    {control.systemd_active ? " · systemd 运行中" : ""}
                    {control.autoscale_running ? ` · autoscale pid ${control.autoscale_pid}` : ""}
                  </p>
                </div>
                <span className="admin-status-pill is-run">
                  进程 {control.total_processes}
                  {control.max_concurrency != null ? ` / 并发上限 ${control.max_concurrency}` : ""}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-quick-btn !inline-flex !w-auto items-center gap-1.5 px-3 py-2 text-sm"
                  disabled={!control.can_pool_grow || actionLoading !== null}
                  onClick={() => void runAction("grow", "/api/admin/workers/pool-grow?n=1", { method: "POST" })}
                >
                  {actionLoading === "grow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Pool +1
                </button>
                <button
                  type="button"
                  className="admin-quick-btn !inline-flex !w-auto items-center gap-1.5 px-3 py-2 text-sm"
                  disabled={!control.can_pool_shrink || actionLoading !== null}
                  onClick={() => void runAction("shrink", "/api/admin/workers/pool-shrink?n=1", { method: "POST" })}
                >
                  {actionLoading === "shrink" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}
                  Pool -1
                </button>
                <button
                  type="button"
                  className="admin-quick-btn !inline-flex !w-auto items-center gap-1.5 px-3 py-2 text-sm"
                  disabled={!control.can_restart || actionLoading !== null}
                  onClick={() => {
                    if (!window.confirm("确定重启 Celery Worker？执行中的任务会中断后由 Redis 重新投递。")) return;
                    void runAction("restart", "/api/admin/workers/restart", { method: "POST" });
                  }}
                >
                  {actionLoading === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  重启 Worker
                </button>
              </div>
              <p className="mt-2 text-xs text-[#909399]">
                Pool 扩缩仅对 prefork 进程池有效（线上 systemd worker）；上限 {control.pool_max_limit}。solo 池请用下方 Autoscale。
              </p>

              <div className="mt-5 rounded-xl border border-[#ebeef5] bg-[#fafbfc] p-4">
                <div className="mb-3 text-sm font-medium text-[#303133]">Autoscale 自动扩缩（开发 / 备选）</div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-[#606266]">
                    最小进程
                    <input
                      className="mt-1 block w-20 rounded-lg border border-[#dcdfe6] px-2 py-1.5 text-sm"
                      value={boundsMin}
                      onChange={(e) => setBoundsMin(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-[#606266]">
                    最大进程
                    <input
                      className="mt-1 block w-20 rounded-lg border border-[#dcdfe6] px-2 py-1.5 text-sm"
                      value={boundsMax}
                      onChange={(e) => setBoundsMax(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-[#dcdfe6] bg-white px-3 py-2 text-xs hover:border-[#67c23a]"
                    disabled={actionLoading !== null}
                    onClick={() =>
                      void runAction("bounds", "/api/admin/workers/autoscale", {
                        method: "PATCH",
                        body: JSON.stringify({
                          min_workers: Number(boundsMin),
                          max_workers: Number(boundsMax),
                        }),
                      })
                    }
                  >
                    保存边界
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#67c23a] bg-[#f0f9eb] px-3 py-2 text-xs text-[#67c23a]"
                    disabled={actionLoading !== null || control.autoscale_running}
                    onClick={() => void runAction("autostart", "/api/admin/workers/autoscale/start", { method: "POST" })}
                  >
                    启动 Autoscale
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#f56c6c] bg-[#fef0f0] px-3 py-2 text-xs text-[#f56c6c]"
                    disabled={actionLoading !== null || !control.autoscale_running}
                    onClick={() => void runAction("autostop", "/api/admin/workers/autoscale/stop", { method: "POST" })}
                  >
                    停止 Autoscale
                  </button>
                </div>
                <p className="mt-2 text-xs text-[#909399]">
                  配置来源：{control.bounds_source === "redis" ? "Redis 覆盖" : "环境变量"} ·
                  当前 autoscale 子进程 {control.autoscale_workers} 个
                </p>
              </div>
            </div>
          ) : null}

          {data?.workers && data.workers.length > 0 ? (
            <div className="admin-panel">
              <div className="mb-3 text-sm font-medium text-[#303133]">Worker 进程</div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>状态</th>
                      <th>执行中</th>
                      <th>Pool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workers.map((w) => (
                      <tr key={w.name}>
                        <td className="font-mono text-xs">{w.name}</td>
                        <td>
                          <span className="admin-status-pill is-done">{w.status}</span>
                        </td>
                        <td>{w.active_count}</td>
                        <td className="text-xs text-[#909399]">{w.pool || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="admin-panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-[#303133]">任务明细</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["pending", `排队中 (${data?.pending_tasks.length ?? 0})`],
                    ["active", `执行中 (${data?.active_count ?? 0})`],
                    ["reserved", `已预取 (${data?.reserved_count ?? 0})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                      tab === key
                        ? "border-[#67c23a] bg-[#f0f9eb] text-[#67c23a]"
                        : "border-[#ebeef5] bg-white text-[#606266] hover:border-[#dcdfe6]",
                    )}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>队列</th>
                    <th>任务</th>
                    <th>参数 / ID</th>
                    <th>状态</th>
                    <th>Worker</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="!text-center text-[#909399]">
                        暂无{stateLabel(tab === "pending" ? "pending" : tab)}任务
                      </td>
                    </tr>
                  ) : (
                    tasks.map((t) => (
                      <tr key={`${t.state}-${t.task_id || t.args_repr}-${t.position ?? ""}`}>
                        <td>
                          <div className="text-sm">{t.queue}</div>
                          {tab === "pending" && t.position ? (
                            <div className="text-xs text-[#c0c4cc]">#{t.position}</div>
                          ) : null}
                        </td>
                        <td>
                          <div className="text-sm">{t.label}</div>
                          <div className="font-mono text-[11px] text-[#c0c4cc]">{t.task_name}</div>
                        </td>
                        <td className="max-w-[240px] truncate font-mono text-xs" title={t.args_repr}>
                          {t.args_repr || t.ref_id || "—"}
                        </td>
                        <td>
                          <span className={`admin-status-pill ${stateClass(t.state)}`}>
                            {stateLabel(t.state)}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-[#909399]">{t.worker || "—"}</td>
                        <td className="text-xs text-[#909399]">{formatTime(t.started_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {tab === "pending" && (data?.total_pending ?? 0) > (data?.pending_tasks.length ?? 0) ? (
              <p className="mt-3 text-xs text-[#909399]">
                仅展示各队列前 30 条排队任务，其余 {(data?.total_pending ?? 0) - (data?.pending_tasks.length ?? 0)} 条未列出。
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
