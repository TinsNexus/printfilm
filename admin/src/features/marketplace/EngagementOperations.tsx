import { tr } from "../../i18n/translate.ts";
import { formatDateTime, formatNumber } from "../../i18n/detect.ts";
import { useEffect, useState, type FormEvent } from 'react'
import { PaginationBar } from '@/components/PaginationBar'
import { AdminModal } from '@/components/admin/AdminModal'
import { Bookmark, Film, Heart, History, Play, RefreshCw, Search, Share2, SlidersHorizontal } from 'lucide-react'
import { request, assetUrl } from './api'
import { displayMetricsInput } from './operationInputs'
import { CurationBatchActions, CurationControls, CurationHistoryPanel, type CurationTarget } from './CurationOperations'

type Counts = Record<'like_count' | 'favorite_count' | 'share_count', number>
type Metric = { target_type: 'work' | 'series' | 'series_episode'; target_id: number; title: string; version: number; real: Counts; initial: Counts; display: Counts;
  author: string; owner_id: number; category: string; cover_asset_id: number | null; asset_id: number | null; series_title?: string | null; episode_no?: number | null;
  audit_status: string; listed: boolean; blocked: boolean; is_featured: boolean; is_pinned: boolean; pin_priority: number; curation_version: number; updated_at?: string; updated_by?: number }
type Job = { id: number; status: string; total: number; processed: number; initialized: number; skipped: number; failed: number; errors?: unknown[] }
const base = '/api/admin/marketplace/app/social'
// getter：读取时按当前语言取文案（模块级常量不能存已翻译文字）
const labels = {
  get like_count() { return tr('mkOps.eng.like') },
  get favorite_count() { return tr('mkOps.eng.favorite') },
  get share_count() { return tr('mkOps.eng.share') },
}
const targetNames: Record<string, string> = {
  get work() { return tr('mkOps.cur.work') },
  get series_episode() { return tr('mkApp.label.series_episode') },
  get series() { return tr('mkOps.cur.seriesFull') },
}
const number = (value: number) => formatNumber(value)
const JOB_STATUSES = ['pending', 'queued', 'running', 'completed', 'done', 'failed', 'partial', 'completed_with_errors']
const AUDIT_STATUSES = ['draft', 'pending', 'rejected', 'approved']
const AUDIT_ACTIONS = ['initialize', 'adjust', 'clear']
const metricKey = (item: Metric) => `${item.target_type}:${item.target_id}`

