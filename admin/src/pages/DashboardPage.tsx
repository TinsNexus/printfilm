import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Banknote,
  Clapperboard,
  Film,
  Layers,
  Receipt,
  Settings,
  Shapes,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/StatCard";
import { PageSection } from "@/components/admin/PageSection";
import { PageHeader } from "@/components/ui/page";
import { api, type AdminOrder, type AdminStats, type PageMeta } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { orderStatusLabel, payTypeLabel, projectStatusLabel, taskDomainLabel } from "@/lib/statusLabels";

type OrderRes = { items: AdminOrder[]; meta: PageMeta };

const CAPABILITY_LABELS: Record<string, string> = {
  llm: "LLM 文本",
  image: "生图",
  video: "视频",
  tts: "配音",
  unknown: "其他",
};

// Map project status to pill style
function statusClass(status: string): string {
  if (status === "DONE") return "is-done";
  if (status === "FAILED" || status === "REJECTED" || status === "CANCELLED") return "is-fail";
  if (status === "SCRIPTING" || status === "IMAGING" || status === "VIDEOING" || status === "COMPOSING") {
    return "is-run";
  }
  return "is-warn";
}

function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}

// Dashboard overview with usage / cost / rankings
export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  useEffect(() => {
    Promise.all([
      api<AdminStats>("/api/admin/stats"),
      api<OrderRes>("/api/admin/orders?page=1&page_size=8"),
    ])
      .then(([s, o]) => {
        setStats(s);
        setOrders(o.items);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "加载失败"));
  }, []);

  const statusEntries = Object.entries(stats?.project_status_counts ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const daily = stats?.daily_usage ?? [];
  const byCapability = stats?.usage_by_capability ?? [];
  const byDomain = stats?.usage_by_domain ?? [];
  const topUsers = stats?.top_users_by_charge ?? [];

  return (
    <div className="admin-page">
      <PageHeader description="用户、充值、AI 调用与费用概览" />

      <div className="admin-dashboard-top">
        <StatCard label="用户总数" value={stats?.user_count ?? "—"} hint="总注册用户" icon={Users} />
        <StatCard
          label="累计已付"
          value={stats ? `¥${fenToYuan(stats.order_paid_total_fen)}` : "—"}
          hint="历史充值"
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="今日已付"
          value={stats ? `¥${fenToYuan(stats.order_paid_today_fen)}` : "—"}
          hint="今日充值"
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="本月 AI 扣费"
          value={stats ? `¥${fenToYuan(stats.usage_charge_month_fen ?? 0)}` : "—"}
          hint={`今日 ¥${fenToYuan(stats?.usage_charge_today_fen ?? 0)}`}
          icon={Zap}
          tone="warn"
        />
        <StatCard
          label="本月上游成本"
          value={stats ? `¥${fenToYuan(stats.usage_cost_month_fen ?? 0)}` : "—"}
          hint={`今日 ¥${fenToYuan(stats?.usage_cost_today_fen ?? 0)} · 累计 ¥${fenToYuan(stats?.usage_cost_total_fen ?? 0)}`}
          icon={Banknote}
          tone="info"
        />
        <StatCard
          label="今日调用"
          value={stats?.usage_calls_today ?? "—"}
          hint={`本月 ${stats?.usage_calls_month ?? 0} · 累计 ${stats?.usage_calls_total ?? 0}`}
          icon={Activity}
          tone="info"
        />
        <div className="admin-panel admin-stat-card tone-success">
          <div className="admin-stat-label">科普项目状态</div>
          <div className="mt-1 text-xs text-[var(--admin-muted)]">
            漫剧项目 {stats?.drama_project_count ?? 0} 部
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {statusEntries.length === 0 ? (
              <span className="text-xs text-[var(--admin-muted)]">暂无数据</span>
            ) : (
              statusEntries.map(([status, count]) => (
                <span key={status} className={`admin-status-pill !px-2 !py-1 !text-[11px] ${statusClass(status)}`}>
                  {projectStatusLabel(status)} {count}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="admin-dashboard-body">
        <PageSection title="近 7 日调用与扣费" bodyClassName="!pt-0" className="min-h-0">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>调用次数</th>
                  <th>扣费</th>
                </tr>
              </thead>
              <tbody>
                {daily.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="!text-center text-[var(--admin-muted)]">
                      暂无用量
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr key={d.date}>
                      <td className="font-mono text-xs">{d.date}</td>
                      <td>{d.calls}</td>
                      <td>¥{fenToYuan(d.charge_fen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageSection>

        <PageSection title="能力 / 领域分布（本月）" bodyClassName="!pt-0">
          <div className="mb-3 text-xs font-medium text-[var(--admin-muted)]">按能力</div>
          <div className="admin-table-wrap mb-4">
            <table>
              <thead>
                <tr>
                  <th>能力</th>
                  <th>调用</th>
                  <th>扣费</th>
                </tr>
              </thead>
              <tbody>
                {byCapability.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="!text-center text-[var(--admin-muted)]">
                      暂无
                    </td>
                  </tr>
                ) : (
                  byCapability.map((b) => (
                    <tr key={b.key}>
                      <td>{capabilityLabel(b.key)}</td>
                      <td>{b.calls}</td>
                      <td>¥{fenToYuan(b.charge_fen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mb-2 text-xs font-medium text-[var(--admin-muted)]">按领域</div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>领域</th>
                  <th>调用</th>
                  <th>扣费</th>
                </tr>
              </thead>
              <tbody>
                {byDomain.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="!text-center text-[var(--admin-muted)]">
                      暂无
                    </td>
                  </tr>
                ) : (
                  byDomain.map((b) => (
                    <tr key={b.key}>
                      <td>{taskDomainLabel(b.key)}</td>
                      <td>{b.calls}</td>
                      <td>¥{fenToYuan(b.charge_fen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>

      <div className="admin-dashboard-body mt-4">
        <PageSection
          title="用户消费排行（近 30 日）"
          actions={
            <Link to="/orders?tab=usage" className="admin-link">
              用量明细 →
            </Link>
          }
          bodyClassName="!pt-0"
          className="min-h-0"
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>用户</th>
                  <th>调用</th>
                  <th>扣费</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                      暂无排行
                    </td>
                  </tr>
                ) : (
                  topUsers.map((u, idx) => (
                    <tr key={u.user_id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div className="text-sm">{u.email ?? u.user_id}</div>
                        <div className="font-mono text-[11px] text-[var(--admin-muted)]">ID {u.user_id}</div>
                      </td>
                      <td>{u.calls}</td>
                      <td>¥{fenToYuan(u.charge_fen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageSection>

        <PageSection
          title="最近订单"
          actions={
            <Link to="/orders" className="admin-link">
              全部 →
            </Link>
          }
          bodyClassName="!pt-0"
          className="min-h-0"
        >
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>单号</th>
                  <th>用户</th>
                  <th>金额</th>
                  <th>支付</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="!text-center text-[var(--admin-muted)]">
                      暂无订单
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-mono text-xs">{o.out_trade_no}</td>
                      <td>{o.user_email ?? o.user_id}</td>
                      <td>¥{fenToYuan(o.amount_fen)}</td>
                      <td>{payTypeLabel(o.pay_type)}</td>
                      <td>
                        <span
                          className={`admin-status-pill ${o.status === "paid" ? "is-done" : o.status === "pending" ? "is-warn" : "is-fail"}`}
                        >
                          {orderStatusLabel(o.status)}
                        </span>
                      </td>
                      <td className="text-xs text-[var(--admin-muted)]">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>

      <div className="mt-4">
        <PageSection title="快捷入口" bodyClassName="!pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Link to="/templates" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Shapes className="h-4 w-4" />
              模板
            </Link>
            <Link to="/orders?tab=usage" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Receipt className="h-4 w-4" />
              订单/用量
            </Link>
            <Link to="/users" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Users className="h-4 w-4" />
              用户
            </Link>
            <Link to="/projects" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Clapperboard className="h-4 w-4" />
              科普
            </Link>
            <Link to="/drama-projects" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Film className="h-4 w-4" />
              漫剧
            </Link>
            <Link to="/queues" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Layers className="h-4 w-4" />
              任务
            </Link>
            <Link to="/settings" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Settings className="h-4 w-4" />
              配置
            </Link>
          </div>
        </PageSection>
      </div>
    </div>
  );
}
