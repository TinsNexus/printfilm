import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { teamPaths } from "@/api/teams";
import type { AdminTeamUsagePage } from "@/api/types/teams";
import { AdminDateRangeFilter } from "@/components/admin/AdminDateRangeFilter";
import { AdminFilterBar, AdminFilterField } from "@/components/admin/AdminFilterBar";
import { AdminListStats } from "@/components/admin/AdminListStats";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamQueryFeedback } from "./TeamQueryFeedback";
import { teamDate } from "@/lib/teamLabels";
import { useAdminTeamQuery } from "@/hooks/useAdminTeamQuery";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fenToYuan } from "@/lib/utils";

/** 团队消费明细与筛选合计；成员深链可继续查看已退出成员的历史记录。 */
export function TeamUsageTable({ teamId }: { teamId: number }) {
  /* filter/draft 分离提交，memberId 来自成员列表深链；分页由后端执行。 */
  const [params, setParams] = useSearchParams();
  const memberId = /^\d+$/.test(params.get("member_id") || "") && Number(params.get("member_id")) > 0 ? params.get("member_id")! : "";
  const [draft, setDraft] = useState({ q: "", settled: "", dateFrom: "", dateTo: "" });
  const [filter, setFilter] = useState(draft);
  const [validation, setValidation] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data, loading, error, reload } = useAdminTeamQuery<AdminTeamUsagePage>(teamPaths.usage(teamId, { ...filter, memberId, page, pageSize }));

  /** 检查日历范围后提交筛选，不覆盖上一次有效结果。 */
  function search() {
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) { setValidation("Ngày bắt đầu không được muộn hơn ngày kết thúc"); return; }
    setValidation(""); setFilter(draft); setPage(1); reload();
  }

  return <div className="space-y-4">
    <form onSubmit={(event) => { event.preventDefault(); search(); }}>
      <AdminFilterBar>
        <AdminSearchInput value={draft.q} onChange={(q) => setDraft({ ...draft, q })} placeholder="Tìm thành viên, email, dự án, model hoặc hạng mục tính phí" />
        <AdminFilterField label="Trạng thái quyết toán"><Select value={draft.settled} onChange={(event) => setDraft({ ...draft, settled: event.target.value })}><option value="">Tất cả trạng thái</option><option value="true">Đã quyết toán</option><option value="false">Chờ quyết toán</option></Select></AdminFilterField>
        <AdminDateRangeFilter from={draft.dateFrom} to={draft.dateTo} onChange={({ from, to }) => setDraft({ ...draft, dateFrom: from, dateTo: to })} />
        <Button type="submit" size="sm" disabled={loading}>Lọc</Button>
      </AdminFilterBar>
    </form>
    {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
    {memberId && <div className="flex items-center gap-3 text-sm"><Badge variant="info">Chỉ xem thành viên #{memberId}</Badge><Button type="button" variant="ghost" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete("member_id"); setParams(next, { replace: true }); setPage(1); }}>Xem tất cả thành viên</Button></div>}
    <AdminListStats items={[
      { label: "Số bản ghi kết quả lọc", value: data?.summary.record_count ?? "—" },
      { label: "Chi tiêu đã quyết toán của kết quả lọc", value: data ? `¥${fenToYuan(data.summary.settled_charge_fen)}` : "—", hint: "Tổng hợp theo toàn bộ kết quả lọc, không bị ảnh hưởng bởi phân trang; không gồm số tiền chờ quyết toán" },
    ]} />
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <Table><TableHeader><TableRow>
      <TableHead>Thời gian (Thượng Hải)</TableHead><TableHead>Thành viên</TableHead><TableHead>Dự án / tác vụ</TableHead><TableHead>Hạng mục tính phí / model</TableHead><TableHead>Token</TableHead><TableHead>Số tiền</TableHead><TableHead>Trạng thái quyết toán</TableHead>
    </TableRow></TableHeader><TableBody>{data.items.map((row) => <TableRow key={row.id}>
      <TableCell className="whitespace-nowrap text-xs">{teamDate(row.created_at)}</TableCell>
      <TableCell><div className="font-semibold">{row.user_nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{row.user_email} · #{row.user_id}</div></TableCell>
      <TableCell><div>{row.project_title || (row.project_id ? "Dự án đã bị xóa" : "Không liên kết dự án")}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{row.project_id ? `Dự án #${row.project_id} · ` : ""}{row.task_run_id ? `Tác vụ #${row.task_run_id}` : "Không liên kết tác vụ"}</div></TableCell>
      <TableCell><div>{row.billing_label}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{row.model || "—"}</div></TableCell>
      <TableCell className="tabular-nums">{row.total_tokens.toLocaleString()}</TableCell>
      <TableCell className="font-semibold tabular-nums">¥{fenToYuan(row.charge_fen)}</TableCell>
      <TableCell><Badge variant={row.settled ? "success" : "warning"}>{row.settled ? "Đã quyết toán" : "Chờ quyết toán"}</Badge></TableCell>
    </TableRow>)}</TableBody></Table>}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
