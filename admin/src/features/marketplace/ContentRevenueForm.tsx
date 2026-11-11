import { tr } from "../../i18n/translate.ts";
import { useState, type FormEvent } from 'react'
import { request, type Item } from './api'

export default function ContentRevenueForm({ item, kind }: { item: Item; kind: 'work' | 'series' | 'series_episode' }) {
  const [saved, setSaved] = useState<number | null>(typeof item.share_bps === 'number' ? item.share_bps : null)
  const [value, setValue] = useState(saved === null ? '' : String(saved))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 10000)) { setMessage(tr('mkOps.revenue.errRange')); return }
    if (!reason.trim()) { setMessage(tr('mkOps.revenue.errReason')); return }
    setBusy(true); setMessage('')
    try {
      const result = await request<{ share_bps: number | null }>(`/api/admin/marketplace/content-revenue/${kind}/${item.id}`, 'PATCH', {
        version: item.version, previous_share_bps: saved, share_bps: value === '' ? null : Number(value), reason: reason.trim(),
      })
      setSaved(result.share_bps); setReason(''); setMessage(tr('mkOps.revenue.saved'))
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-inline-form" onSubmit={save}>
    <h3>{tr(kind === 'series_episode' ? 'mkOps.revenue.titleEpisode' : kind === 'series' ? 'mkOps.revenue.titleSeries' : 'mkOps.revenue.titleWork')}</h3>
    <p>{tr(kind === 'series_episode' ? 'mkOps.revenue.descEpisode' : 'mkOps.revenue.descPlatform')}</p>
    <label>{tr('mkOps.revenue.platformBps')}<input type="text" inputMode="numeric" value={value} onChange={event => setValue(event.target.value)} placeholder={tr('mkOps.revenue.inheritPlaceholder')} /></label>
    {value !== '' && /^\d+$/.test(value) && Number(value) <= 10000 && <p>{tr('mkOps.revenue.split', { platform: Number(value) / 100, creator: (10000 - Number(value)) / 100 })}</p>}
    <label>{tr('mkOps.revenue.reason')}<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={2000} /></label>
    <button type="submit" disabled={busy}>{tr(busy ? 'mkOps.saving' : 'mkOps.revenue.save')}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
