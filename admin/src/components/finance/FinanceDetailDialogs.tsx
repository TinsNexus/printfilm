import { points } from "@/lib/points";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { AdminLedger, AdminOrder } from "@/api/client";
import { AdminDetailMeta, AdminDetailSection } from "@/components/admin/AdminDetailLayout";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/ui/button";

import { orderPaymentLabel } from "@/lib/orderPayment";
import { ledgerKindLabel, orderStatusLabel, payTypeLabel } from "@/lib/statusLabels";
import { tr } from "../../i18n/translate.ts";

/** 钱包关联对象链接：兼容数字订单 ID 与历史商户单号。 */
export function LedgerRefLink({ row }: { row: AdminLedger }) {
  if (row.ref_type === "order" && row.ref_id) {
    const id = Number(row.ref_id);
    if (Number.isFinite(id) && id > 0) {
      return <AdminEntityLink kind="order" id={id} label={tr("teamsUi.orderN", { id })} />;
    }
    return (
      <Link
        to={`/orders?tab=orders&trade=${encodeURIComponent(row.ref_id)}`}
        className="admin-link font-mono text-xs"
      >
        {row.ref_id}
      </Link>
    );
  }
  if (!row.ref_type && !row.ref_id) return "—";
  return (
    <span className="font-mono text-xs">
      {row.ref_type}/{row.ref_id}
    </span>
  );
}

/** 展示充值订单详情，复制单号与关闭行为由弹层管理。 */
export function OrderDetailDialog({
  orderDetail,
  open,
  onClose,
}: { orderDetail: AdminOrder | null; open: boolean; onClose: () => void }) {
  // 将商户单号写入剪贴板，并反馈复制结果。
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tr("teamsUi.copied"));
    } catch {
      toast.error(tr("teamsUi.copyFailed"));
    }
  }

  return (
    <AdminModal
      open={open && !!orderDetail}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      size="md"
      title={orderDetail ? tr("teamsUi.orderDetailN", { id: orderDetail.id }) : tr("teamsUi.orderDetail")}
      subtitle={orderDetail?.out_trade_no}
      footer={
        orderDetail ? (
          <Button size="sm" variant="outline" onClick={() => void copyText(orderDetail.out_trade_no)}>
            {tr("teamsUi.copyOutTradeNo")}
          </Button>
        ) : undefined
      }
    >
      {orderDetail ? (
        <AdminDetailSection>
          <AdminDetailMeta
            items={[
              {
                label: tr("teamsUi.colUser"),
                value: (
                  <AdminEntityLink
                    kind="user"
                    id={orderDetail.user_id}
                    label={orderDetail.user_email ?? undefined}
                  />
                ),
              },
              { label: "SKU", value: orderDetail.sku_id },
              { label: tr("teamsUi.paidAmount"), value: orderPaymentLabel(orderDetail) },
              { label: tr("teamsUi.creditedPoints"), value: points(orderDetail.credit_fen) },
              ...(orderDetail.payment_currency && orderDetail.payment_currency !== "cny" ? [{ label: tr("teamsUi.orderRate"), value: `1 ${orderDetail.payment_currency.toUpperCase()} = ${orderDetail.payment_exchange_rate || "—"} CNY` }] : []),
              { label: tr("teamsUi.payMethod"), value: payTypeLabel(orderDetail.pay_type) },
              { label: tr("teamsUi.status"), value: orderStatusLabel(orderDetail.status) },
              { label: tr("teamsUi.tradeNo"), value: orderDetail.trade_no || "—" },
              {
                label: tr("teamsUi.paidAt"),
                value: orderDetail.paid_at ? new Date(orderDetail.paid_at).toLocaleString() : "—",
              },
              {
                label: tr("teamsUi.createdAtLabel"),
                value: new Date(orderDetail.created_at).toLocaleString(),
                full: true,
              },
            ]}
          />
        </AdminDetailSection>
      ) : null}
    </AdminModal>
  );
}

/** 展示钱包流水详情，复用列表中的关联对象链接。 */
export function LedgerDetailDialog({
  ledgerDetail,
  onClose,
}: { ledgerDetail: AdminLedger | null; onClose: () => void }) {
  return (
    <AdminModal
      open={!!ledgerDetail}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      size="md"
      title={ledgerDetail ? tr("teamsUi.ledgerDetailN", { id: ledgerDetail.id }) : tr("teamsUi.ledgerDetail")}
    >
      {ledgerDetail ? (
        <AdminDetailSection>
          <AdminDetailMeta
            items={[
              {
                label: tr("teamsUi.colUser"),
                value: (
                  <AdminEntityLink
                    kind="user"
                    id={ledgerDetail.user_id}
                    label={ledgerDetail.user_email ?? undefined}
                  />
                ),
              },
              { label: tr("teamsUi.colKind"), value: ledgerKindLabel(ledgerDetail.kind) },
              { label: tr("teamsUi.colChange"), value: points(ledgerDetail.delta_fen) },
              { label: tr("teamsUi.pointsLeft"), value: points(ledgerDetail.balance_after) },
              { label: tr("teamsUi.ref"), value: <LedgerRefLink row={ledgerDetail} /> },
              { label: tr("teamsUi.colNote"), value: ledgerDetail.note || "—" },
              {
                label: tr("teamsUi.colTime"),
                value: new Date(ledgerDetail.created_at).toLocaleString(),
                full: true,
              },
            ]}
          />
        </AdminDetailSection>
      ) : null}
    </AdminModal>
  );
}
