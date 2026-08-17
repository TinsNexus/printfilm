import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Clapperboard,
  Layers,
  Receipt,
  Shapes,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
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

// Dashboard matching reference ops console
export function DashboardPage() {
  /*
   * stats aggregate stats
   * orders recent orders
   */
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  useEffect(() => {
    Promise.all([
      api<AdminStats>("/api/admin/stats"),
      api<OrderRes>("/api/admin/orders?page=1&page_size=5"),
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#303133]">仪表盘</h2>
          <p className="mt-1 text-sm text-[#909399]">用户、订单与项目状态概览</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="admin-panel admin-stat-card">
          <div className="admin-stat-icon">
            <Users className="h-5 w-5" />
          </div>
          <div className="text-sm text-[#909399]">用户总数</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{stats?.user_count ?? "—"}</div>
          <div className="mt-1 text-xs text-[#c0c4cc]">总注册用户</div>
        </div>
        <div className="admin-panel admin-stat-card">
          <div className="admin-stat-icon">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="text-sm text-[#909399]">累计已付金额</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            ¥{stats ? fenToYuan(stats.order_paid_total_fen) : "—"}
          </div>
          <div className="mt-1 text-xs text-[#c0c4cc]">历史累计付款</div>
        </div>
        <div className="admin-panel admin-stat-card">
          <div className="admin-stat-icon">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="text-sm text-[#909399]">今日已付金额</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            ¥{stats ? fenToYuan(stats.order_paid_today_fen) : "—"}
          </div>
          <div className="mt-1 text-xs text-[#c0c4cc]">今日付款金额</div>
        </div>
      </div>

      <div className="admin-panel">
        <div className="mb-3 text-sm font-medium text-[#303133]">项目状态分布</div>
        <div className="flex flex-wrap gap-2">
          {statusEntries.length === 0 ? (
            <span className="text-sm text-[#909399]">暂无数据</span>
          ) : (
            statusEntries.map(([status, count]) => (
              <span key={status} className={`admin-status-pill ${statusClass(status)}`}>
                <span>{projectStatusLabel(status)}</span>
                <strong className="font-semibold">{count}</strong>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="admin-panel xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">最近订单</div>
            <Link to="/orders" className="text-xs text-[#67c23a] hover:underline">
              查看全部订单 →
            </Link>
          </div>
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
                    <td colSpan={6} className="!text-center text-[#909399]">
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
                      <td className="text-xs text-[#909399]">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel xl:col-span-2">
          <div className="mb-3 text-sm font-medium">快捷操作</div>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/templates" className="admin-quick-btn">
              <Shapes className="h-4 w-4 text-[#67c23a]" />
              模板管理
            </Link>
            <Link to="/orders" className="admin-quick-btn">
              <Receipt className="h-4 w-4 text-[#67c23a]" />
              充值记录
            </Link>
            <Link to="/users" className="admin-quick-btn">
              <Users className="h-4 w-4 text-[#67c23a]" />
              用户列表
            </Link>
            <Link to="/projects" className="admin-quick-btn">
              <Clapperboard className="h-4 w-4 text-[#67c23a]" />
              项目管理
            </Link>
            <Link to="/queues" className="admin-quick-btn">
              <Layers className="h-4 w-4 text-[#67c23a]" />
              队列任务
            </Link>
          </div>
          <div className="mt-5 rounded-xl border border-[#ebeef5] bg-[#fafbfc] p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">系统公告</span>
              <span className="text-xs text-[#c0c4cc]">今天</span>
            </div>
            <p className="text-sm leading-relaxed text-[#606266]">
              欢迎使用 PRINTFILM 管理后台。可在此管理用户额度、审核作品与模板上下架。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
