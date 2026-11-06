import { ArrowLeft, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { teamPaths } from "@/api/teams";
import type { AdminTeam } from "@/api/types/teams";
import { AdminListStats } from "@/components/admin/AdminListStats";
import { TeamMembersTable } from "@/components/teams/TeamMembersTable";
import { TeamUsageTable } from "@/components/teams/TeamUsageTable";
import { TeamWalletLedgerTable } from "@/components/teams/TeamWalletLedgerTable";
import { TeamBudgetModal } from "@/components/teams/TeamBudgetModal";
import { TeamQueryFeedback } from "@/components/teams/TeamQueryFeedback";
import { teamDate } from "@/lib/teamLabels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminTeamQuery } from "@/hooks/useAdminTeamQuery";
import { cn, fenToYuan } from "@/lib/utils";

/** 团队二级详情：基本资料、成员与可追溯的团队消费记录。 */
export function TeamDetailPage() {
  /* id 为当前团队，tab 与 member_id 留在 URL 以支持深链和返回。 */
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "wallet" ? "wallet" : params.get("tab") === "usage" ? "usage" : "members";
  const [adjustOpen, setAdjustOpen] = useState(false);
  const activeTeam = useRef(id);
  useEffect(() => { activeTeam.current = id; setAdjustOpen(false); }, [id]);
  const { data: team, loading, error, reload } = useAdminTeamQuery<AdminTeam>(teamPaths.detail(Number.isSafeInteger(id) && id > 0 ? id : 0));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" asChild variant="ghost"><Link to="/teams"><ArrowLeft className="h-4 w-4" />Quay lại danh sách nhóm</Link></Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading} onClick={reload}><RefreshCw className="h-4 w-4" />Làm mới tổng quan nhóm</Button><Button type="button" disabled={!team || loading} onClick={() => setAdjustOpen(true)}>Đặt hạn mức chi tiêu</Button></div></div>
    <TeamQueryFeedback loading={loading} error={error} empty={false} onRetry={reload} />
    {team && <>
      <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-[var(--admin-border)] bg-white p-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--admin-accent-soft)] text-[var(--admin-forest)]"><UsersRound className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-semibold">{team.name}</h1><Badge variant="info">Nhóm #{team.id}</Badge></div><p className="mt-2 break-words text-sm text-[var(--admin-muted)]">{team.description || "Chưa có giới thiệu nhóm"}</p><p className="mt-3 break-words text-xs text-[var(--admin-muted)]">Chủ sở hữu:{team.owner_nickname || "—"} · {team.owner_email} · #{team.owner_user_id}<br />Tạo lúc {teamDate(team.created_at)}</p></div>
      </div>
      <AdminListStats items={[
        { label: "Thành viên đang trong nhóm", value: team.member_count, hint: `${team.project_count} dự án nhóm` },
        { label: "Số dư cá nhân của chủ sở hữu", value: `¥${fenToYuan(team.balance_fen)}`, hint: `Đóng băng ¥${fenToYuan(team.frozen_fen)}` },
        { label: "Hạn mức hằng tháng của nhóm", value: team.monthly_limit_fen === null ? "Không giới hạn" : "¥" + fenToYuan(team.monthly_limit_fen), hint: "Giữ chỗ ¥" + fenToYuan(team.month_reserved_fen) },
        { label: "Đã chi tháng này", value: `¥${fenToYuan(team.month_spent_fen)}`, hint: `${team.period} · Tháng dương lịch Thượng Hải` },
        { label: "Tổng đã chi", value: `¥${fenToYuan(team.total_spent_fen)}`, hint: "Số tiền đã quyết toán, gồm cả thành viên trong lịch sử" },
      ]} />
      <nav className="flex gap-2 border-b border-[var(--admin-border)] pb-3" aria-label="Điều hướng chi tiết nhóm">
        {([['members', 'Thành viên nhóm'], ['usage', 'Bản ghi chi tiêu của nhóm'], ['wallet', 'Biến động ví nhóm lịch sử']] as const).map(([value, label]) => <Button key={value} type="button" variant={tab === value ? "soft" : "ghost"} aria-current={tab === value ? "page" : undefined} className={cn(tab === value && "font-bold")} onClick={() => { const next = new URLSearchParams(params); next.set("tab", value); if (value !== "usage") next.delete("member_id"); setParams(next); }}>{label}</Button>)}
      </nav>
      {tab === "members" ? <TeamMembersTable key={`members-${id}`} teamId={id} /> : tab === "wallet" ? <TeamWalletLedgerTable key={`wallet-${id}`} teamId={id} /> : <TeamUsageTable key={`usage-${id}-${params.get("member_id") || "all"}`} teamId={id} />}
      {adjustOpen && <TeamBudgetModal key={id} teamId={id} name={team.name} limit={team.monthly_limit_fen} onClose={() => setAdjustOpen(false)} onSaved={() => { if (id === activeTeam.current) reload(); }} />}
    </>}
  </div>;
}
