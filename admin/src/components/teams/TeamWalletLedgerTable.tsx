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
import { fenToYuan } from "@/lib/utils";

/** 团队钱包流水：独立于模型消费记录，包含充值、任务记账与后台调账。 */
export function TeamWalletLedgerTable({ teamId }: { teamId: number }) {
  /* draft 为输入搜索，q/adjustmentsOnly 为已应用的服务端筛选。 */
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [adjustmentsOnly, setAdjustmentsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data, loading, error, reload } = useAdminTeamQuery<PageResult<AdminTeamWalletLedger>>(teamPaths.walletLedger(teamId, { q, adjustmentsOnly, page, pageSize }));
  const kindLabels: Record<string, string> = { topup: "Nạp tiền", freeze: "Đóng băng tác vụ", settle: "Quyết toán tác vụ", refund: "Hoàn tiền", adjust: "Điều chỉnh từ trang quản trị" };
  return <div className="space-y-4">
    <form onSubmit={(event) => { event.preventDefault(); setQ(draft.trim()); setPage(1); reload(); }}>
      <AdminFilterBar>
        <AdminSearchInput value={draft} onChange={setDraft} placeholder="Tìm ghi chú điều chỉnh, người thao tác hoặc mã liên kết" />
        <AdminFilterField label="Phạm vi biến động"><Select value={String(adjustmentsOnly)} onChange={(event) => { setAdjustmentsOnly(event.target.value === "true"); setPage(1); }}><option value="false">Tất cả biến động ví</option><option value="true">Chỉ điều chỉnh từ trang quản trị</option></Select></AdminFilterField>
        <Button type="submit" size="sm" disabled={loading}>Tìm kiếm</Button>
      </AdminFilterBar>
    </form>
    <p className="text-xs text-[var(--admin-muted)]">Mỗi biến động ghi lại số tiền thay đổi và số dư sau điều chỉnh tại thời điểm đó; điều chỉnh từ trang quản trị hiển thị người thao tác thực tế.</p>
    <TeamQueryFeedback loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
    {data && data.items.length > 0 && <Table><TableHeader><TableRow>
      <TableHead>Thời gian (Thượng Hải)</TableHead><TableHead>Loại</TableHead><TableHead>Số tiền biến động</TableHead><TableHead>Số dư sau biến động</TableHead><TableHead>Người thao tác</TableHead><TableHead>Ghi chú / liên kết</TableHead>
    </TableRow></TableHeader><TableBody>{data.items.map((row) => <TableRow key={row.id}>
      <TableCell className="whitespace-nowrap text-xs">{teamDate(row.created_at)}</TableCell>
      <TableCell><Badge variant={row.ref_type === "admin_adjust" ? "warning" : "info"}>{kindLabels[row.kind] || row.kind}</Badge></TableCell>
      <TableCell className="font-semibold tabular-nums">{row.delta_fen >= 0 ? "+" : "−"}¥{fenToYuan(Math.abs(row.delta_fen))}</TableCell>
      <TableCell className="tabular-nums">¥{fenToYuan(row.balance_after_fen)}</TableCell>
      <TableCell><div>{row.operator_nickname || "—"}</div><div className="mt-1 text-xs text-[var(--admin-muted)]">{row.operator_email} · #{row.actor_user_id}</div></TableCell>
      <TableCell className="max-w-xs break-words whitespace-normal"><div>{row.note || "—"}</div><div className="mt-1 break-all text-xs text-[var(--admin-muted)]">Biến động #{row.id}{row.ref_id && row.ref_type !== "admin_adjust" ? ` · ${row.ref_type} #${row.ref_id}` : ""}</div></TableCell>
    </TableRow>)}</TableBody></Table>}
    {data && <PaginationBar page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
