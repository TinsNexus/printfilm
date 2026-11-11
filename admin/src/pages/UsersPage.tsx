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
import { points, parsePoints } from "@/lib/points";

import { Switch } from "@/components/ui/switch";
import { tr } from "../i18n/translate.ts";

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
    /** 调账积分，空表示不调整 */
    balance_amount_points: "",
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

  const amountFen = parsePoints(form.balance_amount_points);
  const balanceAfterFen = editing && adjustBalance && amountFen !== null
    ? editing.balance_fen + (form.balance_dir === "decrease" ? -amountFen : amountFen)
    : editing?.balance_fen ?? 0;
  const amountError = !adjustBalance ? "" : !form.balance_amount_points.trim()
    ? tr("users.ui.errAmountRequired")
    : amountFen === null ? tr("users.ui.errAmountInvalid")
    : amountFen === 0 ? tr("users.ui.errAmountZero")
    : !Number.isSafeInteger(balanceAfterFen) ? tr("users.ui.errAmountTooLarge")
    : balanceAfterFen < 0 ? tr("users.ui.errAmountExceeds")
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
      toast.error(err instanceof Error ? err.message : tr("users.ui.loadFailed"));
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
        toast.error(err instanceof Error ? err.message : tr("users.ui.statsFailed"));
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
      balance_amount_points: "",
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
      toast.success(tr(payload.balance_delta_fen ? "users.ui.adjustedSaved" : "users.ui.saved"));
      setEditing(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tr("users.ui.saveFailed"));
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
      <PageHeader title={tr("users.ui.title")} description={tr("users.ui.desc")} />

      <AdminFilterBar>
        <AdminSearchInput
          value={q}
          onChange={setQ}
          placeholder={tr("users.ui.searchPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{tr("users.ui.allRoles")}</option>
          <option value="user">{tr("users.ui.roleUser")}</option>
          <option value="admin">{tr("users.ui.roleAdmin")}</option>
        </Select>
        <Button size="sm" className="admin-filter-action" onClick={applyFilters} disabled={loading}>
          {tr(loading ? "users.ui.loading" : "users.ui.search")}
        </Button>
      </AdminFilterBar>

      <AdminListStats
        items={[
          { label: tr("users.ui.totalUsers"), value: stats?.user_count ?? (loading ? "…" : "—") },
          {
            label: tr("users.ui.callsMonth"),
            value: stats != null ? (stats.usage_calls_month ?? 0) : loading ? "…" : "—",
            hint: stats ? tr("users.ui.callsToday", { n: stats.usage_calls_today ?? 0 }) : undefined,
          },
          {
            label: tr("users.ui.callsTotal"),
            value: stats != null ? (stats.usage_calls_total ?? 0) : loading ? "…" : "—",
          },
        ]}
      />

      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("users.ui.colAccountId")}</TableHead>
              <TableHead>{tr("users.ui.colEmail")}</TableHead>
              <TableHead>{tr("users.ui.colNickname")}</TableHead>
              <TableHead>{tr("users.ui.colPhone")}</TableHead>
              <TableHead>{tr("users.ui.colPoints")}</TableHead>
              <TableHead>{tr("users.ui.colFrozen")}</TableHead>
              <TableHead>{tr("users.ui.colRole")}</TableHead>
              <TableHead>{tr("users.ui.colRegistered")}</TableHead>
              <TableHead className="w-[140px]">{tr("users.ui.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs text-[#909399]">{formatAccountId(u.id)}</TableCell>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>{u.nickname || "—"}</TableCell>
                <TableCell className="text-xs">{u.phone || "—"}</TableCell>
                <TableCell className="tabular-nums">{points(u.balance_fen)}</TableCell>
                <TableCell className="tabular-nums">{points(u.frozen_fen)}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "success" : "secondary"}>{tr(u.role === "admin" ? "users.ui.roleAdmin" : "users.ui.roleUser")}</Badge>
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
                      {tr("users.ui.view")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      {tr("users.ui.edit")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState title={tr("users.ui.empty")} description={tr("users.ui.emptyHint")} />
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
        title={tr("users.ui.editTitle")}
        subtitle={editing?.email}
        footer={
          <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>{tr("users.ui.cancel")}</Button>
            <Button type="submit" form={editFormId} disabled={saving || !hasChanges} aria-busy={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {tr(saving ? "users.ui.saving" : adjustBalance ? "users.ui.confirmAdjust" : "users.ui.saveRole")}
            </Button>
          </>
        }
      >
        <form id={editFormId} noValidate onSubmit={(event) => { event.preventDefault(); void saveEdit(); }} className="space-y-6">
          <div className="admin-form-summary grid gap-4 rounded-xl border border-[var(--admin-border)] bg-[#f7f9f4] p-4 sm:grid-cols-2">
            <div className="admin-form-summary-item"><div className="text-xs text-[var(--admin-muted)]">{tr("users.ui.currentPoints")}</div><div className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--admin-text)]">{points(editing?.balance_fen ?? 0)}</div></div>
            <div className="admin-form-summary-item"><div className="text-xs text-[var(--admin-muted)]">{tr("users.ui.frozenPoints")}</div><div className="mt-1.5 text-lg font-medium tabular-nums text-[var(--admin-text)]">{points(editing?.frozen_fen ?? 0)}</div><p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">{tr("users.ui.frozenNote")}</p></div>
          </div>
          <fieldset disabled={saving} className="admin-form-section min-w-0 space-y-4">
            <legend className="admin-form-section-title mb-1 text-sm font-semibold text-[var(--admin-text)]">{tr("users.ui.permissions")}</legend>
            <AdminField label={tr("users.ui.role")} required hint={tr("users.ui.roleHint")}>
              <Select value={form.role} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, role: e.target.value })); }} disabled={saving}>
                <option value="user">{tr("users.ui.roleUser")}</option><option value="admin">{tr("users.ui.roleAdmin")}</option>
              </Select>
            </AdminField>
          </fieldset>
          <section className="admin-form-section space-y-4 border-t border-[var(--admin-border)] pt-5">
            <div className="flex items-start justify-between gap-4">
              <div><label htmlFor={adjustmentToggleId} className="text-sm font-semibold text-[var(--admin-text)]">{tr("users.ui.adjustPoints")}</label><p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">{tr("users.ui.adjustPointsHint")}</p></div>
              <Switch id={adjustmentToggleId} checked={adjustBalance} disabled={saving} onCheckedChange={(checked) => { setAdjustBalance(checked); setSaveError(""); }} />
            </div>
            {adjustBalance ? <fieldset disabled={saving} className="min-w-0 space-y-4">
              <div className="admin-form-grid admin-form-grid--2">
                <AdminField label={tr("users.ui.direction")} required>
                  <Select value={form.balance_dir} disabled={saving} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, balance_dir: e.target.value === "decrease" ? "decrease" : "increase" })); }}>
                    <option value="increase">{tr("users.ui.increase")}</option><option value="decrease">{tr("users.ui.decrease")}</option>
                  </Select>
                </AdminField>
                <AdminField label={tr("users.ui.amount")} required hint={tr("users.ui.amountHint")} error={visibleAmountError}>
                  <Input inputMode="numeric" value={form.balance_amount_points} disabled={saving} placeholder={tr("users.ui.amountPlaceholder")} onBlur={() => setAmountTouched(true)} onChange={(e) => { setSaveError(""); setForm((f) => ({ ...f, balance_amount_points: e.target.value })); }} />
                </AdminField>
              </div>
              <AdminField label={tr("users.ui.note")} optional hint={tr("users.ui.noteHint")}>
                <Input value={form.balance_note} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, balance_note: e.target.value }))} placeholder={tr("users.ui.notePlaceholder")} />
              </AdminField>
              {!amountError && amountFen !== null ? <div className="admin-form-preview rounded-xl border border-[#d5e6d1] bg-[var(--admin-accent-soft)] p-4" aria-live="polite">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--admin-forest)]"><Wallet className="h-4 w-4" aria-hidden="true" />{tr("users.ui.pointsAfterSave")}</div>
                <div className="flex flex-wrap items-center gap-3 text-lg font-semibold tabular-nums text-[var(--admin-text)]"><span className="text-[var(--admin-muted)]">{points(editing?.balance_fen ?? 0)}</span><ArrowRight className="h-4 w-4 text-[var(--admin-muted)]" aria-hidden="true" /><span>{points(balanceAfterFen)}</span><span className="text-xs font-medium text-[var(--admin-forest)]">{tr(form.balance_dir === "decrease" ? "users.ui.minusN" : "users.ui.plusN", { amount: points(amountFen) })}</span></div>
              </div> : null}
            </fieldset> : null}
          </section>
          {saveError ? <p role="alert" className="admin-form-error rounded-lg border border-[#f0d9d5] bg-[#fcf0ee] px-3 py-2.5 text-sm leading-relaxed text-[#aa3d37]">{saveError}</p> : null}
        </form>
      </AdminModal>
    </div>
  );
}
