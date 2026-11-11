import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminLedger, PageResult } from "@/api/client";
import { listAdminLedger } from "@/api/finance";
import { AdminDateRangeFilter } from "@/components/admin/AdminDateRangeFilter";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminUserSearchSelect } from "@/components/admin/AdminUserSearchSelect";
import { PageSection } from "@/components/admin/PageSection";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { points } from "@/lib/points";
import { tr } from "../i18n/translate.ts";

type LedgerRes = PageResult<AdminLedger>;

type DirectionFilter = "" | "credit" | "debit";

/** 调账方向文案：正数为调增，负数为调减 */
function directionLabel(deltaFen: number): string {
  return tr(deltaFen >= 0 ? "teamsUi.credit" : "teamsUi.debit");
}

/** 管理端手动调账记录：仅展示 ref_type=admin 的钱包流水 */
export function AdjustRecordsPage() {
  const [userId, setUserId] = useState<number | null>(null);
  const [direction, setDirection] = useState<DirectionFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerRes | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextPage = page) => {
      setLoading(true);
      try {
        // 后台写流水：调减 kind=adjust，调增 kind=grant。
        setData(await listAdminLedger(nextPage, {
          refType: "admin",
          userId,
          kind: direction === "credit" ? "grant" : direction === "debit" ? "adjust" : "",
          dateFrom,
          dateTo,
        }));
      } catch (err) {
        setData(null);
        toast.error(err instanceof Error ? err.message : tr("teamsUi.adjustLoadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [page, userId, direction, dateFrom, dateTo],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const rows = data?.items ?? [];

  return (
    <div className="admin-page">
      <PageHeader title={tr("teamsUi.adjustTitle")} description={tr("teamsUi.adjustDesc")} />

      <AdminFilterBar>
        <AdminUserSearchSelect value={userId} onChange={setUserId} />
        <Select
          value={direction}
          onChange={(e) => setDirection(e.target.value as DirectionFilter)}
        >
          <option value="">{tr("teamsUi.allDirections")}</option>
          <option value="credit">{tr("teamsUi.credit")}</option>
          <option value="debit">{tr("teamsUi.debit")}</option>
        </Select>
        <AdminDateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          className="admin-filter-action"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          {tr("teamsUi.filter")}
        </Button>
      </AdminFilterBar>

      <PageSection
        title={tr("teamsUi.adjustRecords")}
        description={data ? tr("teamsUi.totalN", { n: data.meta.total }) : undefined}
        bodyClassName="!pt-0"
      >
        <div className="admin-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{tr("teamsUi.colTime")}</TableHead>
                <TableHead>{tr("teamsUi.colUser")}</TableHead>
                <TableHead>{tr("teamsUi.colDirection")}</TableHead>
                <TableHead>{tr("teamsUi.colChange")}</TableHead>
                <TableHead>{tr("teamsUi.colBalanceAfterShort")}</TableHead>
                <TableHead>{tr("teamsUi.colOperator")}</TableHead>
                <TableHead>{tr("teamsUi.colNote")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="!text-center text-[var(--admin-muted)]">
                    {tr("teamsUi.loading")}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="!text-center text-[var(--admin-muted)]">
                    {tr("teamsUi.noAdjustments")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <AdminEntityLink kind="user" id={row.user_id} label={row.user_email ?? undefined} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.delta_fen >= 0 ? "success" : "secondary"}>
                        {directionLabel(row.delta_fen)}
                      </Badge>
                    </TableCell>
                    <TableCell className={row.delta_fen >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {row.delta_fen >= 0 ? "+" : ""}{points(row.delta_fen)}
                    </TableCell>
                    <TableCell>{points(row.balance_after)}</TableCell>
                    <TableCell>
                      {row.ref_id && /^\d+$/.test(row.ref_id) ? (
                        <AdminEntityLink
                          kind="user"
                          id={Number(row.ref_id)}
                          label={row.operator_email ?? undefined}
                        />
                      ) : (
                        row.operator_email || "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate" title={row.note || undefined}>
                      {row.note || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {data ? (
          <PaginationBar
            page={data.meta.page}
            pageSize={data.meta.page_size}
            total={data.meta.total}
            onPageChange={setPage}
          />
        ) : null}
      </PageSection>
    </div>
  );
}
