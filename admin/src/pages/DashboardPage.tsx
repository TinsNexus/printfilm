import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Clapperboard,
  Layers,
  Receipt,
  Settings,
  Shapes,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/StatCard";
import { PageSection } from "@/components/admin/PageSection";
import { PageHeader } from "@/components/ui/page";
import { api, type AdminOrder, type AdminStats, type PageMeta } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { orderStatusLabel, payTypeLabel, projectStatusLabel } from "@/lib/statusLabels";

type OrderRes = { items: AdminOrder[]; meta: PageMeta };

// Map project status to pill style
function statusClass(status: string): string {
  if (status === "DONE") return "is-done";
  if (status === "FAILED" || status === "REJECTED" || status === "CANCELLED") return "is-fail";
  if (status === "SCRIPTING" || status === "IMAGING" || status === "VIDEOING" || status === "COMPOSING") {
    return "is-run";
  }
  return "is-warn";
}

// Dashboard overview
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

  return (
    <div className="admin-page">
      <PageHeader description="用户、订单与项目状态概览" />

      <div className="admin-dashboard-top">
        <StatCard label="用户总数" value={stats?.user_count ?? "—"} hint="总注册用户" icon={Users} />
        <StatCard
          label="累计已付"
          value={stats ? `¥${fenToYuan(stats.order_paid_total_fen)}` : "—"}
          hint="历史累计"
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="今日已付"
          value={stats ? `¥${fenToYuan(stats.order_paid_today_fen)}` : "—"}
          hint="今日付款"
          icon={Wallet}
          tone="info"
        />
        <div className="admin-panel admin-stat-card tone-success">
          <div className="admin-stat-label">项目状态</div>
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

        <PageSection title="快捷入口" bodyClassName="!pt-0">
          <div className="grid grid-cols-2 gap-2">
            <Link to="/templates" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Shapes className="h-4 w-4" />
              模板
            </Link>
            <Link to="/orders" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Receipt className="h-4 w-4" />
              订单
            </Link>
            <Link to="/users" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Users className="h-4 w-4" />
              用户
            </Link>
            <Link to="/projects" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Clapperboard className="h-4 w-4" />
              项目
            </Link>
            <Link to="/settings" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Settings className="h-4 w-4" />
              配置
            </Link>
            <Link to="/queues" className="admin-quick-btn !flex-row !items-center !py-2.5">
              <Layers className="h-4 w-4" />
              任务
            </Link>
          </div>
          <div className="admin-notice">
            <div className="admin-notice-title">
              <span>系统公告</span>
            </div>
            <p className="admin-notice-body !text-xs">
              管理用户额度、审核作品与模板，并在任务中心监控统一任务平台。
            </p>
          </div>
        </PageSection>
      </div>
    </div>
  );
}
