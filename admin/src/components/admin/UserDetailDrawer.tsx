import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type AdminLedger,
  type AdminOrder,
  type AdminUsageEvent,
  type AdminUserRow,
  type PageResult,
} from "@/api/client";
import { listAdminLedger, listAdminOrders, listAdminUsageEvents } from "@/api/finance";
import {
  AdminDetailMeta,
  AdminDetailSection,
  AdminDetailTableWrap,
} from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminModal } from "@/components/admin/AdminModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAccountId } from "@/lib/admin-account";
import { fenToYuan } from "@/lib/utils";
import { orderPaymentLabel } from "@/lib/orderPayment";
import { ledgerKindLabel, orderStatusLabel } from "@/lib/statusLabels";

type ListRes<T> = PageResult<T>;

type UserDetailDrawerProps = {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUser?: AdminUserRow | null;
};

/** 用户只读明细：基本信息 + 订单/流水/用量聚合 */
export function UserDetailDrawer({ userId, open, onOpenChange, initialUser }: UserDetailDrawerProps) {
  const [user, setUser] = useState<AdminUserRow | null>(initialUser ?? null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ledger, setLedger] = useState<AdminLedger[]>([]);
  const [usage, setUsage] = useState<AdminUsageEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    void (async () => {
      try {
        const [userRes, orderRes, ledgerRes, usageRes] = await Promise.all([
          initialUser?.id === userId
            ? Promise.resolve({ items: [initialUser], meta: { page: 1, page_size: 1, total: 1 } })
            : api<ListRes<AdminUserRow>>(`/api/admin/users?page=1&page_size=1&q=${userId}`),
          listAdminOrders(1, { pageSize: 8, userId }),
          listAdminLedger(1, { pageSize: 8, userId }),
          listAdminUsageEvents(1, { pageSize: 20, userId }),
        ]);
        setUser(userRes.items[0] ?? initialUser ?? null);
        setOrders(orderRes.items);
        setLedger(ledgerRes.items);
        setUsage(usageRes.items);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Tải chi tiết người dùng thất bại");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId, initialUser]);

  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Chi tiết người dùng"
      subtitle={
        user
          ? `${user.email} · ID：${formatAccountId(user.id)}`
          : loading
            ? "Đang tải…"
            : "—"
      }
      bodyClassName="!pt-2"
    >
      {user ? (
        <Tabs defaultValue="info" className="admin-detail-tabs">
          <TabsList>
            <TabsTrigger value="info">Thông tin cơ bản</TabsTrigger>
            <TabsTrigger value="orders">Đơn hàng gần đây</TabsTrigger>
            <TabsTrigger value="ledger">Biến động ví</TabsTrigger>
            <TabsTrigger value="usage">Tóm tắt mức dùng</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <AdminDetailSection>
              <AdminDetailMeta
                items={[
                  { label: "Biệt danh", value: user.nickname || "—" },
                  { label: "Điện thoại", value: user.phone || "—" },
                  { label: "Vai trò", value: user.role },
                  { label: "Số dư", value: `¥${fenToYuan(user.balance_fen)}` },
                  { label: "Đóng băng", value: `¥${fenToYuan(user.frozen_fen)}` },
                  {
                    label: "Thời gian đăng ký",
                    value: user.created_at ? new Date(user.created_at).toLocaleString() : "—",
                    full: true,
                  },
                ]}
              />
            </AdminDetailSection>
          </TabsContent>
          <TabsContent value="orders">
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        Chưa có đơn hàng
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-mono text-xs">{o.out_trade_no}</td>
                        <td>{orderPaymentLabel(o)}</td>
                        <td>{orderStatusLabel(o.status)}</td>
                        <td className="text-xs">{new Date(o.created_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </TabsContent>
          <TabsContent value="ledger">
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Biến động</th>
                    <th>Số dư sau</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        Chưa có biến động
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row) => (
                      <tr key={row.id}>
                        <td>{ledgerKindLabel(row.kind)}</td>
                        <td>¥{fenToYuan(row.delta_fen)}</td>
                        <td>¥{fenToYuan(row.balance_after)}</td>
                        <td className="max-w-[200px] truncate text-xs">{row.note || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </TabsContent>
          <TabsContent value="usage">
            <AdminDetailTableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Năng lực</th>
                    <th>Trừ phí</th>
                    <th>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        Chưa có mức dùng
                      </td>
                    </tr>
                  ) : (
                    usage.map((row) => (
                      <tr key={row.id}>
                        <td className="text-xs">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                        </td>
                        <td>{row.capability || "—"}</td>
                        <td>¥{fenToYuan(row.charge_fen ?? 0)}</td>
                        <td>
                          {row.task_run_id ? (
                            <AdminEntityLink kind="task" id={row.task_run_id} />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </AdminDetailTableWrap>
          </TabsContent>
        </Tabs>
      ) : loading ? (
        <div className="py-10 text-center text-sm text-[var(--admin-muted)]">Đang tải…</div>
      ) : null}
    </AdminModal>
  );
}
