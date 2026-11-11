import { tr } from "../../i18n/translate.ts";
import { formatDateTime } from "../../i18n/detect.ts";
import { useEffect, useState, type FormEvent } from 'react'
import { Pin, Sparkles } from 'lucide-react'
import { AdminModal } from '@/components/admin/AdminModal'
import { PaginationBar } from '@/components/PaginationBar'
import { request, type Item, type Listing } from './api'
import { operationInteger } from './operationInputs'

type TargetType = 'work' | 'series'
type Curation = { target_type: TargetType; target_id: number; is_featured: boolean; is_pinned: boolean; pin_priority: number; version: number }
export type CurationTarget = Omit<Curation, 'version'> & { curation_version: number }
const base = '/api/admin/marketplace'

export function CurationControls({ targetType, targetId, isFeatured = false, isPinned = false, split = false, onSaved }: {
  targetType: TargetType; targetId: number; isFeatured?: boolean; isPinned?: boolean; split?: boolean; onSaved?: () => void
}) {
  const [action, setAction] = useState<'settings' | 'feature' | 'pin' | null>(null)
  return <>{split ? <>
    <button type="button" aria-pressed={isFeatured} onClick={() => setAction('feature')}><Sparkles size={14} />{tr(isFeatured ? 'mkOps.cur.unfeature' : 'mkOps.cur.feature')}</button>
    <button type="button" aria-pressed={isPinned} onClick={() => setAction('pin')}><Pin size={14} />{tr(isPinned ? 'mkOps.cur.unpin' : 'mkOps.cur.pin')}</button>
  </> : <button type="button" onClick={() => setAction('settings')}>{tr('mkOps.cur.settings')}</button>}
    {action && <CurationEditor targetType={targetType} targetId={targetId} initialAction={action} onClose={() => setAction(null)} onSaved={() => { setAction(null); onSaved?.() }} />}
  </>
}

