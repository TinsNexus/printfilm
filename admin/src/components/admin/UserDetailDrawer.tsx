import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type AdminLedger,
  type AdminOrder,
  type AdminUsageEvent,
  type AdminUserRow,
  type PageMeta,
} from "@/api/client";
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
import { ledgerKindLabel, orderStatusLabel } from "@/lib/statusLabels";
import { formatDateTime, useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

type ListRes<T> = { items: T[]; meta: PageMeta };

type UserDetailDrawerProps = {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUser?: AdminUserRow | null;
};

/** 用户只读明细：基本信息 + 订单/流水/用量聚合 */
export function UserDetailDrawer({ userId, open, onOpenChange, initialUser }: UserDetailDrawerProps) {
  const { t: tx } = useI18n();
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
          api<ListRes<AdminOrder>>(`/api/admin/orders?page=1&page_size=8&user_id=${userId}`),
          api<ListRes<AdminLedger>>(`/api/admin/ledger?page=1&page_size=8&user_id=${userId}`),
          api<ListRes<AdminUsageEvent>>(`/api/admin/usage-events?page=1&page_size=20&user_id=${userId}`),
        ]);
        setUser(userRes.items[0] ?? initialUser ?? null);
        setOrders(orderRes.items);
        setLedger(ledgerRes.items);
        setUsage(usageRes.items);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tr("userDrawer.couldLoadUserDetails"));
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
      title={tx("userDrawer.userDetails")}
      subtitle={
        user
          ? tx("userDrawer.subtitle", { email: user.email, id: formatAccountId(user.id) })
          : loading
            ? tx("userDrawer.loading")
            : "—"
      }
      bodyClassName="!pt-2"
    >
      {user ? (
        <Tabs defaultValue="info" className="admin-detail-tabs">
          <TabsList>
            <TabsTrigger value="info">{tx("userDrawer.basicInfo")}</TabsTrigger>
            <TabsTrigger value="orders">{tx("userDrawer.recentOrders")}</TabsTrigger>
            <TabsTrigger value="ledger">{tx("userDrawer.walletLedger")}</TabsTrigger>
            <TabsTrigger value="usage">{tx("userDrawer.usageSummary")}</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <AdminDetailSection>
              <AdminDetailMeta
                items={[
                  { label: tx("userDrawer.nickname"), value: user.nickname || "—" },
                  { label: tx("userDrawer.phone"), value: user.phone || "—" },
                  { label: tx("userDrawer.role"), value: user.role },
                  { label: tx("userDrawer.balance"), value: `¥${fenToYuan(user.balance_fen)}` },
                  { label: tx("userDrawer.hold"), value: `¥${fenToYuan(user.frozen_fen)}` },
                  {
                    label: tx("userDrawer.registered"),
                    value: user.created_at ? formatDateTime(user.created_at) : "—",
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
                    <th>{tx("userDrawer.order")}</th>
                    <th>{tx("userDrawer.amount")}</th>
                    <th>{tx("userDrawer.status")}</th>
                    <th>{tx("userDrawer.time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        {tx("userDrawer.orders")}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-mono text-xs">{o.out_trade_no}</td>
                        <td>¥{fenToYuan(o.amount_fen)}</td>
                        <td>{orderStatusLabel(o.status)}</td>
                        <td className="text-xs">{formatDateTime(o.created_at)}</td>
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
                    <th>{tx("userDrawer.type")}</th>
                    <th>{tx("userDrawer.change")}</th>
                    <th>{tx("userDrawer.balance2")}</th>
                    <th>{tx("userDrawer.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!text-center text-[var(--admin-muted)]">
                        {tx("userDrawer.ledgerEntries")}
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
                    <th>{tx("userDrawer.time")}</th>
                    <th>{tx("userDrawer.capability")}</th>
                    <th>{tx("userDrawer.charged")}</th>
                    <th>{tx("userDrawer.cost")}</th>
                    <th>{tx("userDrawer.task")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="!text-center text-[var(--admin-muted)]">
                        {tx("userDrawer.usage")}
                      </td>
                    </tr>
                  ) : (
                    usage.map((row) => (
                      <tr key={row.id}>
                        <td className="text-xs">
                          {row.created_at ? formatDateTime(row.created_at) : "—"}
                        </td>
                        <td>{row.capability || "—"}</td>
                        <td>¥{fenToYuan(row.charge_fen ?? 0)}</td>
                        <td>¥{fenToYuan(row.cost_fen ?? 0)}</td>
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
        <div className="py-10 text-center text-sm text-[var(--admin-muted)]">{tx("userDrawer.loading")}</div>
      ) : null}
    </AdminModal>
  );
}
