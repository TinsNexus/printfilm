import { tr } from "../../i18n/translate.ts";
import { useEffect, useState, type FormEvent } from 'react'
import { request } from './api'

type Rate = { id: number; cny_per_unit: string; source: string }
const base = '/api/admin/marketplace/app'

export default function AppleValuationForm({ onSaved }: { onSaved: () => void }) {
  const [rates, setRates] = useState<Rate[]>([])
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    request<{items: Rate[]}>(`${base}/exchange-rates`).then(data => { if (active) setRates(data.items) }).catch(error => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [revision])
  async function save(event: FormEvent<HTMLFormElement>, valuation: boolean) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setMessage('')
    try {
      if (valuation) {
        await request(`${base}/transactions/${Number(data.get('transaction_id'))}/valuation`, 'POST', { rate_id: Number(data.get('rate_id')) })
        setMessage(tr('mkOps.apple.valuationDone'))
      } else {
        await request(`${base}/exchange-rates`, 'POST', { cny_per_unit: String(data.get('rate')), source: String(data.get('source')).trim() })
        setMessage(tr('mkOps.apple.rateSaved'))
      }
      setRevision(value => value + 1); onSaved()
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="market-ops-support">
    <h3>{tr('mkOps.apple.title')}</h3>
    <p>{tr('mkOps.apple.desc')}</p>
    <form onSubmit={event => void save(event, false)} className="grid gap-3 md:grid-cols-3">
      <label>{tr('mkOps.apple.cnyPerUsd')}<input name="rate" required type="number" min="0.000001" max="1000000" step="0.000001" /></label>
      <label>{tr('mkOps.apple.rateSource')}<input name="source" required maxLength={500} /></label>
      <button disabled={busy}>{tr('mkOps.apple.addRate')}</button>
    </form>
    <form onSubmit={event => void save(event, true)} className="grid gap-3 md:grid-cols-3">
      <label>{tr('mkOps.apple.transactionId')}<input name="transaction_id" required type="number" min="1" step="1" /></label>
      <label>{tr('mkOps.apple.rateVersion')}<select name="rate_id" required>{rates.map(rate => <option key={rate.id} value={rate.id}>#{rate.id} · {rate.cny_per_unit} · {rate.source}</option>)}</select></label>
      <button disabled={busy || !rates.length}>{tr('mkOps.apple.fillValuation')}</button>
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}
