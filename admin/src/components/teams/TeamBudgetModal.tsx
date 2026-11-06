import { useId, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { setAdminTeamBudget } from "@/api/teams";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminField } from "@/components/admin/AdminField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { yuanInputToFen } from "@/lib/moneyInput";
import { fenToYuan } from "@/lib/utils";

/** 设置团队或成员月上限，零元停用新消费，空值代表不限额。 */
export function TeamBudgetModal({ teamId, memberId, name, limit, onClose, onSaved }: {
  teamId: number; memberId?: number; name: string; limit: number | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [unlimited, setUnlimited] = useState(limit === null);
  const [amount, setAmount] = useState(limit === null ? "" : fenToYuan(limit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const pending = useRef(false);
  const formId = useId();
  const modeName = useId();
  const amountFen = yuanInputToFen(amount);
  const amountError = unlimited ? "" : !amount.trim()
    ? "Vui lòng nhập hạn mức chi tiêu hằng tháng"
    : amountFen === null ? "Vui lòng nhập số tiền không âm, tối đa hai chữ số thập phân"
    : amountFen > 100000000 ? "Hạn mức chi tiêu hằng tháng không được vượt quá 1.000.000 tệ"
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
    catch (cause) { setError(cause instanceof Error ? cause.message : "Lưu hạn mức thất bại"); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <AdminModal
      open
      onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}
      size="lg"
      title={memberId === undefined ? "Hạn mức chi tiêu hằng tháng của nhóm" : "Hạn mức chi tiêu hằng tháng của thành viên"}
      subtitle={name}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button>
        <Button type="submit" form={formId} disabled={busy || !changed} aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Đang lưu…" : "Lưu hạn mức chi tiêu"}
        </Button>
      </>}
    >
      <form id={formId} noValidate onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-5">
        <div className="admin-form-summary rounded-xl border border-[var(--admin-border)] bg-[#f7f9f4] px-4 py-3">
          <div className="text-xs text-[var(--admin-muted)]">Hạn mức chi tiêu hằng tháng hiện tại</div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--admin-text)]">{limit === null ? "Không giới hạn" : `¥${fenToYuan(limit)}`}</div>
        </div>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <legend className="mb-3 text-sm font-semibold text-[var(--admin-text)]">Cách giới hạn chi tiêu</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`admin-choice-card flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${!unlimited ? "border-[var(--admin-forest)] bg-[var(--admin-accent-soft)]" : "border-[var(--admin-border)] bg-white"} ${busy ? "opacity-60" : ""}`}>
              <input type="radio" name={modeName} value="limited" checked={!unlimited} disabled={busy} onChange={() => { setUnlimited(false); setError(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-forest)]" />
              <span><span className="block text-sm font-semibold text-[var(--admin-text)]">Đặt hạn mức hằng tháng</span><span className="mt-1 block text-xs leading-relaxed text-[var(--admin-muted)]">Khi đạt hạn mức sẽ tạm dừng các yêu cầu chi tiêu mới</span></span>
            </label>
            <label className={`admin-choice-card flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${unlimited ? "border-[var(--admin-forest)] bg-[var(--admin-accent-soft)]" : "border-[var(--admin-border)] bg-white"} ${busy ? "opacity-60" : ""}`}>
              <input type="radio" name={modeName} value="unlimited" checked={unlimited} disabled={busy} onChange={() => { setUnlimited(true); setError(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-forest)]" />
              <span><span className="block text-sm font-semibold text-[var(--admin-text)]">Không giới hạn</span><span className="mt-1 block text-xs leading-relaxed text-[var(--admin-muted)]">Không đặt thêm{memberId === undefined ? "Nhóm" : "Thành viên này"}Hạn mức chi tiêu hằng tháng</span></span>
            </label>
          </div>
        </fieldset>
        <AdminField label="Hạn mức chi tiêu hằng tháng (tệ)" required={!unlimited} hint={unlimited ? "Đã chọn không giới hạn, không cần nhập số tiền." : "Có thể đặt 0–1.000.000 tệ, tối đa hai chữ số thập phân; 0 tệ nghĩa là dừng chi tiêu mới."} error={visibleAmountError}>
          <Input value={amount} inputMode="decimal" placeholder={unlimited ? "Không giới hạn, không cần nhập" : "Ví dụ 1000.00"} disabled={unlimited || busy} onBlur={() => setAmountTouched(true)} onChange={(event) => { setAmount(event.target.value); setError(""); }} />
        </AdminField>
        <div className="admin-form-notice flex items-start gap-2.5 rounded-xl border border-[var(--admin-border)] bg-[#f8f9f5] p-4 text-xs leading-7 text-[var(--admin-muted)]">
          <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p>Thống kê theo tháng dương lịch múi giờ Thượng Hải; số tiền đã chi và số tiền giữ chỗ đang chạy đều chiếm hạn mức.</p>
            <p>{memberId === undefined ? "Hạn mức nhóm thống kê chi tiêu của tất cả thành viên; hạn mức riêng của thành viên cũng có hiệu lực đồng thời." : "Chi tiêu của thành viên đồng thời bị giới hạn bởi hạn mức cá nhân và tổng hạn mức nhóm."}Giảm hạn mức sẽ không hủy các tác vụ đã được tiếp nhận.</p>
            <p>Phí được trừ từ tài khoản cá nhân của chủ nhóm tại thời điểm tiếp nhận; đặt hạn mức không điều chỉnh số dư tài khoản.</p>
          </div>
        </div>
        {error ? <p role="alert" className="admin-form-error rounded-lg border border-[#f0d9d5] bg-[#fcf0ee] px-3 py-2.5 text-sm leading-relaxed text-[#aa3d37]">{error}</p> : null}
      </form>
    </AdminModal>
  );
}
