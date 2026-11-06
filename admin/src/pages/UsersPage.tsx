import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, type AdminStats, type AdminUserRow, type PageMeta } from "@/api/client";
import { AdminField } from "@/components/admin/AdminField";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { AdminListStats } from "@/components/admin/AdminListStats";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminDetailQuery } from "@/hooks/useAdminDetailQuery";
import { formatAccountId } from "@/lib/admin-account";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fenToYuan } from "@/lib/utils";
import { yuanInputToFen } from "@/lib/moneyInput";
import { Switch } from "@/components/ui/switch";

type ListRes = { items: AdminUserRow[]; meta: PageMeta };

// 用户管理：搜索、筛选、只读明细与编辑
export function UsersPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<ListRes | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState({
    role: "user",
    /** increase=增加 / decrease=减少 */
    balance_dir: "increase" as "increase" | "decrease",
    /** 调账金额（元），空表示不改余额 */
    balance_amount_yuan: "",
    balance_note: "",
  });
  const [saving, setSaving] = useState(false);
  const [adjustBalance, setAdjustBalance] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pendingSave = useRef(false);
  const editFormId = useId();
  const adjustmentToggleId = useId();
  const userDetail = useAdminDetailQuery("user");

  const amountFen = yuanInputToFen(form.balance_amount_yuan);
  const balanceAfterFen = editing && adjustBalance && amountFen !== null
    ? editing.balance_fen + (form.balance_dir === "decrease" ? -amountFen : amountFen)
    : editing?.balance_fen ?? 0;
  const amountError = !adjustBalance ? "" : !form.balance_amount_yuan.trim()
    ? "Vui lòng nhập số tiền cần điều chỉnh"
    : amountFen === null ? "Vui lòng nhập số tiền hợp lệ, tối đa hai chữ số thập phân"
    : amountFen === 0 ? "Số tiền điều chỉnh phải lớn hơn 0 tệ"
    : !Number.isSafeInteger(balanceAfterFen) ? "Số tiền sau điều chỉnh quá lớn, vui lòng giảm số tiền điều chỉnh"
    : balanceAfterFen < 0 ? "Số tiền giảm không được vượt quá số dư hiện tại"
    : "";
  const visibleAmountError = amountTouched || submitAttempted ? amountError : "";
  const roleChanged = editing !== null && form.role !== editing.role;
  const hasChanges = roleChanged || adjustBalance;

  async function load(nextPage = page, nextQ = q, nextSize = pageSize) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(nextSize),
      });
      if (nextQ.trim()) params.set("q", nextQ.trim());
      if (roleFilter) params.set("role", roleFilter);
      const res = await api<ListRes>(`/api/admin/users?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải thất bại");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    void api<AdminStats>("/api/admin/stats?days=7")
      .then(setStats)
      .catch((err) => {
        setStats(null);
        toast.error(err instanceof Error ? err.message : "Tải thống kê thất bại");
      });
  }, []);

  useEffect(() => {
    if (!userDetail.id || !data?.items) return;
    const hit = data.items.find((u) => u.id === userDetail.id);
    if (hit) setDetailUser(hit);
  }, [userDetail.id, data?.items]);

  function openEdit(user: AdminUserRow) {
    if (pendingSave.current) return;
    setEditing(user);
    setAdjustBalance(false);
    setAmountTouched(false);
    setSubmitAttempted(false);
    setSaveError("");
    setForm({
      role: user.role || "user",
      balance_dir: "increase",
      balance_amount_yuan: "",
      balance_note: "",
    });
  }

  async function saveEdit() {
    if (!editing || pendingSave.current || !hasChanges) return;
    setSubmitAttempted(true);
    setSaveError("");
    if (amountError) return;
    pendingSave.current = true;
    setSaving(true);
    try {
      const payload: {
        role: string;
        balance_delta_fen?: number;
        balance_note?: string;
      } = { role: form.role };

      if (adjustBalance && amountFen !== null && amountFen > 0) {
        payload.balance_delta_fen = form.balance_dir === "decrease" ? -amountFen : amountFen;
        payload.balance_note = form.balance_note.trim() || undefined;
      }

      await api(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast.success(payload.balance_delta_fen ? "Đã điều chỉnh và lưu" : "Đã lưu");
      setEditing(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Lưu thất bại, vui lòng thử lại");
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  function applyFilters() {
    setPage(1);
    void load(1, q, pageSize);
  }

  return (
    <div className="admin-list-page">
      <PageHeader title="Quản lý người dùng" description="Tìm người dùng, điều chỉnh vai trò và số dư" />

      <AdminFilterBar>
        <AdminSearchInput
          value={q}
          onChange={setQ}
          placeholder="Tìm email / biệt danh / ID tài khoản"
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Tất cả vai trò</option>
          <option value="user">Người dùng thường</option>
          <option value="admin">Quản trị viên</option>
        </Select>
        <Button size="sm" className="admin-filter-action" onClick={applyFilters} disabled={loading}>
          {loading ? "Đang tải…" : "Tìm kiếm"}
        </Button>
      </AdminFilterBar>

      <AdminListStats
        items={[
          { label: "Tổng số người dùng", value: stats?.user_count ?? (loading ? "…" : "—") },
          {
            label: "Lượt gọi tháng này",
            value: stats != null ? (stats.usage_calls_month ?? 0) : loading ? "…" : "—",
            hint: stats ? `Hôm nay ${stats.usage_calls_today ?? 0} lần` : undefined,
          },
          {
            label: "Tổng lượt gọi",
            value: stats != null ? (stats.usage_calls_total ?? 0) : loading ? "…" : "—",
          },
        ]}
      />

      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID tài khoản</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Biệt danh</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Số dư</TableHead>
              <TableHead>Đóng băng</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Thời gian đăng ký</TableHead>
              <TableHead className="w-[140px]">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs text-[#909399]">{formatAccountId(u.id)}</TableCell>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>{u.nickname || "—"}</TableCell>
                <TableCell className="text-xs">{u.phone || "—"}</TableCell>
                <TableCell className="tabular-nums">¥{fenToYuan(u.balance_fen)}</TableCell>
                <TableCell className="tabular-nums">¥{fenToYuan(u.frozen_fen)}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "success" : "secondary"}>{u.role === "admin" ? "Quản trị viên" : "Người dùng thường"}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailUser(u);
                        userDetail.open(u.id);
                      }}
                    >
                      Xem
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      Chỉnh sửa
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState title="Chưa có người dùng" description="Thử đổi từ khóa tìm kiếm" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {data && (
          <PaginationBar
            page={data.meta.page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      <UserDetailDrawer
        userId={userDetail.id}
        open={userDetail.isOpen}
        onOpenChange={(open) => {
          if (!open) userDetail.close();
        }}
        initialUser={detailUser}
      />

      <AdminModal
        open={!!editing}
        onOpenChange={(open) => { if (!open && !pendingSave.current) setEditing(null); }}
        size="lg"
        title="Chỉnh sửa người dùng"
        subtitle={editing?.email}
        footer={
          <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Hủy</Button>
            <Button type="submit" form={editFormId} disabled={saving || !hasChanges} aria-busy={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {saving ? "Đang lưu…" : adjustBalance ? "Xác nhận điều chỉnh và lưu" : "Lưu thay đổi quyền"}
            </Button>
          </>
        }
      >
        <form id={editFormId} noValidate onSubmit={(event) => { event.preventDefault(); void saveEdit(); }} className="space-y-6">
          <div className="admin-form-summary grid gap-4 rounded-xl border border-[var(--admin-border)] bg-[#f7f9f4] p-4 sm:grid-cols-2">
            <div className="admin-form-summary-item"><div className="text-xs text-[var(--admin-muted)]">Số dư tài khoản hiện tại</div><div className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--admin-text)]">¥{fenToYuan(editing?.balance_fen ?? 0)}</div></div>
            <div className="admin-form-summary-item"><div className="text-xs text-[var(--admin-muted)]">Số tiền đã đóng băng</div><div className="mt-1.5 text-lg font-medium tabular-nums text-[var(--admin-text)]">¥{fenToYuan(editing?.frozen_fen ?? 0)}</div><p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">Điều chỉnh sẽ không thay đổi số tiền đã đóng băng của tác vụ</p></div>
          </div>
          <fieldset disabled={saving} className="admin-form-section min-w-0 space-y-4">
            <legend className="admin-form-section-title mb-1 text-sm font-semibold text-[var(--admin-text)]">Quyền tài khoản</legend>
            <AdminField label="Vai trò tài khoản" required hint="Quản trị viên có thể vào trang quản trị, xem và quản lý toàn bộ dữ liệu nghiệp vụ.">
              <Select value={form.role} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, role: e.target.value })); }} disabled={saving}>
                <option value="user">Người dùng thường</option><option value="admin">Quản trị viên</option>
              </Select>
            </AdminField>
          </fieldset>
          <section className="admin-form-section space-y-4 border-t border-[var(--admin-border)] pt-5">
            <div className="flex items-start justify-between gap-4">
              <div><label htmlFor={adjustmentToggleId} className="text-sm font-semibold text-[var(--admin-text)]">Điều chỉnh số dư tài khoản</label><p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">Bật khi cần; nếu chỉ sửa vai trò thì số dư tài khoản giữ nguyên.</p></div>
              <Switch id={adjustmentToggleId} checked={adjustBalance} disabled={saving} onCheckedChange={(checked) => { setAdjustBalance(checked); setSaveError(""); }} />
            </div>
            {adjustBalance ? <fieldset disabled={saving} className="min-w-0 space-y-4">
              <div className="admin-form-grid admin-form-grid--2">
                <AdminField label="Hướng điều chỉnh" required>
                  <Select value={form.balance_dir} disabled={saving} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, balance_dir: e.target.value === "decrease" ? "decrease" : "increase" })); }}>
                    <option value="increase">Tăng số dư</option><option value="decrease">Giảm số dư</option>
                  </Select>
                </AdminField>
                <AdminField label="Số tiền điều chỉnh (tệ)" required hint="Lớn hơn 0, tối đa hai chữ số thập phân." error={visibleAmountError}>
                  <Input inputMode="decimal" value={form.balance_amount_yuan} disabled={saving} placeholder="Ví dụ 100.00" onBlur={() => setAmountTouched(true)} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, balance_amount_yuan: e.target.value })); }} />
                </AdminField>
              </div>
              <AdminField label="Ghi chú điều chỉnh" optional hint="Ghi chú sẽ được ghi vào biến động tài khoản, thuận tiện cho việc đối chiếu sau này.">
                <Input value={form.balance_note} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, balance_note: e.target.value }))} placeholder="Ví dụ: cấp bù thưởng sự kiện, thu hồi hoàn tiền" />
              </AdminField>
              {!amountError && amountFen !== null ? <div className="admin-form-preview rounded-xl border border-[#d5e6d1] bg-[var(--admin-accent-soft)] p-4" aria-live="polite">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--admin-forest)]"><Wallet className="h-4 w-4" aria-hidden="true" />Số dư tài khoản sau khi lưu</div>
                <div className="flex flex-wrap items-center gap-3 text-lg font-semibold tabular-nums text-[var(--admin-text)]"><span className="text-[var(--admin-muted)]">¥{fenToYuan(editing?.balance_fen ?? 0)}</span><ArrowRight className="h-4 w-4 text-[var(--admin-muted)]" aria-hidden="true" /><span>¥{fenToYuan(balanceAfterFen)}</span><span className="text-xs font-medium text-[var(--admin-forest)]">{form.balance_dir === "decrease" ? "Giảm" : "Tăng"} ¥{fenToYuan(amountFen)}</span></div>
              </div> : null}
            </fieldset> : null}
          </section>
          {saveError ? <p role="alert" className="admin-form-error rounded-lg border border-[#f0d9d5] bg-[#fcf0ee] px-3 py-2.5 text-sm leading-relaxed text-[#aa3d37]">{saveError}</p> : null}
        </form>
      </AdminModal>
    </div>
  );
}
