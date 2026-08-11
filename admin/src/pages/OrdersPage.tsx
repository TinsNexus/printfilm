import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminLedger, type AdminOrder, type PageMeta } from "@/api/client";
import { PaginationBar } from "@/components/PaginationBar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fenToYuan } from "@/lib/utils";
import { ledgerKindLabel, orderStatusLabel, payTypeLabel } from "@/lib/statusLabels";

type OrderRes = { items: AdminOrder[]; meta: PageMeta };
type LedgerRes = { items: AdminLedger[]; meta: PageMeta };

// Orders and wallet ledger tabs
export function OrdersPage() {
  /*
   * tab active tab
   * orderStatus order filter
   * orderUserId user id filter for orders
   * ledgerKind ledger kind filter
   * ledgerUserId user id filter for ledger
   * orderPage orders page
   * ledgerPage ledger page
   * orders order list
   * ledger ledger list
   */
  const [tab, setTab] = useState("orders");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderUserId, setOrderUserId] = useState("");
  const [ledgerKind, setLedgerKind] = useState("");
  const [ledgerUserId, setLedgerUserId] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [orders, setOrders] = useState<OrderRes | null>(null);
  const [ledger, setLedger] = useState<LedgerRes | null>(null);

  // Load recharge orders
  async function loadOrders(page = orderPage) {
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(DEFAULT_PAGE_SIZE) });
      if (orderStatus) params.set("status", orderStatus);
      if (orderUserId.trim()) params.set("user_id", orderUserId.trim());
      setOrders(await api<OrderRes>(`/api/admin/orders?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载订单失败");
    }
  }

  // Load wallet ledger
  async function loadLedger(page = ledgerPage) {
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(DEFAULT_PAGE_SIZE) });
      if (ledgerKind) params.set("kind", ledgerKind);
      if (ledgerUserId.trim()) params.set("user_id", ledgerUserId.trim());
      setLedger(await api<LedgerRes>(`/api/admin/ledger?${params}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载流水失败");
    }
  }

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPage]);

  useEffect(() => {
    void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerPage]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#303133]">订单与流水</h2>
        <p className="mt-1 text-sm text-[#909399]">查看充值单与钱包流水</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">充值订单</TabsTrigger>
          <TabsTrigger value="ledger">钱包流水</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-40"
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="closed">已关闭</option>
            </Select>
            <Input
              className="w-40"
              placeholder="用户 ID"
              value={orderUserId}
              onChange={(e) => setOrderUserId(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setOrderPage(1);
                void loadOrders(1);
              }}
            >
              筛选
            </Button>
          </div>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>单号</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>入账</TableHead>
                  <TableHead>支付</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orders?.items ?? []).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.out_trade_no}</TableCell>
                    <TableCell>
                      <div className="text-sm">{o.user_email ?? o.user_id}</div>
                    </TableCell>
                    <TableCell>{o.sku_id}</TableCell>
                    <TableCell>¥{fenToYuan(o.amount_fen)}</TableCell>
                    <TableCell>¥{fenToYuan(o.credit_fen)}</TableCell>
                    <TableCell>{payTypeLabel(o.pay_type)}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "paid" ? "success" : "secondary"}>
                        {orderStatusLabel(o.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {orders && (
            <PaginationBar
              page={orders.meta.page}
              pageSize={orders.meta.page_size}
              total={orders.meta.total}
              onPageChange={setOrderPage}
            />
          )}
        </TabsContent>
        <TabsContent value="ledger" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select className="w-40" value={ledgerKind} onChange={(e) => setLedgerKind(e.target.value)}>
              <option value="">全部类型</option>
              <option value="topup">充值</option>
              <option value="grant">赠送</option>
              <option value="adjust">调账</option>
              <option value="freeze">冻结</option>
              <option value="unfreeze">解冻</option>
              <option value="settle">结算</option>
              <option value="refund">退款</option>
            </Select>
            <Input
              className="w-40"
              placeholder="用户 ID"
              value={ledgerUserId}
              onChange={(e) => setLedgerUserId(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setLedgerPage(1);
                void loadLedger(1);
              }}
            >
              筛选
            </Button>
          </div>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>变动</TableHead>
                  <TableHead>余额后</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledger?.items ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.id}</TableCell>
                    <TableCell>{e.user_email ?? e.user_id}</TableCell>
                    <TableCell className={e.delta_fen >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {e.delta_fen >= 0 ? "+" : ""}
                      ¥{fenToYuan(e.delta_fen)}
                    </TableCell>
                    <TableCell>¥{fenToYuan(e.balance_after)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ledgerKindLabel(e.kind)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{e.note}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {ledger && (
            <PaginationBar
              page={ledger.meta.page}
              pageSize={ledger.meta.page_size}
              total={ledger.meta.total}
              onPageChange={setLedgerPage}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
