import { useId, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { setAdminTeamBudget } from "@/api/teams";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminField } from "@/components/admin/AdminField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parsePoints } from "@/lib/points";
import { points } from "@/lib/points";
import { tr } from "../../i18n/translate.ts";

/** 设置团队或成员月上限，零元停用新消费，空值代表不限额。 */
export function TeamBudgetModal({ teamId, memberId, name, limit, onClose, onSaved }: {
  teamId: number; memberId?: number; name: string; limit: number | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [unlimited, setUnlimited] = useState(limit === null);
  const [amount, setAmount] = useState(limit === null ? "" : String(limit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const pending = useRef(false);
  const formId = useId();
  const modeName = useId();
  const amountFen = parsePoints(amount);
  const amountError = unlimited ? "" : !amount.trim()
    ? tr("teamsUi.errLimitRequired")
    : amountFen === null ? tr("teamsUi.errLimitInvalid")
    : amountFen > 100000000 ? tr("teamsUi.errLimitTooLarge")
    : "";
  const nextLimit = unlimited ? null : amountFen;
  const changed = unlimited ? limit !== null : amountError !== "" || nextLimit !== limit;
  const visibleAmountError = amountTouched || submitAttempted ? amountError : "";

  /** 保存金额只接受两位小数，精确转换为整数分，重复点击不重复请求。 */
  async function save() {
    if (pending.current || !changed) return;
    setSubmitAttempted(true);
    setError("");
    if (amountError) return;
    pending.current = true; setBusy(true); setError("");
    try { await setAdminTeamBudget(teamId, nextLimit, memberId); onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("teamsUi.saveLimitFailed")); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <AdminModal
      open
      onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}
      size="lg"
      title={tr(memberId === undefined ? "teamsUi.teamLimitTitle" : "teamsUi.memberLimitTitle")}
      subtitle={name}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{tr("teamsUi.cancel")}</Button>
        <Button type="submit" form={formId} disabled={busy || !changed} aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {tr(busy ? "teamsUi.saving" : "teamsUi.saveLimit")}
        </Button>
      </>}
    >
      <form id={formId} noValidate onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-5">
        <div className="admin-form-summary rounded-xl border border-[var(--admin-border)] bg-[#f7f9f4] px-4 py-3">
          <div className="text-xs text-[var(--admin-muted)]">{tr("teamsUi.currentLimit")}</div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--admin-text)]">{limit === null ? tr("teamsUi.unlimited") : points(limit)}</div>
        </div>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <legend className="mb-3 text-sm font-semibold text-[var(--admin-text)]">{tr("teamsUi.limitMode")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`admin-choice-card flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${!unlimited ? "border-[var(--admin-forest)] bg-[var(--admin-accent-soft)]" : "border-[var(--admin-border)] bg-white"} ${busy ? "opacity-60" : ""}`}>
              <input type="radio" name={modeName} value="limited" checked={!unlimited} disabled={busy} onChange={() => { setUnlimited(false); setError(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-forest)]" />
              <span><span className="block text-sm font-semibold text-[var(--admin-text)]">{tr("teamsUi.setMonthly")}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--admin-muted)]">{tr("teamsUi.setMonthlyHint")}</span></span>
            </label>
            <label className={`admin-choice-card flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${unlimited ? "border-[var(--admin-forest)] bg-[var(--admin-accent-soft)]" : "border-[var(--admin-border)] bg-white"} ${busy ? "opacity-60" : ""}`}>
              <input type="radio" name={modeName} value="unlimited" checked={unlimited} disabled={busy} onChange={() => { setUnlimited(true); setError(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-forest)]" />
              <span><span className="block text-sm font-semibold text-[var(--admin-text)]">{tr("teamsUi.unlimitedOption")}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--admin-muted)]">{tr(memberId === undefined ? "teamsUi.unlimitedTeamHint" : "teamsUi.unlimitedMemberHint")}</span></span>
            </label>
          </div>
        </fieldset>
        <AdminField label={tr("teamsUi.limitField")} required={!unlimited} hint={tr(unlimited ? "teamsUi.limitFieldUnlimited" : "teamsUi.limitFieldHint")} error={visibleAmountError}>
          <Input value={amount} inputMode="numeric" placeholder={tr(unlimited ? "teamsUi.limitPlaceholderUnlimited" : "teamsUi.limitPlaceholder")} disabled={unlimited || busy} onBlur={() => setAmountTouched(true)} onChange={(event) => { setAmount(event.target.value); setError(""); }} />
        </AdminField>
        <div className="admin-form-notice flex items-start gap-2.5 rounded-xl border border-[var(--admin-border)] bg-[#f8f9f5] p-4 text-xs leading-7 text-[var(--admin-muted)]">
          <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{tr("teamsUi.noteMonth")}</p>
            <p>{tr(memberId === undefined ? "teamsUi.noteTeam" : "teamsUi.noteMember")}</p>
            <p>{tr("teamsUi.noteCharge")}</p>
          </div>
        </div>
        {error ? <p role="alert" className="admin-form-error rounded-lg border border-[#f0d9d5] bg-[#fcf0ee] px-3 py-2.5 text-sm leading-relaxed text-[#aa3d37]">{error}</p> : null}
      </form>
    </AdminModal>
  );
}
