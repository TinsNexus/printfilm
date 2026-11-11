import { points } from "@/lib/points";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { AdminLedger, AdminOrder, AdminUsageEventListRes, PageResult } from "@/api/client";
import { listAdminLedger, listAdminOrders, listAdminUsageEvents } from "@/api/finance";
import { AdminDateRangeFilter } from "@/components/admin/AdminDateRangeFilter";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { LedgerDetailDialog, LedgerRefLink, OrderDetailDialog } from "@/components/finance/FinanceDetailDialogs";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";

import { orderPaymentLabel } from "@/lib/orderPayment";
import { ledgerKindLabel, orderStatusLabel, payTypeLabel, taskDomainLabel } from "@/lib/statusLabels";
import { tr } from "../i18n/translate.ts";

type OrderRes = PageResult<AdminOrder>;
type LedgerRes = PageResult<AdminLedger>;

const ORDER_TABS = new Set(["orders", "ledger", "usage"]);

// 将 URL 中的 Tab 限定为已有的财务列表，兼容无参数入口。
function tabFromSearch(raw: string | null): string {
  return raw && ORDER_TABS.has(raw) ? raw : "orders";
}

// 充值订单、钱包流水与用量明细
export function OrdersPage() {
  // 列表筛选与分页分别保留，切换 Tab 不清空其他列表状态。
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => tabFromSearch(searchParams.get("tab")));
  const [orderStatus, setOrderStatus] = useState("");
  const [orderUserId, setOrderUserId] = useState<number | null>(null);
  const [ledgerKind, setLedgerKind] = useState("");
  const [ledgerUserId, setLedgerUserId] = useState<number | null>(null);
  const [orderPage, setOrderPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
  const [usageUserId, setUsageUserId] = useState<number | null>(null);
  const [usageTaskId, setUsageTaskId] = useState("");
  const [usageDomain, setUsageDomain] = useState("");
  const [usageBillingKey, setUsageBillingKey] = useState("");
  const [usageCapability, setUsageCapability] = useState("");
  const [usageModel, setUsageModel] = useState("");
  const [usageBasis, setUsageBasis] = useState("");
  const [usageDateFrom, setUsageDateFrom] = useState("");
  const [usageDateTo, setUsageDateTo] = useState("");
  const [orders, setOrders] = useState<OrderRes | null>(null);
  const [ledger, setLedger] = useState<LedgerRes | null>(null);
  const [usage, setUsage] = useState<AdminUsageEventListRes | null>(null);
  const [orderDetail, setOrderDetail] = useState<AdminOrder | null>(null);
  const [ledgerDetail, setLedgerDetail] = useState<AdminLedger | null>(null);
  const orderQuery = useAdminDetailQuery("order");

  // 按当前筛选加载充值订单，分页仍由服务端完成。
  async function loadOrders(page = orderPage) {
    try {
      setOrders(await listAdminOrders(page, { status: orderStatus, userId: orderUserId }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("orders.ui.loadOrdersFailed"));
    }
  }

  // 加载钱包流水；与调账页、用户详情共享请求参数映射。
  async function loadLedger(page = ledgerPage) {
    try {
      setLedger(await listAdminLedger(page, { kind: ledgerKind, userId: ledgerUserId }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("orders.ui.loadLedgerFailed"));
    }
  }

  // 支持快捷筛选覆盖尚未提交到 React state 的用量条件。
  async function loadUsage(
    page = usagePage,
    overrides?: { billing_key?: string; capability?: string; model?: string },
  ) {
    try {
      setUsage(await listAdminUsageEvents(page, {
        userId: usageUserId,
        taskRunId: usageTaskId.trim(),
        domain: usageDomain,
        billingKey: overrides?.billing_key ?? usageBillingKey.trim(),
        capability: overrides?.capability ?? usageCapability.trim(),
        model: overrides?.model ?? usageModel.trim(),
        billingBasis: usageBasis,
        dateFrom: usageDateFrom,
        dateTo: usageDateTo,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("orders.ui.loadUsageFailed"));
    }
  }

  useEffect(() => {
    const next = tabFromSearch(searchParams.get("tab"));
    setTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPage]);

  useEffect(() => {
    void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerPage]);

  useEffect(() => {
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usagePage]);

  useEffect(() => {
    if (!orderQuery.id || !orders?.items) return;
    const hit = orders.items.find((o) => o.id === orderQuery.id);
    if (hit) setOrderDetail(hit);
  }, [orderQuery.id, orders?.items]);

  useEffect(() => {
    const tradeNo = searchParams.get("trade");
    if (!tradeNo) return;
    void (async () => {
      try {
        const res = await listAdminOrders(1, { pageSize: 1, outTradeNo: tradeNo });
        const hit = res.items[0];
        if (hit) {
          setOrderDetail(hit);
          orderQuery.open(hit.id);
        }
      } catch {
        /* 深链失败时静默，用户仍可手动筛选 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 将激活列表同步到 URL，保证刷新和跨页深链保持一致。
  function onTabChange(next: string) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === "orders") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="admin-list-page">
      <PageHeader title={tr("orders.ui.title")} description={tr("orders.ui.desc")} />
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="orders">{tr("orders.ui.tabOrders")}</TabsTrigger>
          <TabsTrigger value="ledger">{tr("orders.ui.tabLedger")}</TabsTrigger>
          <TabsTrigger value="usage">{tr("orders.ui.tabUsage")}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4">
          <AdminFilterBar>
            <Select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
              <option value="">{tr("orders.ui.allStatuses")}</option>
              <option value="pending">{tr("status.pendingPayment")}</option>
              <option value="paid">{tr("status.paid")}</option>
              <option value="closed">{tr("status.closed")}</option>
            </Select>
            <AdminUserSearchSelect value={orderUserId} onChange={(id) => setOrderUserId(id)} />
            <Button
              size="sm"
              variant="secondary"
              className="admin-filter-action"
              onClick={() => {
                setOrderPage(1);
                void loadOrders(1);
              }}
            >
              {tr("orders.ui.filter")}
            </Button>
          </AdminFilterBar>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{tr("orders.ui.colOutTradeNo")}</TableHead>
                  <TableHead>{tr("orders.ui.colUser")}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>{tr("orders.ui.colAmount")}</TableHead>
                  <TableHead>{tr("orders.ui.colCreditedPoints")}</TableHead>
                  <TableHead>{tr("orders.ui.colPayType")}</TableHead>
                  <TableHead>{tr("orders.ui.colStatus")}</TableHead>
                  <TableHead>{tr("orders.ui.colTradeNo")}</TableHead>
                  <TableHead>{tr("orders.ui.colPaidAt")}</TableHead>
                  <TableHead>{tr("orders.ui.colCreatedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orders?.items ?? []).map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setOrderDetail(o);
                      orderQuery.open(o.id);
                    }}
                  >
                    <TableCell>{o.id}</TableCell>
                    <TableCell className="font-mono text-xs">{o.out_trade_no}</TableCell>
                    <TableCell>
                      <AdminEntityLink kind="user" id={o.user_id} label={o.user_email ?? undefined} />
                    </TableCell>
                    <TableCell>{o.sku_id}</TableCell>
                    <TableCell>{orderPaymentLabel(o)}</TableCell>
                    <TableCell>{points(o.credit_fen)}</TableCell>
                    <TableCell>{payTypeLabel(o.pay_type)}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "paid" ? "success" : "secondary"}>
                        {orderStatusLabel(o.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.trade_no || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.paid_at ? new Date(o.paid_at).toLocaleString() : "—"}
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
          <AdminFilterBar>
            <Select value={ledgerKind} onChange={(e) => setLedgerKind(e.target.value)}>
              <option value="">{tr("orders.ui.allKinds")}</option>
              <option value="topup">{tr("status.topUp")}</option>
              <option value="grant">{tr("status.grant")}</option>
              <option value="adjust">{tr("status.adjustment")}</option>
              <option value="freeze">{tr("status.hold")}</option>
              <option value="unfreeze">{tr("status.release")}</option>
              <option value="settle">{tr("status.settlement")}</option>
              <option value="refund">{tr("status.refund")}</option>
            </Select>
            <AdminUserSearchSelect value={ledgerUserId} onChange={(id) => setLedgerUserId(id)} />
            <Button
              size="sm"
              variant="secondary"
              className="admin-filter-action"
              onClick={() => {
                setLedgerPage(1);
                void loadLedger(1);
              }}
            >
              {tr("orders.ui.filter")}
            </Button>
          </AdminFilterBar>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{tr("orders.ui.colUser")}</TableHead>
                  <TableHead>{tr("orders.ui.colChange")}</TableHead>
                  <TableHead>{tr("orders.ui.colPointsAfter")}</TableHead>
                  <TableHead>{tr("orders.ui.colKind")}</TableHead>
                  <TableHead>{tr("orders.ui.colRef")}</TableHead>
                  <TableHead>{tr("orders.ui.colNote")}</TableHead>
                  <TableHead>{tr("orders.ui.colTime")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledger?.items ?? []).map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setLedgerDetail(e)}>
                    <TableCell>{e.id}</TableCell>
                    <TableCell>
                      <AdminEntityLink kind="user" id={e.user_id} label={e.user_email ?? undefined} />
                    </TableCell>
                    <TableCell className={e.delta_fen >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {e.delta_fen >= 0 ? "+" : ""}
                      {points(e.delta_fen)}
                    </TableCell>
                    <TableCell>{points(e.balance_after)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ledgerKindLabel(e.kind)}</Badge>
                    </TableCell>
                    <TableCell><LedgerRefLink row={e} /></TableCell>
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
        <TabsContent value="usage" className="space-y-4">
          <AdminFilterBar>
            <AdminUserSearchSelect value={usageUserId} onChange={(id) => setUsageUserId(id)} />
            <Input placeholder={tr("orders.ui.taskId")} value={usageTaskId} onChange={(e) => setUsageTaskId(e.target.value)} />
            <Select value={usageDomain} onChange={(e) => setUsageDomain(e.target.value)}>
              <option value="">{tr("orders.ui.allDomains")}</option>
              <option value="kepu">{tr("orders.ui.domainKepu")}</option>
              <option value="drama">{tr("orders.ui.domainDrama")}</option>
              <option value="studio">{tr("orders.ui.domainStudio")}</option>
            </Select>
            <Input
              placeholder="billing_key"
              value={usageBillingKey}
              onChange={(e) => setUsageBillingKey(e.target.value)}
            />
            <Select value={usageCapability} onChange={(e) => setUsageCapability(e.target.value)}>
              <option value="">{tr("orders.ui.allCapabilities")}</option>
              <option value="llm">{tr("orders.ui.capLlm")}</option>
              <option value="image">{tr("orders.ui.capImage")}</option>
              <option value="video">{tr("orders.ui.capVideo")}</option>
              <option value="tts">{tr("orders.ui.capTts")}</option>
            </Select>
            <Input
              placeholder={tr("orders.ui.modelPlaceholder")}
              value={usageModel}
              onChange={(e) => setUsageModel(e.target.value)}
            />
            <Select value={usageBasis} onChange={(e) => setUsageBasis(e.target.value)}>
              <option value="">{tr("orders.ui.allBases")}</option>
              <option value="estimate">{tr("orders.ui.estimated")}</option>
              <option value="upstream">{tr("orders.ui.measured")}</option>
              <option value="upstream_usage">{tr("orders.ui.measuredTokens")}</option>
              <option value="upstream_cost">{tr("orders.ui.measuredCost")}</option>
            </Select>
            <AdminDateRangeFilter
              from={usageDateFrom}
              to={usageDateTo}
              onChange={({ from, to }) => {
                setUsageDateFrom(from);
                setUsageDateTo(to);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="admin-filter-action"
              onClick={() => {
                setUsageBillingKey("llm_chat");
                setUsageCapability("llm");
                setUsageModel("");
                setUsagePage(1);
                void loadUsage(1, { billing_key: "llm_chat", capability: "llm", model: "" });
              }}
            >
              {tr("orders.ui.llmUsage")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="admin-filter-action"
              onClick={() => {
                setUsageBillingKey("");
                setUsageCapability("video");
                setUsageModel("seedance-2.5");
                setUsagePage(1);
                void loadUsage(1, { billing_key: "", capability: "video", model: "seedance-2.5" });
              }}
            >
              Seedance 2.5
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="admin-filter-action"
              onClick={() => {
                setUsagePage(1);
                void loadUsage(1);
              }}
            >
              {tr("orders.ui.filter")}
            </Button>
          </AdminFilterBar>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("orders.ui.colTime")}</TableHead>
                  <TableHead>{tr("orders.ui.colUser")}</TableHead>
                  <TableHead>{tr("orders.ui.colTask")}</TableHead>
                  <TableHead>{tr("orders.ui.colProject")}</TableHead>
                  <TableHead>{tr("orders.ui.colDomain")}</TableHead>
                  <TableHead>{tr("orders.ui.colCapability")}</TableHead>
                  <TableHead>{tr("orders.ui.colModel")}</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>{tr("orders.ui.colCharge")}</TableHead>
                  <TableHead>{tr("orders.ui.colBasis")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usage?.items ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <AdminEntityLink kind="user" id={row.user_id} label={row.user_email ?? undefined} />
                    </TableCell>
                    <TableCell>
                      {row.task_run_id ? (
                        <AdminEntityLink kind="task" id={row.task_run_id} />
                      ) : (
                        tr("orders.ui.legacyUnlinked")
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.project_id ? (
                        <AdminEntityLink kind="project" id={row.project_id} />
                      ) : row.drama_project_id ? (
                        <AdminEntityLink kind="drama" id={row.drama_project_id} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{row.domain ? taskDomainLabel(row.domain) : "—"}</TableCell>
                    <TableCell>{row.capability ?? row.billing_key}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{row.model || "—"}</TableCell>
                    <TableCell>{row.total_tokens ?? 0}</TableCell>
                    <TableCell>{points(row.charge_fen ?? 0)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.billing_basis === "estimate" || row.estimated
                            ? "secondary"
                            : "success"
                        }
                        title={
                          row.billing_basis === "upstream_cost"
                            ? tr("orders.ui.basisCost")
                            : row.billing_basis === "upstream_usage"
                              ? tr("orders.ui.basisUsage")
                              : tr("orders.ui.basisEstimate")
                        }
                      >
                        {row.billing_basis_label ?? (row.estimated ? tr("orders.ui.estimated") : tr("orders.ui.measured"))}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {usage && (
            <PaginationBar
              page={usage.meta.page}
              pageSize={usage.meta.page_size}
              total={usage.meta.total}
              onPageChange={setUsagePage}
            />
          )}
        </TabsContent>
      </Tabs>

      <OrderDetailDialog
        orderDetail={orderDetail}
        open={orderQuery.isOpen}
        onClose={() => {
          setOrderDetail(null);
          orderQuery.close();
        }}
      />
      <LedgerDetailDialog ledgerDetail={ledgerDetail} onClose={() => setLedgerDetail(null)} />
    </div>
  );
}