export default function EngagementOperations({ revision = 0 }: { revision?: number }) {
  const [target, setTarget] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [curation, setCuration] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [showEvents, setShowEvents] = useState(false)
  const [previewing, setPreviewing] = useState<Metric | null>(null)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [listing, setListing] = useState<{ items: Metric[]; total: number; page_size: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Metric | null>(null)
  const [history, setHistory] = useState<Metric | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<number | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [jobId, setJobId] = useState('')
  const [jobTarget, setJobTarget] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setListing(null); setSelected([])
    request<typeof listing>(`${base}/metrics?${new URLSearchParams({ page: String(page), page_size: '20', ...(target ? { target_type: target } : {}), q: query, curation })}`)
      .then(value => { if (active) setListing(value) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [target, query, curation, page, refresh, revision])
  useEffect(() => {
    if (!job || !['pending', 'running', 'queued'].includes(job.status)) return
    let active = true
    const timer = window.setTimeout(() => {
      request<Job>(`${base}/initialization-jobs/${job.id}`).then(value => { if (active) { setJob(value); if (!['pending', 'running', 'queued'].includes(value.status)) setRefresh(v => v + 1) } }).catch(e => { if (active) setError(e.message) })
    }, 2500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [job])
  async function initialize(previewOnly: boolean) {
    if (!previewOnly && !reason.trim()) { setError(tr('mkOps.eng.errInitReason')); return }
    setBusy(true); setError('')
    try {
      const result = await request<Job & { preview?: boolean; total: number }>(`${base}/initialization-jobs`, 'POST', { preview: previewOnly, ...(jobTarget ? { target_type: jobTarget } : {}), reason: reason.trim() || tr('mkOps.eng.previewReason') })
      if (previewOnly) setPreview(result.total)
      else { setJob(result); setJobId(String(result.id)); setPreview(null) }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function loadJob(retry = false) {
    if (!/^\d+$/.test(jobId)) { setError(tr('mkOps.eng.errJobId')); return }
    setBusy(true); setError('')
    try { setJob(await request<Job>(`${base}/initialization-jobs/${jobId}${retry ? '/retry' : ''}`, retry ? 'POST' : 'GET')); setRefresh(v => v + 1) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const selectable = listing?.items.filter(item => item.target_type !== 'series_episode') || []
  const batchItems = selectable.filter(item => selected.includes(metricKey(item))).map(item => ({ ...item, target_type: item.target_type as 'work' | 'series' })) satisfies CurationTarget[]
  return <section className="market-ops-engagement">
    <header className="market-ops-content-heading"><div><span>{tr('mkOps.eng.kicker')}</span><h2>{tr('mkOps.eng.title')}</h2><p>{tr('mkOps.eng.desc')}</p></div><button type="button" aria-expanded={showEvents} onClick={() => setShowEvents(value => !value)}><History size={15} />{tr(showEvents ? 'mkOps.eng.hideEvents' : 'mkOps.eng.events')}</button></header>
    <form className="market-ops-content-filters" onSubmit={event => { event.preventDefault(); setQuery(q.trim()); setPage(1); setRefresh(value => value + 1) }}>
      <div className="market-ops-type-tabs" aria-label={tr('mkOps.eng.typeTabs')}>{[['', tr('mkOps.eng.allWorks')], ...Object.entries(targetNames)].map(([value, label]) => <button key={value} type="button" aria-pressed={target === value} onClick={() => { setTarget(value); if (value === 'series_episode') setCuration(''); setPage(1) }}>{label}</button>)}</div>
      <div className="market-ops-content-search"><label><Search size={17} /><input aria-label={tr('mkOps.eng.searchLabel')} value={q} maxLength={100} onChange={event => setQ(event.target.value)} placeholder={tr('mkOps.eng.searchPlaceholder')} /></label><select aria-label={tr('mkOps.eng.curationState')} value={curation} disabled={target === 'series_episode'} onChange={event => { setCuration(event.target.value); setPage(1) }}><option value="">{tr('mkOps.eng.allCuration')}</option><option value="featured">{tr('mkOps.eng.isFeatured')}</option><option value="pinned">{tr('mkOps.eng.isPinned')}</option><option value="normal">{tr('mkOps.eng.isNormal')}</option></select><button type="submit"><Search size={15} />{tr('mkOps.search')}</button><button type="button" aria-label={tr('mkOps.eng.refresh')} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /></button></div>
    </form>
    <div className="market-ops-content-toolbar"><span>{loading ? tr('mkOps.eng.updating') : tr('mkOps.eng.totalN', { n: number(listing?.total || 0) })}</span><label><input type="checkbox" disabled={!selectable.length} checked={!!selectable.length && selected.length === selectable.length} onChange={event => setSelected(event.target.checked ? selectable.map(metricKey) : [])} />{tr('mkOps.eng.selectPage')}</label></div>
    <CurationBatchActions items={batchItems} onSaved={() => setRefresh(value => value + 1)} />
    <details className="market-ops-record"><summary>{tr('mkOps.eng.initSummary')}</summary><div className="market-ops-inline-form">
      <label>{tr('mkOps.eng.initScope')}<select value={jobTarget} disabled={busy} onChange={event => { setJobTarget(event.target.value); setPreview(null) }}><option value="">{tr('mkOps.eng.workAndEpisode')}</option><option value="work">{tr('mkOps.cur.work')}</option><option value="series_episode">{tr('mkApp.label.series_episode')}</option></select></label>
      <label>{tr('mkOps.eng.opReason')}<input value={reason} maxLength={300} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void initialize(true)}>{tr('mkOps.eng.previewCount')}</button><button type="button" disabled={busy || preview === null || preview === 0} onClick={() => void initialize(false)}>{tr('mkOps.eng.createJob')}</button>
      {preview !== null && <p role="status">{tr('mkOps.eng.previewResult', { n: number(preview) })}</p>}
      <label>{tr('mkOps.eng.jobId')}<input inputMode="numeric" value={jobId} onChange={event => setJobId(event.target.value)} placeholder={tr('mkOps.eng.jobIdPlaceholder')} /></label><button type="button" disabled={busy} onClick={() => void loadJob()}>{tr('mkOps.eng.queryJob')}</button>
    </div>{job && <div className="market-ops-feedback" role="status"><strong>{tr('mkOps.cur.taskN', { id: job.id })} · {JOB_STATUSES.includes(job.status) ? tr(`mkOps.eng.job.${job.status}`) : job.status}</strong><p>{tr('mkOps.eng.jobStats', { total: job.total, processed: job.processed, initialized: job.initialized, skipped: job.skipped, failed: job.failed })}</p>{!!job.failed && <button type="button" disabled={busy} onClick={() => void loadJob(true)}>{tr('mkOps.eng.retryFailed')}</button>}{job.errors?.length ? <ul>{job.errors.map((item, index) => <li key={index}>{typeof item === 'string' ? item : typeof item === 'object' && item ? String((item as Record<string, unknown>).message || (item as Record<string, unknown>).error || tr('mkOps.eng.failedSeeLogs')) : tr('mkApp.label.failed')}</li>)}</ul> : null}</div>}</details>
    {error && <p className="market-ops-feedback is-error" role="alert">{error}</p>}
    {loading ? <div className="market-ops-content-grid" role="status" aria-label={tr('mkOps.eng.loadingWorks')}>{[0, 1, 2, 3].map(value => <div className="market-ops-content-skeleton" key={value}><div /><span /><span /></div>)}</div> : listing?.items.length ? <div className="market-ops-content-grid">{listing.items.map(item => <article className="market-ops-content-card" key={metricKey(item)}>
      <div className="market-ops-content-cover"><OperationCover assetId={item.cover_asset_id} /><span className="market-ops-content-type">{targetNames[item.target_type]}</span><span className={`market-ops-content-status${item.blocked ? ' is-blocked' : ''}`}>{item.blocked ? tr('mkOps.eng.restricted') : item.audit_status === 'approved' && item.listed ? tr('mkOps.eng.listed') : AUDIT_STATUSES.includes(item.audit_status) ? tr(`mkOps.eng.audit.${item.audit_status}`) : tr('mkOps.eng.audit.approved')}</span>
        {item.target_type !== 'series_episode' && <label className="market-ops-content-pick"><input type="checkbox" aria-label={tr('mkOps.eng.selectItem', { title: item.title })} checked={selected.includes(metricKey(item))} onChange={event => setSelected(value => event.target.checked ? [...value, metricKey(item)] : value.filter(key => key !== metricKey(item)))} /></label>}
        {item.asset_id && <button type="button" className="market-ops-content-play" aria-label={tr('mkOps.eng.previewItem', { title: item.title })} onClick={() => setPreviewing(item)}><Play size={18} /></button>}
      </div>
      <div className="market-ops-content-body"><div className="market-ops-content-meta"><span>{item.category || targetNames[item.target_type]} · #{item.target_id}</span><div className="market-ops-curation-tags">{item.is_pinned && <span>{tr('mkOps.cur.pin')}</span>}{item.is_featured && <span>{tr('mkOps.cur.featured')}</span>}</div></div><h3 title={item.title}>{item.title}</h3>
        {item.series_title && <p className="market-ops-content-series" title={item.series_title}>{tr('mkOps.eng.seriesEpisode', { series: item.series_title, n: String(item.episode_no) })}</p>}
        <p className="market-ops-content-author"><span>{(item.author || tr('mkOps.eng.creator')).slice(0, 1)}</span>{item.author || tr('mkOps.eng.creator')}<small>#{item.owner_id}</small></p>
        <div className="market-ops-content-counts">{([[ 'like_count', Heart ], [ 'favorite_count', Bookmark ], [ 'share_count', Share2 ]] as const).map(([key, Icon]) => <div key={key}><span><Icon size={14} />{labels[key]}</span><strong>{number(item.display[key])}</strong><small>{tr('mkOps.eng.realN', { n: number(item.real[key]) })}</small><small>{tr('mkOps.eng.initialN', { n: number(item.initial[key]) })}</small></div>)}</div>
        <div className="market-ops-content-actions">{item.target_type !== 'series_episode' && <CurationControls split targetType={item.target_type} targetId={item.target_id} isFeatured={item.is_featured} isPinned={item.is_pinned} onSaved={() => setRefresh(value => value + 1)} />}
          {item.target_type !== 'series' && <button type="button" onClick={() => setEditing(item)}><SlidersHorizontal size={14} />{tr('mkOps.eng.editCounts')}</button>}<button type="button" onClick={() => setHistory(item)}><History size={14} />{tr('mkOps.eng.countHistory')}</button>
        </div>{item.target_type === 'series' && <small className="market-ops-content-note">{tr('mkOps.eng.seriesNote')}</small>}{item.target_type === 'series_episode' && <small className="market-ops-content-note">{tr('mkOps.eng.episodeNote')}</small>}
      </div>
    </article>)}</div> : <div className="market-ops-empty"><Film size={28} /><h3>{tr(error ? 'mkOps.eng.loadError' : 'mkOps.eng.empty')}</h3><p>{tr(error ? 'mkOps.eng.loadErrorHint' : 'mkOps.eng.emptyHint')}</p></div>}
    {listing && <PaginationBar page={page} pageSize={listing.page_size} total={listing.total} onPageChange={setPage} />}
    {editing && editing.target_type !== 'series' && <MetricsEditor key={`${editing.target_type}-${editing.target_id}`} item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(v => v + 1) }} />}
    {history && <MetricsHistory item={history} onClose={() => setHistory(null)} />}
    {previewing && <OperationPreview item={previewing} onClose={() => setPreviewing(null)} />}
    {showEvents && <CurationHistoryPanel revision={refresh + revision} />}
  </section>
}

function OperationCover({ assetId }: { assetId: number | null }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true; setUrl('')
    if (assetId) assetUrl(assetId, 'cover').then(value => { if (active) setUrl(value) }).catch(() => undefined)
    return () => { active = false }
  }, [assetId])
  return url ? <img src={url} alt={tr('mkOps.eng.cover')} loading="lazy" onError={() => setUrl('')} /> : <span className="market-ops-cover-empty"><Film size={36} /><small>{tr('mkOps.eng.noCover')}</small></span>
}

function OperationPreview({ item, onClose }: { item: Metric; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (item.asset_id) assetUrl(item.asset_id, 'original').then(value => { if (active) setUrl(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [item.asset_id])
  return <AdminModal open onOpenChange={open => { if (!open) onClose() }} title={tr('mkOps.eng.preview')} subtitle={item.title} size="xl">{error ? <p role="alert">{error}</p> : url ? <video src={url} controls className="market-ops-content-video" /> : <p role="status">{tr('mkOps.eng.loadingVideo')}</p>}</AdminModal>
}

function MetricsEditor({ item, onClose, onSaved }: { item: Metric; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [clear, setClear] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    setError('')
    try {
      const reason = String(form.get('reason') || '').trim()
      if (!reason) throw new Error(tr('mkOps.cur.errReason'))
      const values = clear ? {} : displayMetricsInput(Object.fromEntries(form), item.real)
      setBusy(true)
      await request(`${base}/metrics/${item.target_type}/${item.target_id}`, 'PATCH', { ...values, version: item.version, reason, clear })
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <AdminModal className="market-ops-operation-modal" open onOpenChange={open => { if (!open && !busy) onClose() }} title={tr('mkOps.eng.editTitle')} subtitle={item.title} size="lg"><form className="market-ops-support market-ops-modal-form" onSubmit={save}>
    <p>{tr('mkOps.eng.editNote')}</p>
    <label><input type="checkbox" checked={clear} disabled={busy} onChange={event => setClear(event.target.checked)} /> {tr('mkOps.eng.clearAll')}</label>
    {Object.entries(labels).map(([key, label]) => <label key={key}>{tr('mkOps.eng.displayCount', { label, n: number(item.real[key as keyof Counts]) })}<input name={key} inputMode="numeric" required={!clear} defaultValue={item.display[key as keyof Counts]} disabled={busy || clear} /></label>)}
    <label>{tr('mkOps.cur.reason')}<textarea name="reason" required maxLength={300} disabled={busy} /></label><div className="flex gap-3"><button type="submit" disabled={busy}>{tr(busy ? 'mkOps.saving' : 'mkOps.eng.saveEdit')}</button><button type="button" disabled={busy} onClick={onClose}>{tr('mkOps.cancel')}</button></div>{error && <p role="alert">{error}</p>}
  </form></AdminModal>
}

function MetricsHistory({ item, onClose }: { item: Metric; onClose: () => void }) {
  type Audit = { id: number; operator_id: number | null; action: string; reason: string; before: Record<string, unknown>; after: Record<string, unknown>; created_at: string }
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: Audit[]; total: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true; setData(null); setError('')
    request<{ items: Audit[]; total: number }>(`${base}/metrics/events?${new URLSearchParams({ target_type: item.target_type, target_id: String(item.target_id), page: String(page), page_size: '20' })}`)
      .then(value => { if (active) setData(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [item.target_type, item.target_id, page])
  const snapshot = (value: Record<string, unknown>) => Object.entries(labels).map(([key, label]) => `${label} ${typeof value[key] === 'number' ? number(value[key]) : '—'}`).join(' / ')
  return <AdminModal className="market-ops-operation-modal" open onOpenChange={open => { if (!open) onClose() }} title={tr('mkOps.eng.historyTitle')} subtitle={item.title} size="xl">
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">{tr('mkOps.eng.historyLoading')}</p> : data.items.length ? <div className="grid gap-3">{data.items.map(row => <article className="market-ops-feedback" key={row.id}><strong>{AUDIT_ACTIONS.includes(row.action) ? tr(`mkOps.eng.action.${row.action}`) : row.action}</strong><p>{tr('mkOps.eng.operatorLine', { operator: row.operator_id ? tr('mkOps.eng.adminN', { id: row.operator_id }) : tr('mkOps.eng.system'), time: formatDateTime(row.created_at) })}</p><p>{tr('mkOps.eng.reasonLine', { reason: row.reason })}</p><p>{tr('mkOps.eng.beforeLine', { value: snapshot(row.before) })}</p><p>{tr('mkOps.eng.afterLine', { value: snapshot(row.after) })}</p></article>)}</div> : <p>{tr('mkOps.eng.historyEmpty')}</p>}
    {data && <PaginationBar page={page} pageSize={20} total={data.total} onPageChange={setPage} />}
  </AdminModal>
}