function CurationEditor({ targetType, targetId, initialAction, onClose, onSaved }: {
  targetType: TargetType; targetId: number; initialAction: 'settings' | 'feature' | 'pin'; onClose: () => void; onSaved: () => void
}) {
  const [value, setValue] = useState<Curation | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [priority, setPriority] = useState('100')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setValue(null)
    request<Curation>(`${base}/curation/${targetType}/${targetId}`).then(result => {
      if (active) {
        setValue({ ...result, is_featured: initialAction === 'feature' ? !result.is_featured : result.is_featured,
          is_pinned: initialAction === 'pin' ? !result.is_pinned : result.is_pinned })
        setPriority(String(result.pin_priority))
      }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [targetType, targetId, initialAction, revision])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!value) return
    const form = new FormData(event.currentTarget)
    setError('')
    try {
      const reason = String(form.get('reason') || '').trim()
      if (!reason) throw new Error(tr('mkOps.cur.errReason'))
      const pinPriority = operationInteger(priority, 9999)
      setBusy(true)
      await request(`${base}/curation/${targetType}/${targetId}`, 'PATCH', { version: value.version, is_featured: value.is_featured, is_pinned: value.is_pinned, pin_priority: pinPriority, reason })
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <AdminModal className="market-ops-operation-modal" open onOpenChange={next => { if (!next && !busy) onClose() }} title={tr('mkOps.cur.title')} subtitle={tr(targetType === 'work' ? 'mkOps.cur.workN' : 'mkOps.cur.seriesFullN', { id: targetId })} size="lg">
    {error && <p className="market-ops-feedback is-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => setRevision(v => v + 1)}>{tr('mkOps.cur.reloadConfig')}</button></p>}
    {!value ? !error && <p role="status">{tr('mkOps.cur.loadingConfig')}</p> : <form className="market-ops-support market-ops-modal-form" onSubmit={save}>
      <p>{tr('mkOps.cur.note')}</p>
      <label><input type="checkbox" checked={value.is_featured} disabled={busy} onChange={event => setValue({ ...value, is_featured: event.target.checked })} /> {tr('mkOps.cur.featureHint')}</label>
      <label><input type="checkbox" checked={value.is_pinned} disabled={busy} onChange={event => setValue({ ...value, is_pinned: event.target.checked })} /> {tr('mkOps.cur.pinHint')}</label>
      <label>{tr('mkOps.cur.priorityHint')}<input inputMode="numeric" value={priority} disabled={busy} onChange={event => setPriority(event.target.value)} /></label>
      <label>{tr('mkOps.cur.reason')}<textarea name="reason" required maxLength={300} disabled={busy} /></label><div className="flex gap-3"><button type="submit" disabled={busy}>{tr(busy ? 'mkOps.saving' : 'mkOps.cur.saveConfig')}</button><button type="button" disabled={busy} onClick={onClose}>{tr('mkOps.cancel')}</button></div>
    </form>}
  </AdminModal>
}

export function CurationBatchActions({ items, onSaved }: { items: CurationTarget[]; onSaved: () => void }) {
  const [action, setAction] = useState('feature')
  const [priority, setPriority] = useState('100')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    if (!items.length || busy) return
    try {
      if (!reason.trim()) throw new Error(tr('mkOps.cur.errBatchReason'))
      const pinPriority = operationInteger(priority, 9999)
      const changes = items.map(item => ({ target_type: item.target_type, target_id: item.target_id, version: item.curation_version,
        is_featured: action === 'feature' ? true : action === 'unfeature' ? false : item.is_featured,
        is_pinned: action === 'pin' ? true : action === 'unpin' ? false : item.is_pinned,
        pin_priority: action === 'pin' ? pinPriority : item.pin_priority }))
      setBusy(true)
      const result = await request<{ items: Array<{ target_id: number; target_type: string; ok: boolean; error?: { message?: string } }> }>(`${base}/curation/batch`, 'POST', { items: changes, reason: reason.trim() })
      const failed = result.items.filter(item => !item.ok)
      setMessage(tr('mkOps.cur.batchDone', { n: result.items.length - failed.length }) + (failed.length ? tr('mkOps.cur.batchFailed', { n: failed.length, items: failed.map(item => `${tr(item.target_type === 'series' ? 'mkOps.cur.seriesN' : 'mkOps.cur.workN', { id: item.target_id })} ${item.error?.message || tr('mkOps.cur.refreshRetry')}`).join(tr('mkOps.listSep')) }) : ''))
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <details className="market-ops-record market-ops-bulk"><summary>{tr('mkOps.cur.batchSummary', { n: items.length })}</summary>
    <form className="market-ops-inline-form" onSubmit={save}>
      <label>{tr('mkOps.cur.batchAction')}<select value={action} disabled={busy} onChange={event => setAction(event.target.value)}><option value="feature">{tr('mkOps.cur.feature')}</option><option value="unfeature">{tr('mkOps.cur.unfeature')}</option><option value="pin">{tr('mkOps.cur.pin')}</option><option value="unpin">{tr('mkOps.cur.unpin')}</option></select></label>
      {action === 'pin' && <label>{tr('mkOps.cur.priority')}<input inputMode="numeric" value={priority} disabled={busy} onChange={event => setPriority(event.target.value)} /></label>}
      <label>{tr('mkOps.cur.reason')}<input required maxLength={300} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      <button type="submit" disabled={busy || !items.length}>{busy ? tr('mkOps.processing') : tr('mkOps.cur.applyN', { n: items.length })}</button>
    </form>
    {error && <p className="market-ops-feedback is-error" role="alert">{error}</p>}{message && <p className="market-ops-feedback" role="status">{message}</p>}
  </details>
}

export function CurationHistoryPanel({ revision }: { revision: number }) {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true; setData(null); setError('')
    request<Listing>(`${base}/curation/events?${new URLSearchParams({ ...(type ? { target_type: type } : {}), page: String(page), page_size: '20' })}`)
      .then(value => { if (active) setData(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [type, page, revision])
  return <section className="market-ops-record"><div className="market-ops-record-head"><h3>{tr('mkOps.cur.historyTitle')}</h3><select aria-label={tr('mkOps.cur.historyType')} value={type} onChange={event => { setType(event.target.value); setPage(1) }}><option value="">{tr('mkOps.allTypes')}</option><option value="work">{tr('mkOps.cur.work')}</option><option value="series">{tr('mkOps.cur.seriesFull')}</option></select></div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">{tr('mkOps.cur.historyLoading')}</p> : data.items.length ? <>
      <div className="market-ops-table-scroll"><table className="market-ops-metrics-table"><thead><tr><th>{tr('mkOps.cur.colWork')}</th><th>{tr('mkOps.colOperator')}</th><th>{tr('mkOps.colReason')}</th><th>{tr('mkOps.colTime')}</th><th>{tr('mkOps.cur.colChange')}</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td>{tr(item.target_type === 'series' ? 'mkOps.cur.seriesN' : 'mkOps.cur.workN', { id: String(item.target_id) })}</td><td>#{String(item.operator_id || '')}</td><td>{String(item.reason || '')}</td><td>{formatDateTime(String(item.created_at))}</td><td><CurationHistory item={item} /></td></tr>)}</tbody></table></div>
      <PaginationBar page={page} pageSize={data.meta.page_size} total={data.meta.total} onPageChange={setPage} />
    </> : <p>{tr('mkOps.cur.historyEmpty')}</p>}
  </section>
}

function CurationHistory({ item }: { item: Item }) {
  const display = (value: unknown) => { const state = typeof value === 'object' && value ? value as Record<string, unknown> : {}; return tr('mkOps.cur.stateLine', { pin: tr(state.is_pinned ? 'mkOps.cur.pinned' : 'mkOps.cur.notPinned'), feature: tr(state.is_featured ? 'mkOps.cur.featured' : 'mkOps.cur.normal'), priority: String(state.pin_priority ?? 100) }) }
  return <span>{display(item.before)} → {display(item.after)}</span>
}
