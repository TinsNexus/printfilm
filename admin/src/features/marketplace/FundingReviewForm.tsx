import { tr } from "../../i18n/translate.ts";
import { useRef, useState, type FormEvent } from 'react'
import { request } from './api'
import { appAmountFen } from './appPresentation'

/** 以真实Web收款报告核对资金来源，页面不具备伪造充值或修改余额的能力。 */
export default function FundingReviewForm({ environment, onSaved }: { environment: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const lotId = Number(form.get('lot_id'))
      if (!Number.isSafeInteger(lotId) || lotId <= 0) throw new Error(tr('mkOps.funding.errLotId'))
      const values = { lot_id: lotId, channel_fee_fen: appAmountFen(form.get('fee')),
        tax_fen: appAmountFen(form.get('tax')), received_fen: appAmountFen(form.get('received'), true, true),
        note: String(form.get('note')).trim() }
      const fingerprint = JSON.stringify(values)
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
      if (!window.confirm(tr('mkOps.funding.confirm'))) return
      setBusy(true)
      await request('/api/admin/marketplace/app/funding-reviews', 'POST', { ...values, idempotency_key: attempt.current.key })
      attempt.current = null; setMessage(tr('mkOps.funding.saved')); onSaved()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support max-w-none" onSubmit={save}>
    <h3>{tr('mkOps.funding.title')}</h3><p>{tr('mkOps.funding.desc')}</p>
    <div className="grid gap-4 md:grid-cols-4">
      <label>{tr('mkOps.funding.lotId')}<input name="lot_id" type="number" min="1" step="1" required /></label>
      <label>{tr('mkOps.funding.fee')}<input name="fee" type="number" min="0" step="0.01" required /></label>
      <label>{tr('mkOps.funding.tax')}<input name="tax" type="number" min="0" step="0.01" required /></label>
      <label>{tr('mkOps.funding.received')}<input name="received" type="number" step="0.01" required /></label>
    </div>
    <label>{tr('mkOps.funding.note')}<textarea name="note" required maxLength={3000} rows={3} placeholder={tr('mkOps.funding.notePlaceholder')} /></label>
    <button type="submit" disabled={busy || environment !== 'Production'}>{tr(busy ? 'mkOps.saving' : 'mkOps.funding.submit')}</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form>
}
