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
    <PageHeader title="Quản lý nhóm" description="Xem toàn bộ nhóm, thành viên, tài khoản chủ sở hữu và hạn mức chi tiêu, truy vết từng khoản chi của nhóm." actions={<Button type="button" variant="outline" disabled={loading} onClick={reload}><RefreshCw className="h-4 w-4" />Làm mới</Button>} />
    <form onSubmit={(event) => { event.preventDefault(); search(); }}>
      <AdminFilterBar trailing={<Badge variant="info">{data ? `${data.meta.total} nhóm` : "Quản lý nhóm"}</Badge>}>
        <AdminSearchInput value={draft} onChange={setDraft} placeholder="Tìm tên nhóm, ID, biệt danh hoặc email của chủ sở hữu" />
        <Button type="submit" size="sm" disabled={loading}>Tìm kiếm</Button>
      </AdminFilterBar>
    </form>
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <div className="space-y-3">
      <Table><TableHeader><TableRow>
        <TableHead>团队</TableHead><TableHead>所有者</TableHead><TableHead>成员 / 项目</TableHead>
        <TableHead>所有者个人积分 / 冻结</TableHead><TableHead>本月消费</TableHead><TableHead>创建时间</TableHead><TableHead>操作</TableHead>
      </TableRow></TableHeader><TableBody>{data.items.map((team) => <TableRow key={team.id}>
        <TableCell><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-accent-soft)] text-[var(--admin-forest)]"><UsersRound className="h-5 w-5" /></span><div><Link className="font-semibold hover:underline" to={`/teams/${team.id}`}>{team.name}</Link><div className="mt-1 text-xs text-[var(--admin-muted)]">#{team.id}</div></div></div></TableCell>
        <TableCell><div>{team.owner_nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{team.owner_email}</div></TableCell>
        <TableCell><span className="tabular-nums">{team.member_count} 位成员 / {team.project_count} 个项目</span></TableCell>
        <TableCell className="tabular-nums"><div>{points(team.balance_fen)}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">冻结 {points(team.frozen_fen)}</div></TableCell>
        <TableCell className="tabular-nums"><div>{points(team.month_spent_fen)}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{team.period}</div></TableCell>
        <TableCell className="whitespace-nowrap text-xs">{teamDate(team.created_at)}</TableCell>
        <TableCell><Button type="button" asChild size="sm" variant="outline"><Link to={`/teams/${team.id}`}>Xem nhóm</Link></Button></TableCell>
      </TableRow>)}</TableBody></Table>
    </div>}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
