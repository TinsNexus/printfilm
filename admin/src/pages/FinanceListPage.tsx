import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminChipFilter } from "@/components/admin/AdminChipFilter";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { PageSection } from "@/components/admin/PageSection";
import { PageHeader } from "@/components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type AdminFinanceDaily } from "@/api/client";
import { points } from "@/lib/points";
import { tr } from "../i18n/translate.ts";

type FinanceDays = "7" | "14" | "30" | "90";

const DAY_OPTIONS = [
  { value: "7", get label() { return tr("teamsUi.lastNDays", { n: 7 }); } },
  { value: "14", get label() { return tr("teamsUi.lastNDays", { n: 14 }); } },
  { value: "30", get label() { return tr("teamsUi.lastNDays", { n: 30 }); } },
  { value: "90", get label() { return tr("teamsUi.lastNDays", { n: 90 }); } },
];

/** 管理端财务列表：按日展示用户扣费与用量。 */
export function FinanceListPage() {
  const [days, setDays] = useState<FinanceDays>("30");
  const [data, setData] = useState<AdminFinanceDaily | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminFinanceDaily>(`/api/admin/finance/daily?days=${days}`);
      setData(res);
    } catch (err) {
      setData(null);
      toast.error(err instanceof Error ? err.message : tr("teamsUi.financeLoadFailed"));
    } finally {
      setLoading(false);
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
      <PageHeader title={tr("teamsUi.financeTitle")} description={tr("teamsUi.financeDesc")} />

      <AdminFilterBar>
        <AdminChipFilter
          label={tr("teamsUi.timeRange")}
          value={days}
          options={DAY_OPTIONS}
          onChange={(v) => setDays(v as FinanceDays)}
          className="admin-chip-filter--segment"
        />
      </AdminFilterBar>

      <PageSection
        title={tr("teamsUi.financeTitle")}
        description={
          rangeMismatch
            ? tr("teamsUi.rangeMismatch")
            : tr("teamsUi.financeRangeDesc", { n: days })
        }
        bodyClassName="!pt-0"
      >
        <div className="admin-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("teamsUi.colDate")}</TableHead>
                <TableHead>{tr("teamsUi.colCharge")}</TableHead>
                <TableHead>{tr("teamsUi.colCalls")}</TableHead>
                <TableHead>Token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="!text-center text-[var(--admin-muted)]">
                    {tr("teamsUi.loading")}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="!text-center text-[var(--admin-muted)]">
                    {tr("teamsUi.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-mono text-xs">{row.date}</TableCell>
                      <TableCell>{points(row.charge_fen)}</TableCell>
                      <TableCell>{row.calls.toLocaleString()}</TableCell>
                      <TableCell>{row.tokens.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {totals ? (
                    <TableRow className="bg-[rgba(15,45,32,0.04)] font-medium">
                      <TableCell>{tr("teamsUi.total")}</TableCell>
                      <TableCell>{points(totals.charge_fen)}</TableCell>
                      <TableCell>{totals.calls.toLocaleString()}</TableCell>
                      <TableCell>{totals.tokens.toLocaleString()}</TableCell>
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
