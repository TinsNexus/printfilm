import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminChipFilter } from "@/components/admin/AdminChipFilter";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { PageSection } from "@/components/admin/PageSection";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type AdminFinanceDaily } from "@/api/client";
import { fenToYuan } from "@/lib/utils";
import { formatDateTime, useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

type FinanceDays = "7" | "14" | "30" | "90";

const DAY_OPTIONS = [
  { value: "7", get label() { return tr("finance.last7Days") } },
  { value: "14", get label() { return tr("finance.last14Days") } },
  { value: "30", get label() { return tr("finance.last30Days") } },
  { value: "90", get label() { return tr("finance.last90Days") } },
];

function profitClass(profitFen: number): string {
  if (profitFen > 0) return "text-[var(--admin-forest)] font-semibold";
  if (profitFen < 0) return "text-red-600 font-semibold";
  return "";
}

/** 管理端财务列表：按日展示扣费、成本、token、实际成本与利润 */
export function FinanceListPage() {
  const { t: tx } = useI18n();
  const [days, setDays] = useState<FinanceDays>("30");
  const [data, setData] = useState<AdminFinanceDaily | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminFinanceDaily>(`/api/admin/finance/daily?days=${days}`);
      setData(res);
    } catch (err) {
      setData(null);
      toast.error(err instanceof Error ? err.message : tr("finance.couldLoadFinanceList"));
    } finally {
      setLoading(false);
    }
  }, [days]);

  const syncOfficial = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api<AdminFinanceDaily>(`/api/admin/finance/daily/sync?days=${days}`, { method: "POST" });
      setData(res);
      toast.success(tr("finance.officialCostRefreshed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("finance.refreshFailed"));
    } finally {
      setSyncing(false);
    }
  }, [days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows = [...(data?.series ?? [])].reverse();
  const totals = data?.totals;
  const rangeMismatch = data != null && String(data.days) !== days;

  return (
    <div className="admin-page">
      <PageHeader description={tx("finance.dailyTotalsLocalCharges")} />

      <AdminFilterBar>
        <AdminChipFilter
          label={tx("finance.timeRange")}
          value={days}
          options={DAY_OPTIONS}
          onChange={(v) => setDays(v as FinanceDays)}
          className="admin-chip-filter--segment"
        />
      </AdminFilterBar>

      <PageSection
        title={tx("finance.financeList")}
        description={
          rangeMismatch
            ? tx("finance.dataDoesMatchCurrent")
            : data?.configured
            ? tx("finance.costNote", { days, sync: data.last_sync_at ? tx("finance.lastSync", { t: formatDateTime(data.last_sync_at) }) : "" })
            : tx("finance.tokenfreeApiKeyConfigured")
        }
        actions={
          data?.configured ? (
            <Button type="button" size="sm" variant="outline" disabled={syncing || loading} onClick={() => void syncOfficial()}>
              {syncing ? tx("finance.refreshing") : tx("finance.refreshOfficialCost")}
            </Button>
          ) : null
        }
        bodyClassName="!pt-0"
      >
        <div className="admin-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tx("finance.date")}</TableHead>
                <TableHead>{tx("finance.localCharges")}</TableHead>
                <TableHead>{tx("finance.localCost")}</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>{tx("finance.actualCost")}</TableHead>
                <TableHead>{tx("finance.profit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="!text-center text-[var(--admin-muted)]">
                    {tx("finance.loading")}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="!text-center text-[var(--admin-muted)]">
                    {tx("finance.data")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-mono text-xs">{row.date}</TableCell>
                      <TableCell>¥{fenToYuan(row.charge_fen)}</TableCell>
                      <TableCell>¥{fenToYuan(row.cost_fen)}</TableCell>
                      <TableCell>{row.tokens.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.actual_cost_fen > 0 ? `¥${fenToYuan(row.actual_cost_fen)}` : "—"}
                      </TableCell>
                      <TableCell className={profitClass(row.profit_fen)}>
                        ¥{fenToYuan(row.profit_fen)}
                        {row.profit_pct != null ? ` (${row.profit_pct}%)` : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  {totals ? (
                    <TableRow className="bg-[rgba(15,45,32,0.04)] font-medium">
                      <TableCell>{tx("finance.total")}</TableCell>
                      <TableCell>¥{fenToYuan(totals.charge_fen)}</TableCell>
                      <TableCell>¥{fenToYuan(totals.cost_fen)}</TableCell>
                      <TableCell>{totals.tokens.toLocaleString()}</TableCell>
                      <TableCell>
                        {totals.actual_cost_fen > 0 ? `¥${fenToYuan(totals.actual_cost_fen)}` : "—"}
                      </TableCell>
                      <TableCell className={profitClass(totals.profit_fen)}>
                        ¥{fenToYuan(totals.profit_fen)}
                        {totals.profit_pct != null ? ` (${totals.profit_pct}%)` : ""}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>
    </div>
  );
}
