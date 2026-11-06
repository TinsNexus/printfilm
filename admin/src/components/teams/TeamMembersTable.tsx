import { useState } from "react";
import { Link } from "react-router-dom";
import { teamPaths } from "@/api/teams";
import { TeamBudgetModal } from "./TeamBudgetModal";
import type { AdminTeamMember, AdminTeamMembers } from "@/api/types/teams";
import { AdminFilterBar, AdminFilterField } from "@/components/admin/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamQueryFeedback } from "./TeamQueryFeedback";
import { teamDate, teamRoleLabels } from "@/lib/teamLabels";
import { useAdminTeamQuery } from "@/hooks/useAdminTeamQuery";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fenToYuan } from "@/lib/utils";

/** 分页查看在队/已退出成员，支持按月份回看预算与实际消费。 */
export function TeamMembersTable({ teamId }: { teamId: number }) {
  /* draft/search 区分输入与已提交关键词，其余筛选即时生效。 */
  const [target, setTarget] = useState<AdminTeamMember | null>(null);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState("all");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data, loading, error, reload } = useAdminTeamQuery<AdminTeamMembers>(teamPaths.members(teamId, { page, pageSize, q, role, state, period }));
  return <div className="space-y-4">
    <form onSubmit={(event) => { event.preventDefault(); setQ(draft.trim()); setPage(1); reload(); }}>
      <AdminFilterBar>
        <AdminSearchInput value={draft} onChange={setDraft} placeholder="Tìm biệt danh hoặc email thành viên" />
        <AdminFilterField label="Vai trò"><Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}><option value="">Tất cả vai trò</option><option value="owner">Chủ sở hữu</option><option value="admin">Quản trị viên</option><option value="member">Thành viên</option></Select></AdminFilterField>
        <AdminFilterField label="Trạng thái"><Select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }}><option value="all">Tất cả thành viên</option><option value="active">Thành viên đang trong nhóm</option><option value="removed">Thành viên đã rời</option></Select></AdminFilterField>
        <AdminFilterField label="Tháng chi tiêu"><Input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1); }} /></AdminFilterField>
        <Button type="submit" size="sm" disabled={loading}>Tìm kiếm</Button>
      </AdminFilterBar>
    </form>
    <p className="text-xs text-[var(--admin-muted)]">Tháng chi tiêu:{data?.period || period || "Tháng này"}(múi giờ Thượng Hải). Thành viên đã rời vẫn giữ chi tiêu lịch sử, hạn mức hiển thị theo cài đặt hiện tại.</p>
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <Table><TableHeader><TableRow>
      <TableHead>Thành viên</TableHead><TableHead>Vai trò</TableHead><TableHead>Trạng thái</TableHead><TableHead>Hạn mức hằng tháng</TableHead><TableHead>Đã chi / giữ chỗ</TableHead><TableHead>Thời gian tham gia</TableHead><TableHead>Thao tác</TableHead>
    </TableRow></TableHeader><TableBody>{data.items.map((member) => <TableRow key={member.user_id}>
      <TableCell><div className="font-semibold">{member.nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{member.email} · #{member.user_id}</div></TableCell>
      <TableCell><Badge variant={member.role === "owner" ? "success" : "info"}>{teamRoleLabels[member.role]}</Badge></TableCell>
      <TableCell><Badge variant={member.active ? "success" : "default"}>{member.active ? "Trong nhóm" : "Đã rời"}</Badge></TableCell>
      <TableCell className="tabular-nums">{member.monthly_limit_fen === null ? "Không giới hạn" : `¥${fenToYuan(member.monthly_limit_fen)}`}</TableCell>
      <TableCell className="tabular-nums"><div>¥{fenToYuan(member.spent_fen)}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">Giữ chỗ ¥{fenToYuan(member.reserved_fen)}</div></TableCell>
      <TableCell className="whitespace-nowrap text-xs">{teamDate(member.joined_at)}</TableCell>
      <TableCell>{member.active && <Button type="button" variant="ghost" size="sm" onClick={() => setTarget(member)}>Đặt hạn mức</Button>}<Button type="button" asChild variant="outline" size="sm"><Link to={`/teams/${teamId}?tab=usage&member_id=${member.user_id}`}>Bản ghi chi tiêu</Link></Button></TableCell>
    </TableRow>)}</TableBody></Table>}
    {target && <TeamBudgetModal key={target.user_id} teamId={teamId} memberId={target.user_id} name={target.nickname || target.email} limit={target.monthly_limit_fen} onClose={() => setTarget(null)} onSaved={reload} />}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
