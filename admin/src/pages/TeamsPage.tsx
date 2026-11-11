import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, UsersRound } from "lucide-react";
import type { PageResult } from "@/api/types/common";
import type { AdminTeam } from "@/api/types/teams";
import { teamPaths } from "@/api/teams";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { PaginationBar } from "@/components/PaginationBar";
import { TeamQueryFeedback } from "@/components/teams/TeamQueryFeedback";
import { teamDate } from "@/lib/teamLabels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminTeamQuery } from "@/hooks/useAdminTeamQuery";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { points } from "@/lib/points";
import { tr } from "../i18n/translate.ts";

/** 团队管理入口：查看归属、规模、所有者账户与消费上限与实际消费。 */
export function TeamsPage() {
  /* draft 为输入值，q 为已提交搜索；分页全部由服务端完成。 */
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const query = useAdminTeamQuery<PageResult<AdminTeam>>(teamPaths.list({ page, pageSize, q }));
  const { data, loading, error, reload } = query;

  /** 提交搜索时重置到首页，重复搜索也可刷新。 */
  function search() {
    setQ(draft.trim()); setPage(1); reload();
  }

  return <div className="space-y-5">
    <PageHeader title={tr("teamsUi.title")} description={tr("teamsUi.desc")} actions={<Button type="button" variant="outline" disabled={loading} onClick={reload}><RefreshCw className="h-4 w-4" />{tr("teamsUi.refresh")}</Button>} />
    <form onSubmit={(event) => { event.preventDefault(); search(); }}>
      <AdminFilterBar trailing={<Badge variant="info">{data ? tr("teamsUi.countN", { n: data.meta.total }) : tr("teamsUi.title")}</Badge>}>
        <AdminSearchInput value={draft} onChange={setDraft} placeholder={tr("teamsUi.searchPlaceholder")} />
        <Button type="submit" size="sm" disabled={loading}>{tr("teamsUi.search")}</Button>
      </AdminFilterBar>
    </form>
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <div className="space-y-3">
      <Table><TableHeader><TableRow>
        <TableHead>{tr("teamsUi.colTeam")}</TableHead><TableHead>{tr("teamsUi.colOwner")}</TableHead><TableHead>{tr("teamsUi.colMembersProjects")}</TableHead>
        <TableHead>{tr("teamsUi.colOwnerPoints")}</TableHead><TableHead>{tr("teamsUi.colMonthSpent")}</TableHead><TableHead>{tr("teamsUi.colCreated")}</TableHead><TableHead>{tr("teamsUi.colActions")}</TableHead>
      </TableRow></TableHeader><TableBody>{data.items.map((team) => <TableRow key={team.id}>
        <TableCell><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-accent-soft)] text-[var(--admin-forest)]"><UsersRound className="h-5 w-5" /></span><div><Link className="font-semibold hover:underline" to={`/teams/${team.id}`}>{team.name}</Link><div className="mt-1 text-xs text-[var(--admin-muted)]">#{team.id}</div></div></div></TableCell>
        <TableCell><div>{team.owner_nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{team.owner_email}</div></TableCell>
        <TableCell><span className="tabular-nums">{tr("teamsUi.membersProjects", { members: team.member_count, projects: team.project_count })}</span></TableCell>
        <TableCell className="tabular-nums"><div>{points(team.balance_fen)}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{tr("teamsUi.frozenAmount", { amount: points(team.frozen_fen) })}</div></TableCell>
        <TableCell className="tabular-nums"><div>{points(team.month_spent_fen)}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{team.period}</div></TableCell>
        <TableCell className="whitespace-nowrap text-xs">{teamDate(team.created_at)}</TableCell>
        <TableCell><Button type="button" asChild size="sm" variant="outline"><Link to={`/teams/${team.id}`}>{tr("teamsUi.viewTeam")}</Link></Button></TableCell>
      </TableRow>)}</TableBody></Table>
    </div>}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
