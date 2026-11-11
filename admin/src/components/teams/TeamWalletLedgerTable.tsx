import { useState } from "react";
import type { PageResult } from "@/api/types/common";
import type { AdminTeamWalletLedger } from "@/api/types/teams";
import { teamPaths } from "@/api/teams";
import { AdminFilterBar, AdminFilterField } from "@/components/admin/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamQueryFeedback } from "./TeamQueryFeedback";
import { useAdminTeamQuery } from "@/hooks/useAdminTeamQuery";
import { teamDate } from "@/lib/teamLabels";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { points } from "@/lib/points";
import { tr } from "../../i18n/translate.ts";

/** 团队钱包流水：独立于模型消费记录，包含充值、任务记账与后台调账。 */
export function TeamWalletLedgerTable({ teamId }: { teamId: number }) {
  /* draft 为输入搜索，q/adjustmentsOnly 为已应用的服务端筛选。 */
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [adjustmentsOnly, setAdjustmentsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data, loading, error, reload } = useAdminTeamQuery<PageResult<AdminTeamWalletLedger>>(teamPaths.walletLedger(teamId, { q, adjustmentsOnly, page, pageSize }));
  // getter：读取时按当前语言取文案
const kindLabels: Record<string, string> = {
  get topup() { return tr("teamsUi.kind.topup"); },
  get freeze() { return tr("teamsUi.kind.freeze"); },
  get settle() { return tr("teamsUi.kind.settle"); },
  get refund() { return tr("teamsUi.kind.refund"); },
  get adjust() { return tr("teamsUi.kind.adjust"); },
};
  return <div className="space-y-4">
    <form onSubmit={(event) => { event.preventDefault(); setQ(draft.trim()); setPage(1); reload(); }}>
      <AdminFilterBar>
        <AdminSearchInput value={draft} onChange={setDraft} placeholder={tr("teamsUi.ledgerSearch")} />
        <AdminFilterField label={tr("teamsUi.ledgerScope")}><Select value={String(adjustmentsOnly)} onChange={(event) => { setAdjustmentsOnly(event.target.value === "true"); setPage(1); }}><option value="false">{tr("teamsUi.allLedger")}</option><option value="true">{tr("teamsUi.adminAdjustOnly")}</option></Select></AdminFilterField>
        <Button type="submit" size="sm" disabled={loading}>{tr("teamsUi.search")}</Button>
      </AdminFilterBar>
    </form>
    <p className="text-xs text-[var(--admin-muted)]">{tr("teamsUi.ledgerNote")}</p>
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <Table><TableHeader><TableRow>
      <TableHead>{tr("teamsUi.colTimeShanghai")}</TableHead><TableHead>{tr("teamsUi.colKind")}</TableHead><TableHead>{tr("teamsUi.colDelta")}</TableHead><TableHead>{tr("teamsUi.colBalanceAfter")}</TableHead><TableHead>{tr("teamsUi.colOperator")}</TableHead><TableHead>{tr("teamsUi.colNoteRef")}</TableHead>
    </TableRow></TableHeader><TableBody>{data.items.map((row) => <TableRow key={row.id}>
      <TableCell className="whitespace-nowrap text-xs">{teamDate(row.created_at)}</TableCell>
      <TableCell><Badge variant={row.ref_type === "admin_adjust" ? "warning" : "info"}>{kindLabels[row.kind] || row.kind}</Badge></TableCell>
      <TableCell className="font-semibold tabular-nums">{row.delta_fen >= 0 ? "+" : "−"}{points(Math.abs(row.delta_fen))}</TableCell>
      <TableCell className="tabular-nums">{points(row.balance_after_fen)}</TableCell>
      <TableCell><div>{row.operator_nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{row.operator_email} · #{row.actor_user_id}</div></TableCell>
      <TableCell className="max-w-xs break-words whitespace-normal"><div>{row.note || "—"}</div><div className="mt-1 break-all text-xs text-[var(--admin-muted)]">{tr("teamsUi.ledgerN", { id: row.id })}{row.ref_id && row.ref_type !== "admin_adjust" ? ` · ${row.ref_type} #${row.ref_id}` : ""}</div></TableCell>
    </TableRow>)}</TableBody></Table>}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
