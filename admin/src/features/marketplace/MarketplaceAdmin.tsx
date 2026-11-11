import { points } from '../../lib/points'
import { tr } from '../../i18n/translate.ts'
import { tRich } from '../../i18n/rich'
import EngagementOperations from './EngagementOperations'
import UnlockOrders from './UnlockOrders'
import ContentRevenueForm from './ContentRevenueForm'
import { CurationControls } from './CurationOperations'
import CategoryForm from './CategoryForm'
import { useEffect, useState, type FormEvent } from 'react'
import { request, assetFile, assetUrl, letterFile, useMarketplaceStatus, type Item, type Listing } from './api'
import { fieldStatusLabel, recordDetailsTitle, recordStatus, statusLabel, statusOptions } from './presentation'
import { PaginationBar } from '@/components/PaginationBar'
import { AdminModal } from '@/components/admin/AdminModal'
import { RefreshCw, Film, ShieldCheck, Users, Flag, CircleAlert, MessageCircle, Inbox } from 'lucide-react'
import './marketplace-admin.css'

// 独立下游运营工作台；不复用或改变原作品审核页。
// 只存 key：可枚举 getter 在读取时按当前语言 tr（模块级常量不能存已翻译文字；展开对象也会提前取值，所以 tabs 单独生成）
function lazyLabels<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  return Object.defineProperties({}, Object.fromEntries(keys.map(key => [key, { enumerable: true, get: () => tr(`${prefix}.${key}`) }]))) as Record<K, string>
}
const BUSINESS_TAB_KEYS = ['engagement', 'works', 'series', 'recruits', 'reports', 'support', 'categories', 'revenue', 'app'] as const
const MAINTENANCE_TAB_KEYS = ['previews', 'submissions', 'jobs', 'orders', 'entitlements', 'ledger', 'payouts', 'events'] as const
const businessTabs = lazyLabels('mkAdm.tab', BUSINESS_TAB_KEYS)
const maintenanceTabs = lazyLabels('mkAdm.tab', MAINTENANCE_TAB_KEYS)
const tabs = lazyLabels('mkAdm.tab', [...BUSINESS_TAB_KEYS, ...MAINTENANCE_TAB_KEYS])
const statusNames: Record<string, string> = lazyLabels('mkAdm.status', ['preview_failed', 'original', 'missing', 'running', 'done', 'draft', 'pending', 'approved', 'rejected', 'ready', 'processing', 'failed', 'open', 'closed', 'expired', 'pending_materials', 'reviewing', 'supplement', 'applying', 'certificated', 'cancelled', 'to_review', 'candidate', 'not_selected', 'active', 'inactive', 'printfilm', 'external', 'existing', 'self_service', 'assisted', 'free', 'copyright_contact', 'platform_unlock', 'work', 'series', 'series_episode', 'recruit', 'submission', 'manual', 'drama_import', 'alipay', 'wxpay'])
const names: Record<string, string> = lazyLabels('mkAdm.field', ['app_editions', 'preview_status', 'preview_error', 'playback_status', 'playback_error', 'work_id', 'id', 'owner_id', 'user_id', 'asset_id', 'publication_id', 'publication_version', 'episode_id', 'order_id', 'content_type', 'content_id', 'publication_owner_id', 'active', 'version', 'title', 'description', 'price_fen', 'sale_type', 'copyright_price_fen', 'unlock_price_fen', 'free_episode_count', 'episode_count', 'platform_share_bps', 'share_bps', 'gross_fen', 'platform_fen', 'creator_fen', 'amount_fen', 'budget_fen', 'quote_fen', 'category', 'source', 'source_type', 'source_snapshot', 'license_scope', 'audit_status', 'basic_status', 'full_status', 'reason', 'listed', 'blocked', 'author', 'holder', 'relationship', 'acquisition', 'scope', 'third_party', 'institution', 'certificate_number', 'ai_platform_license', 'ai_generation_record', 'human_contribution', 'official_reference', 'route', 'status', 'settlement_status', 'out_trade_no', 'trade_no', 'paid_at', 'pay_type', 'operator_id', 'note', 'statement', 'contact', 'resolution', 'target_type', 'target_id', 'requirements', 'wanted_count', 'deadline_at', 'valid_until', 'fingerprint', 'filename', 'selection', 'withdrawn', 'action', 'actor_id', 'attempts', 'error', 'media_status', 'state', 'tags', 'authorization_id', 'authorization_version', 'authorization_signer', 'copyright_statement', 'dispute_ack'])

// 按可读字段渲染审核材料，原片和证书另经鉴权打开。
function Summary({ item, kind }: { item: Item; kind: string }) {
  const details = typeof item.details === 'object' && item.details !== null ? item.details : {}
  return <dl className="market-ops-summary">
    {Object.entries(item).filter(([key, value]) => names[key] && !['basic_status', 'full_status', 'id', 'title', 'audit_status', 'status'].includes(key) && value !== null && value !== '').map(([key, value]) => <div key={key}><dt>{names[key]}</dt><dd>{typeof value === 'boolean' ? tr(value ? 'mkApp.yes' : 'mkApp.no') : key === 'unlock_price_fen' ? points(Number(value)) : ['price_fen', 'copyright_price_fen', 'unlock_price_fen', 'budget_fen', 'quote_fen', 'gross_fen', 'platform_fen', 'creator_fen', 'amount_fen'].includes(key) ? `¥${(Number(value) / 100).toFixed(2)}` : Array.isArray(value) ? (key === 'app_editions' ? value.map(edition => edition === 'domestic' ? tr('mkAdm.editionDomestic') : edition === 'international' ? tr('mkAdm.editionIntl') : String(edition)) : value).join(tr('mkApp.listSep')) || '—' : typeof value === 'object' ? JSON.stringify(value) : key === 'preview_status' && value === 'none' ? tr(isFreeItem(item) ? 'mkAdm.noPreviewNeeded' : 'mkAdm.status.missing') : key === 'status' ? statusLabel(kind, value) : fieldStatusLabel(key, value) || statusNames[String(value)] || String(value)}</dd></div>)}
    {Object.entries(details).filter(([key, value]) => names[key] && value !== '' && value !== null && value !== undefined).map(([key, value]) => <div key={key}><dt>{names[key] || key}</dt><dd>{typeof value === 'boolean' ? tr(value ? 'mkApp.yes' : 'mkApp.no') : fieldStatusLabel(key, value) || statusNames[String(value)] || String(value)}</dd></div>)}
  </dl>
}

// 直接从服务端签名，不将原始 OSS key 传到页面。
function FileLink({ id, label, purpose = 'original', video = false }: { id: number; label: string; purpose?: string; video?: boolean }) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<{ url: string; image: boolean; pdf: boolean } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  async function open() {
    try {
      if (video) { setUrl(await assetUrl(id, purpose)); setError(''); return }
      const blob = await assetFile(id, purpose)
      const type = blob.type
      setPreview(current => { if (current) URL.revokeObjectURL(current.url); return { url: URL.createObjectURL(blob), image: type.startsWith('image/'), pdf: type.includes('pdf') } })
      setError('')
    } catch (e) { setError((e as Error).message) }
  }
  return <div className="market-ops-file"><button type="button" onClick={() => { void open() }}>{label}</button>{url && video && <video src={url} controls className="my-3 max-h-[500px] w-full" />}{preview?.image && <img src={preview.url} alt={label} />}{preview?.pdf && <iframe className="market-ops-file-frame" src={preview.url} title={label} />}{preview && !preview.image && !preview.pdf && <p>{tr('mkAdm.noInlinePreview')}</p>}{error && <p role="alert">{error}</p>}</div>
}

function WorkPreviewLink({ id }: { id: number }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState('')
  return <div className="market-ops-file"><button type="button" onClick={async () => { try { setUrl((await request<{ url: string }>(`/api/marketplace/media/work/${id}/preview`)).url); setError('') } catch (e) { setError((e as Error).message) } }}>{tr('mkAdm.viewShortPreview')}</button>{url && <video src={url} controls className="my-3 max-h-[500px] w-full" />}{error && <p role="alert">{error}</p>}</div>
}
function AuthorizationLink({ details }: { details: unknown }) {
  const id = details && typeof details === 'object' && 'authorization_id' in details ? Number(details.authorization_id) : 0
  const [preview, setPreview] = useState<{ url: string; image: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview?.url])
  if (!id) return null
  async function openLetter() {
    setLoading(true); setError('')
    try {
      const blob = await letterFile(id)
      const url = URL.createObjectURL(blob)
      setPreview(current => { if (current?.url) URL.revokeObjectURL(current.url); return { url, image: blob.type.startsWith('image/') } })
      setOpen(true)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  function downloadLetter() {
    if (!preview) return
    const link = document.createElement('a')
    link.href = preview.url
    link.download = `${tr('mkAdm.letter.fileBase')}.${preview.image ? 'png' : 'pdf'}`
    link.click()
  }
  return <div className="market-ops-file">
    <button type="button" onClick={() => void openLetter()} disabled={loading}>{tr(loading ? 'mkAdm.letter.loading' : 'mkAdm.letter.preview')}</button>
    {preview && <button type="button" onClick={downloadLetter}>{tr('mkAdm.letter.download')}</button>}
    {error && <p role="alert">{error}</p>}
    <AdminModal open={open} onOpenChange={setOpen} title={tr('mkAdm.letter.previewTitle')} subtitle={tr('mkAdm.letter.previewSubtitle')} size="xl" className="market-ops-letter-modal" bodyClassName="market-ops-letter-modal-body">
      <div className="market-ops-letter-preview">
        <div className="market-ops-letter-preview-head"><strong>{tr('mkAdm.letter.heading')}</strong><span>{tr('mkAdm.letter.fileKind', { kind: tr(preview?.image ? 'mkAdm.letter.imageFile' : 'mkAdm.letter.pdfFile') })}</span></div>
        <div className="market-ops-letter-preview-canvas">
          {preview ? (preview.image ? <img className="market-ops-letter-image" src={preview.url} alt={tr('mkAdm.letter.signed')} /> : <iframe className="market-ops-letter-frame" src={preview.url} title={tr('mkAdm.letter.previewTitle')} />) : <p>{tr('mkAdm.letter.notLoaded')}</p>}
        </div>
      </div>
      {preview && <div className="market-ops-letter-modal-actions"><button type="button" onClick={downloadLetter}>{tr('mkAdm.letter.download')}</button></div>}
    </AdminModal>
  </div>
}

function CoverImage({ id }: { id?: number }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!id) return
    let active = true
    assetUrl(id, 'cover').then(value => { if (active) setUrl(value) }).catch(() => {})
    return () => { active = false }
  }, [id])
  return url ? <img src={url} alt="" /> : <span><Film size={28} /></span>
}

function Playback({ assetId }: { assetId?: number }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!assetId) return
    let active = true
    assetUrl(assetId, 'original').then(value => { if (active) setUrl(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [assetId])
  if (!assetId) return <p>{tr('mkAdm.noPlayableOriginal')}</p>
  if (error) return <p role="alert">{error}</p>
  if (!url) return <p role="status">{tr('mkAdm.loadingOriginal')}</p>
  return <video src={url} controls />
}

function auditLabel(item: Item) {
  const name = statusNames[String(item.audit_status || 'draft')] || String(item.audit_status || tr('mkAdm.status.draft'))
  return item.listed ? tr('mkAdm.listedSuffix', { name }) : name
}

function isFreeItem(item: Item) {
  return item.sale_type === 'free'
}

function priceLabel(item: Item, series = false, recruit = false) {
  if (recruit) return `¥${(Number(item.budget_fen || 0) / 100).toFixed(2)}`
  if (isFreeItem(item)) return tr('mkAdm.free')
  if (series && item.sale_type === 'platform_unlock') return tr('mkAdm.perEpisodeUnlock')
  const fen = series ? Number(item.copyright_price_fen ?? item.price_fen ?? 0) : Number(item.sale_type === 'platform_unlock' ? item.unlock_price_fen : item.price_fen)
  return `¥${(fen / 100).toFixed(2)}`
}

function ReviewGallery({ items, series, recruit = false, onOpen }: { items: Item[]; series: boolean; recruit?: boolean; onOpen: (item: Item) => void }) {
  if (!items.length) return null
  return <div className="market-ops-gallery">{items.map(item => <button type="button" className="market-ops-card" key={item.id} onClick={() => onOpen(item)}>
    <span className="market-ops-card-cover"><CoverImage id={typeof item.cover_asset_id === 'number' ? item.cover_asset_id : undefined} /><em className={`market-ops-badge status-${String(item.audit_status || 'draft')}`}>{auditLabel(item)}</em></span>
    <span className="market-ops-card-body">
      <em>{recruit ? tr('mkAdm.card.recruit') : series ? tr('mkAdm.status.series') : String(item.category || tr('mkAdm.card.work'))}</em>
      <strong>{String(item.title || tr('mkAdm.untitled'))}</strong>{!recruit && <span className="market-ops-curation-tags">{item.is_pinned ? <span>{tr('mkOps.cur.pin')}</span> : null}{item.is_featured ? <span>{tr('mkOps.cur.featured')}</span> : null}</span>}
      <small><i>{String(item.author || tr('mkAdm.card.creatorInitial')).slice(0, 1)}</i>{String(item.author || tr('mkAdm.userN', { id: String(item.owner_id || '') }))}</small>
      <b>{priceLabel(item, series, recruit)}{recruit ? <span>{tr('mkAdm.card.budgetWanted', { n: String(item.wanted_count || 0) })}</span> : series ? <span>{tr('mkAdm.episodesN', { n: Number(item.episode_count || (Array.isArray(item.episodes) ? item.episodes.length : 0)) })}{Number(item.free_episode_count) > 0 ? tr('mkAdm.card.freeFirstN', { n: String(item.free_episode_count) }) : ''}</span> : !isFreeItem(item) && <span>{tr(item.sale_type === 'platform_unlock' ? 'mkAdm.card.unlockPrice' : 'mkAdm.card.refPrice')}</span>}</b>
    </span>
  </button>)}</div>
}

function ReviewStage({ item, series, recruit = false, onBack, onReview }: { item: Item; series: boolean; recruit?: boolean; onBack: () => void; onReview: (event: FormEvent<HTMLFormElement>, item: Item) => void }) {
  const episodes = Array.isArray(item.episodes) ? item.episodes as Item[] : []
  const [episodeId, setEpisodeId] = useState<number | undefined>(typeof episodes[0]?.id === 'number' ? episodes[0].id : undefined)
  const episode = episodes.find(entry => entry.id === episodeId)
  const assetId = series ? (typeof episode?.asset_id === 'number' ? episode.asset_id : undefined) : (typeof item.asset_id === 'number' ? item.asset_id : undefined)
  const coverId = typeof item.cover_asset_id === 'number' ? item.cover_asset_id : undefined
  return <section className="market-ops-stage">
    <button type="button" className="market-ops-back" onClick={onBack}>{tr('mkAdm.backToList')}</button>
    <div className="market-ops-stage-layout">
      <div className="market-ops-stage-player">{recruit ? <CoverImage id={coverId} /> : <><p className="market-ops-original-note">{tr('mkAdm.adminReviewsOriginal')}</p><Playback key={assetId || 'none'} assetId={assetId} /></>}</div>
      <aside>
        <span className={`market-ops-badge status-${String(item.audit_status || 'draft')}`}>{auditLabel(item)}</span>
        <h2>{String(item.title || tr('mkAdm.untitled'))}</h2>
        <p>{String(item.author || tr('mkOps.eng.creator'))} · {priceLabel(item, series, recruit)}{series ? ` · ${tr('mkAdm.episodesN', { n: episodes.length })}` : ''}{recruit ? ` · ${tr('mkAdm.wantedN', { n: String(item.wanted_count || 0) })}` : ''}</p>
        <p>{String(item.description || tr('mkAdm.noDescription'))}</p>{!recruit && <CurationControls targetType={series ? 'series' : 'work'} targetId={item.id} />}
        {!recruit && <ContentRevenueForm key={`${series ? 'series' : 'work'}-${item.id}-${item.version}`} item={item} kind={series ? 'series' : 'work'} />}
        {series && episode && <ContentRevenueForm key={`episode-${episode.id}-${episode.version}`} item={episode} kind="series_episode" />}
        {recruit && <p>{tr('mkAdm.requirementsLine', { value: String(item.requirements || tr('mkAdm.notFilled')) })}</p>}
        <p>{tr('mkAdm.licenseLine', { value: String(item.license_scope || tr('mkAdm.notFilled')) })}</p>
        {recruit && <p>{tr('mkAdm.deadlineLine', { value: String(item.deadline_at || tr('mkAdm.notFilled')) })}</p>}
        {series && <div className="market-ops-episode-picks">{episodes.map(episode => <button type="button" key={episode.id} aria-pressed={episode.id === episodeId} onClick={() => setEpisodeId(Number(episode.id))}>{tr('mkAdm.episodeN', { n: String(episode.episode_no) })}</button>)}</div>}
        {!recruit && <AuthorizationLink details={series ? episodes.find(episode => episode.id === episodeId)?.details : item.details} />}
        {item.audit_status === 'pending' ? <form className="market-ops-review" onSubmit={event => onReview(event, item)}><h3>{tr('mkAdm.review.title')}</h3><p>{tr(recruit ? 'mkAdm.review.recruitHint' : 'mkAdm.review.mediaHint')}</p>{!recruit && <div className="grid gap-3"><section><h3>{tr('mkAdm.review.contentCheck')}</h3><label><input name="checks" value="content" type="checkbox" /> {tr('mkAdm.review.contentChecked')}</label></section><section><h3>{tr('mkAdm.review.copyrightCheck')}</h3><label><input name="checks" value="copyright" type="checkbox" /> {tr('mkAdm.review.copyrightChecked')}</label></section></div>}<label className="block">{tr('mkAdm.review.reason')}<textarea name="reason" required maxLength={3000} className="block w-full rounded border bg-background p-2" /></label><div className="flex gap-3"><button type="submit" value="approved" className="market-ops-approve">{tr('mkAdm.review.approve')}</button><button type="submit" value="rejected" className="market-ops-reject">{tr('mkAdm.review.reject')}</button></div></form> : <p>{tr('mkAdm.review.notPending')}</p>}
      </aside>
    </div>
  </section>
}

function PayoutStatusForm({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [status, setStatus] = useState(String(item.status || 'pending'))
  const [note, setNote] = useState(String(item.note || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await request(`/api/admin/marketplace/payouts/${item.id}`, 'PATCH', { owner_id: Number(item.owner_id), amount_fen: Number(item.amount_fen), status, note })
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-inline-form" onSubmit={save}>
    <label>{tr('mkAdm.payout.status')}<select value={status} onChange={event => setStatus(event.target.value)} disabled={status === 'paid'}><option value="pending">{tr('mkAdm.payout.pending')}</option><option value="paid">{tr('mkAdm.payout.paid')}</option><option value="failed">{tr('mkAdm.payout.failed')}</option></select></label>
    <label>{tr('mkAdm.field.note')}<input value={note} maxLength={3000} onChange={event => setNote(event.target.value)} /></label>
    <button type="submit" disabled={busy || status === String(item.status || '')}>{tr(busy ? 'mkOps.saving' : 'mkAdm.payout.update')}</button>
    {error && <span role="alert">{error}</span>}
  </form>
}


// 独立工作台含分页、错误态、敏感材料检查和明确原因输入。
export default function MarketplaceAdmin() {
  const availability = useMarketplaceStatus()
  const enabled = availability.enabled
  const [kind, setKind] = useState<keyof typeof tabs>('works')
  const [listing, setListing] = useState<Listing | null>(null)
  const [overview, setOverview] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [curationFilter, setCurationFilter] = useState('')
  const [selected, setSelected] = useState<Item | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [entitlementUserId, setEntitlementUserId] = useState('')
  const [entitlementOwnerId, setEntitlementOwnerId] = useState('')
  function navigateTab(next: keyof typeof tabs, nextStatus?: string) {
    if (next === 'jobs' || next === 'events' || next === 'previews' || next === 'submissions' || next === 'orders' || next === 'entitlements' || next === 'ledger' || next === 'payouts') setMaintenanceOpen(true)
    const fallback = next === 'works' || next === 'series' || next === 'recruits' ? 'pending' : ''
    setKind(next); setCurationFilter(''); setPage(1); setStatus(nextStatus === undefined ? fallback : nextStatus); setSelected(null); setListing(null); setError(''); setMessage('')
  }
  useEffect(() => {
    if (!enabled || kind === 'support' || kind === 'categories' || kind === 'revenue' || kind === 'engagement' || kind === 'app') return
    let active = true; setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), status })
    if ((kind === 'works' || kind === 'series') && curationFilter) params.set('curation', curationFilter)
    if (kind === 'entitlements') { if (entitlementUserId) params.set('user_id', entitlementUserId); if (entitlementOwnerId) params.set('owner_id', entitlementOwnerId) }
    request<Listing>(`/api/admin/marketplace/records/${kind}?${params}`).then(result => { if (active) setListing(result) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    request<Record<string, number>>('/api/admin/marketplace/overview').then(value => { if (active) setOverview(value) }).catch(() => {})
    return () => { active = false }
  }, [enabled, kind, page, status, refresh, entitlementUserId, entitlementOwnerId, curationFilter])
  // 统一提交审核意图，后端始终重新核对版本与状态。
  async function action(path: string, body: unknown) { setError(''); setMessage(''); try { await request(`/api/admin/marketplace${path}`, 'POST', body); setRefresh(v => v + 1); setMessage(tr('mkAdm.actionDone')); return true } catch (e) { setError((e as Error).message); return false } }
  // 审核原因和逐项确认来自该记录的表单，不自动勾选。
  function review(e: FormEvent<HTMLFormElement>, item: Item) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
    void action(`/${kind}/${item.id}/review`, { version: item.version, decision: submitter.value, reason: form.get('reason'), checks: form.getAll('checks') }).then(ok => { if (ok) setSelected(null) })
  }
  if (availability.loading) return <p role="status">{tr('mkAdm.svc.loading')}</p>
  if (availability.error) return <div className="market-ops"><p role="alert">{tr('mkAdm.svc.error')}{availability.error}</p><button type="button" onClick={availability.retry}>{tr('mkOps.reload')}</button></div>
  if (!enabled) return <div className="market-ops"><p>{tr('mkAdm.svc.disabled')}</p><button type="button" onClick={availability.retry}>{tr('mkAdm.svc.refresh')}</button></div>
  const reviewView = kind === 'works' || kind === 'series' || kind === 'recruits' ? (selected ? 'detail' : 'cards') : 'records'
  return <div className="market-ops">
    <header className="market-ops-header"><div><div className="market-ops-eyebrow"><ShieldCheck size={15} /> {tr('mkAdm.head.kicker')}</div><h1>{tr('mkAdm.head.title')}</h1><p>{tr('mkAdm.head.desc')}</p></div><button type="button" className="market-ops-refresh" onClick={() => setRefresh(v => v + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{tr('mkAdm.head.refresh')}</button></header>
    <div className="market-ops-stats">{([
      { key: 'works_pending', label: tr('mkAdm.stat.works'), icon: Film, tab: 'works', tone: 'green' },
      { key: 'recruits_pending', label: tr('mkAdm.stat.recruits'), icon: Users, tab: 'recruits', tone: 'blue' },
      { key: 'reports_pending', label: tr('mkAdm.stat.reports'), icon: Flag, tab: 'reports', tone: 'amber' },
      { key: 'jobs_failed', label: tr('mkAdm.stat.jobs'), icon: CircleAlert, tab: 'jobs', tone: 'red' },
    ] as const).map(card => <button type="button" className={`market-ops-stat tone-${card.tone}`} key={card.key} onClick={() => navigateTab(card.tab, card.tab === 'jobs' ? 'failed' : 'pending')}><span className="market-ops-stat-icon"><card.icon size={20} /></span><span><span className="market-ops-stat-label">{card.label}</span><strong>{overview[card.key] ?? '—'}</strong></span><span className="market-ops-stat-arrow">↗</span></button>)}</div>
    <div className="market-ops-context"><span><MessageCircle size={15} />{tRich(tr('mkAdm.ctx.consultations'), { n: <strong>{overview.consultations ?? '—'}</strong> })}</span><span>{tr('mkAdm.ctx.storage')} <strong>{overview.storage_bytes === undefined ? '—' : `${(overview.storage_bytes / 1024 / 1024).toFixed(1)} MB`}</strong></span><span className="market-ops-context-note">{tr('mkAdm.ctx.note')}</span></div>
    <nav className="market-ops-tabs" aria-label={tr('mkAdm.nav.business')}>{Object.entries(businessTabs).map(([key, label]) => <button type="button" key={key} aria-current={kind === key ? 'page' : undefined} onClick={() => navigateTab(key as keyof typeof tabs)}>{label}</button>)}<button type="button" aria-expanded={maintenanceOpen} className="market-ops-maintenance-toggle" onClick={() => { if (maintenanceOpen && (kind === 'jobs' || kind === 'events' || kind === 'previews' || kind === 'submissions' || kind === 'orders' || kind === 'entitlements' || kind === 'ledger' || kind === 'payouts')) navigateTab('works'); setMaintenanceOpen(!maintenanceOpen) }}>{tr('mkAdm.nav.more')} {maintenanceOpen ? '−' : '+'}</button></nav>
    {maintenanceOpen && <div className="market-ops-maintenance"><div><strong>{tr('mkAdm.nav.more')}</strong><p>{tr('mkAdm.nav.moreDesc')}</p></div><nav aria-label={tr('mkAdm.nav.more')}>{Object.entries(maintenanceTabs).map(([key, label]) => <button type="button" key={key} aria-current={kind === key ? 'page' : undefined} onClick={() => navigateTab(key as keyof typeof tabs)}>{label}</button>)}</nav></div>}
    {kind === 'jobs' && <p className="market-ops-feedback">{tr('mkAdm.jobsNote')}</p>}
    {error && <p role="alert" className="market-ops-feedback is-error">{error}</p>}{message && <p role="status" className="market-ops-feedback">{message}</p>}
    {kind === 'app' ? <UnlockOrders revision={refresh} /> : kind === 'engagement' ? <EngagementOperations revision={refresh} /> : kind === 'support' ? <SupportForm /> : kind === 'categories' ? <CategoryForm /> : kind === 'revenue' ? <RevenueConfigForm /> : <><div className="market-ops-filter"><div><h2>{tabs[kind]}</h2><span>{listing ? tr('mkOps.app.totalN', { n: listing.meta.total }) : tr('mkAdm.loadingRecords')}</span></div><select aria-label={tr('mkAdm.statusFilter')} className="rounded border bg-background p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">{tr('mkOps.allStatuses')}</option>{statusOptions(kind).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(kind === 'works' || kind === 'series') && <select aria-label={tr('mkAdm.curationFilter')} value={curationFilter} onChange={event => { setCurationFilter(event.target.value); setPage(1); setSelected(null) }}><option value="">{tr('mkOps.eng.allCuration')}</option><option value="featured">{tr('mkOps.eng.isFeatured')}</option><option value="pinned">{tr('mkOps.eng.isPinned')}</option><option value="normal">{tr('mkOps.eng.isNormal')}</option></select>}{kind === 'entitlements' && <div className="market-ops-entitlement-filter"><input aria-label={tr('mkOps.unlock.buyerId')} type="number" min="1" placeholder={tr('mkOps.unlock.buyerId')} value={entitlementUserId} onChange={e => { setEntitlementUserId(e.target.value); setPage(1) }} /><input aria-label={tr('mkApp.field.owner_id')} type="number" min="1" placeholder={tr('mkApp.field.owner_id')} value={entitlementOwnerId} onChange={e => { setEntitlementOwnerId(e.target.value); setPage(1) }} /></div>}<button type="button" onClick={() => setRefresh(v => v + 1)}>{tr('mkAdm.refresh')}</button></div>{kind === 'payouts' && <PayoutCreateForm onSaved={() => setRefresh(v => v + 1)} />}{loading ? <p role="status">{tr('mkAdm.loading')}</p> : reviewView === 'detail' && selected ? <ReviewStage item={selected} series={kind === 'series'} recruit={kind === 'recruits'} onBack={() => setSelected(null)} onReview={review} /> : reviewView === 'cards' ? <ReviewGallery items={listing?.items ?? []} series={kind === 'series'} recruit={kind === 'recruits'} onOpen={setSelected} /> : listing?.items.map(item => <article className="market-ops-record" key={`${kind}-${item.id}-${refresh}`}><header className="market-ops-record-head"><div><span className="market-ops-record-id">#{item.id} · {tabs[kind]}</span><h3>{String(item.title || item.filename || item.recruit_title || (kind === 'entitlements' ? tr('mkAdm.userEntitlement', { id: String(item.user_id) }) : tr('mkAdm.businessRecord')))}</h3></div><span className={`market-ops-badge status-${recordStatus(kind, item) || 'record'}`}>{kind === 'events' ? tr('mkAdm.tab.events') : kind === 'submissions' ? statusNames[String(item.selection)] || tr('mkAdm.status.submission') : statusLabel(kind, recordStatus(kind, item))}</span></header><details className="market-ops-details" open={kind === 'works' || kind === 'recruits' || kind === 'series' || kind === 'entitlements'}><summary>{recordDetailsTitle(kind)}</summary><Summary item={item} kind={kind} /></details>
      {kind === 'works' && item.sale_type !== 'free' && <WorkPreviewLink id={Number(item.id)} />}
      {typeof item.asset_id === 'number' && <FileLink id={item.asset_id} label={tr('mkAdm.file.video')} purpose="original" video />}
      {kind === 'works' && typeof item.cover_asset_id === 'number' && <FileLink id={item.cover_asset_id} label={tr('mkOps.eng.cover')} />}{typeof item.certificate_asset_id === 'number' && <FileLink id={item.certificate_asset_id} label={tr('mkAdm.file.certificate')} />}
      {Array.isArray(item.evidence_ids) && item.evidence_ids.map(id => <FileLink key={Number(id)} id={Number(id)} label={tr('mkAdm.file.evidence')} />)}
      {kind === 'series' && Array.isArray(item.episodes) && <div className="market-ops-episodes"><h4>{tr('mkAdm.file.episodeMaterials')}</h4>{item.episodes.map((episode: Item) => <section key={episode.id}><strong>{tr('mkAdm.episodeTitle', { n: String(episode.episode_no), title: String(episode.title || '') })}</strong>{typeof episode.asset_id === 'number' && <FileLink id={episode.asset_id} label={tr('mkAdm.file.episodeVideo')} purpose="original" video />}{typeof episode.cover_asset_id === 'number' && <FileLink id={episode.cover_asset_id} label={tr('mkAdm.file.episodeCover')} />}{typeof episode.certificate_asset_id === 'number' && <FileLink id={episode.certificate_asset_id} label={tr('mkAdm.file.episodeCertificate')} />}{Array.isArray(episode.evidence_ids) && episode.evidence_ids.map(value => <FileLink key={Number(value)} id={Number(value)} label={tr('mkAdm.file.episodeEvidence')} />)}<AuthorizationLink details={episode.details} /></section>)}</div>}
      <AuthorizationLink details={item.details} />{kind === 'submissions' && <p>{tr('mkAdm.snapshot', { value: JSON.stringify(item.snapshot) })}</p>}
      {((kind === 'recruits' || kind === 'series' || kind === 'works') && item.audit_status === 'pending') && <form className="market-ops-review" onSubmit={e => review(e, item)}><h3>{tr('mkAdm.review.title')}</h3><p>{tr('mkAdm.review.recordHint')}</p>{(kind === 'works' || kind === 'series') && <div className="grid gap-3"><section><h3>{tr('mkAdm.review.contentCheck')}</h3><label><input name="checks" value="content" type="checkbox" /> {tr('mkAdm.review.contentChecked')}</label></section><section><h3>{tr('mkAdm.review.copyrightCheck')}</h3><label><input name="checks" value="copyright" type="checkbox" /> {tr('mkAdm.review.copyrightChecked')}</label></section></div>}<label className="block">{tr('mkAdm.review.reason')}<textarea name="reason" required maxLength={3000} className="block w-full rounded border bg-background p-2" /></label><div className="flex gap-3"><button type="submit" value="approved" className="market-ops-approve">{tr('mkAdm.review.approve')}</button><button type="submit" value="rejected" className="market-ops-reject">{tr('mkAdm.review.reject')}</button></div></form>}
      {kind === 'reports' && <form className="market-ops-review" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (window.confirm(tr('mkAdm.report.confirm'))) void action(`/reports/${item.id}/resolve`, { resolution: form.get('resolution') }) }}><textarea name="resolution" aria-label={tr('mkAdm.field.resolution')} required maxLength={3000} className="block w-full rounded border bg-background p-2" /><div className="flex gap-3"><button type="submit" className="market-ops-approve">{tr('mkAdm.report.record')}</button><button type="button" className="market-ops-reject" onClick={() => { const reason = window.prompt(tr('mkAdm.report.blockPrompt')); if (reason) void action(`/block/${item.target_type}/${item.target_id}`, { blocked: true, reason }) }}>{tr('mkAdm.report.block')}</button></div></form>}
      {kind === 'payouts' && <PayoutStatusForm item={item} onSaved={() => setRefresh(v => v + 1)} />}
      {['works', 'recruits', 'submissions'].includes(kind) && <button type="button" className="market-ops-reject" onClick={() => { const reason = window.prompt(tr(item.blocked ? 'mkAdm.block.unblockPrompt' : 'mkAdm.block.blockPrompt')); if (reason) void action(`/block/${({ works: 'work', recruits: 'recruit', submissions: 'submission' } as Record<string, string>)[kind]}/${item.id}`, { blocked: !item.blocked, reason }) }}>{tr(item.blocked ? 'mkAdm.block.unblock' : 'mkAdm.block.block')}</button>}
    </article>)}{!selected && !loading && !error && listing?.items.length === 0 && <div className="market-ops-empty"><Inbox size={36} /><h3>{tr('mkOps.app.emptyPanel', { panel: tabs[kind] })}</h3><p>{tr(status ? 'mkAdm.emptyFiltered' : 'mkAdm.emptyAll')}</p></div>}{!selected && listing && <PaginationBar page={page} pageSize={listing.meta.page_size} total={listing.meta.total} onPageChange={setPage} />}</>}
  </div>
}

// 二维码同样必须走独立 OSS；无配置时清晰报错，不生成假图片。
function SupportForm() {
  const [settings, setSettings] = useState<Item | null>(null)
  const [qr, setQr] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { request<Item>('/api/admin/marketplace/support').then(value => { setSettings(value); setQr(typeof value.qr_asset_id === 'number' ? value.qr_asset_id : null) }).catch(e => setMessage(e.message)) }, [])
  // 小二维码也使用同一分片协议，上传完成后需要 Worker 校验。
  async function uploadQr(file?: File) {
    if (!file) return; setBusy(true)
    try {
      const session = await request<{ id: number; asset_id: number; part_size: number }>('/api/marketplace/uploads', 'POST', { filename: file.name, size_bytes: file.size, kind: 'qr' })
      for (let start = 0, number = 1; start < file.size; start += session.part_size, number++) await request(`/api/marketplace/uploads/${session.id}/parts/${number}`, 'PUT', file.slice(start, start + session.part_size))
      await request(`/api/marketplace/uploads/${session.id}/complete`, 'POST'); setQr(session.asset_id); setMessage(tr('mkAdm.support.qrUploaded'))
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  // 后台保存仍校验二维码属于管理员且状态 ready。
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true)
    try { await request('/api/admin/marketplace/support', 'PUT', { name: form.get('name'), name_en: form.get('name_en'), hours_en: form.get('hours_en'), wechat: form.get('wechat'), hours: form.get('hours'), enabled: form.get('enabled') === 'on', qr_asset_id: qr }); setMessage(tr('mkAdm.support.saved')) } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  if (!settings) return <p>{message || tr('mkAdm.support.loading')}</p>
  return <form className="market-ops-support" onSubmit={save}><label className="block">{tr('mkAdm.support.name')}<input name="name" required maxLength={80} defaultValue={String(settings.name ?? tr('mkAdm.support.defaultName'))} className="block w-full rounded border bg-background p-2" /></label><label className="block">{tr('mkAdm.support.nameEn')}<input name="name_en" maxLength={160} defaultValue={String(settings.name_en ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">{tr('mkAdm.support.hoursEn')}<input name="hours_en" maxLength={200} defaultValue={String(settings.hours_en ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">{tr('mkAdm.support.wechat')}<input name="wechat" maxLength={100} defaultValue={String(settings.wechat ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">{tr('mkAdm.support.hours')}<input name="hours" maxLength={100} defaultValue={String(settings.hours ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">{tr('mkAdm.support.uploadQr')}<input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={e => uploadQr(e.target.files?.[0])} /></label><p>{tr('mkAdm.support.qrId', { id: String(qr ?? tr('mkAdm.support.notSet')) })}</p>{qr && <FileLink id={qr} label={tr('mkAdm.support.checkQr')} />}<label className="block"><input name="enabled" type="checkbox" defaultChecked={Boolean(settings.enabled)} /> {tr('mkAdm.support.enable')}</label><button type="submit" disabled={busy}>{tr('mkAdm.support.save')}</button><p role="status">{message}</p></form>
}

function RevenueConfigForm() {
  const [value, setValue] = useState<Item | null>(null)
  const [share, setShare] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState(() => tr('mkAdm.rev.loading'))
  const [busy, setBusy] = useState(false)
  useEffect(() => { request<Item>('/api/admin/marketplace/revenue-config').then(item => { setValue(item); setShare(String(item.platform_share_bps ?? '')); setEnabled(Boolean(item.enabled)); setMessage('') }).catch(e => setMessage(e.message)) }, [])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const bps = Number(share)
      if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error(tr('mkAdm.rev.errRange'))
      const result = await request<Item>('/api/admin/marketplace/revenue-config', 'PUT', { version: value?.version ?? 0, platform_share_bps: bps, enabled })
      setValue(result); setEnabled(Boolean(result.enabled)); setShare(String(result.platform_share_bps ?? '')); setMessage(tr(result.enabled ? 'mkAdm.rev.savedOn' : 'mkAdm.rev.savedOff'))
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support" onSubmit={save}><h2>{tr('mkAdm.rev.title')}</h2><p>{tr('mkAdm.rev.desc')}</p><label className="block">{tr('mkAdm.field.platform_share_bps')}<input type="number" min="0" max="10000" step="1" value={share} onChange={e => setShare(e.target.value)} required className="block w-full rounded border bg-background p-2" /></label>{share !== '' && Number.isInteger(Number(share)) && Number(share) >= 0 && Number(share) <= 10000 && <p>{tr('mkAdm.rev.current', { split: tr('mkOps.revenue.split', { platform: Number(share) / 100, creator: (10000 - Number(share)) / 100 }) })}</p>}<label className="block"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {tr('mkAdm.rev.enable')}</label><button type="submit" disabled={busy || !value}>{tr(busy ? 'mkOps.saving' : 'mkOps.cur.saveConfig')}</button><p role="status">{message}</p></form>
}

function PayoutCreateForm({ onSaved }: { onSaved: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    const formElement = e.currentTarget; const form = new FormData(formElement)
    try {
      await request('/api/admin/marketplace/payouts', 'POST', { owner_id: Number(form.get('owner_id')), amount_fen: Math.round(Number(form.get('amount')) * 100), status: form.get('status'), note: form.get('note') })
      formElement.reset(); setMessage(tr('mkAdm.payout.saved')); onSaved()
    } catch (err) { setMessage((err as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support" onSubmit={save}><h3>{tr('mkAdm.payout.createTitle')}</h3><div className="pf-market-field-row"><label>{tr('mkOps.app.creatorUserId')}<input name="owner_id" type="number" min="1" required /></label><label>{tr('mkAdm.field.amount_fen')}<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><label>{tr('mkOps.status')}<select name="status" defaultValue="paid"><option value="pending">{tr('mkAdm.payout.pending')}</option><option value="paid">{tr('mkAdm.payout.paid')}</option><option value="failed">{tr('mkAdm.payout.failed')}</option></select></label><label>{tr('mkAdm.field.note')}<textarea name="note" maxLength={3000} /></label><button type="submit" disabled={busy}>{tr(busy ? 'mkOps.saving' : 'mkAdm.payout.save')}</button><p role="status">{message}</p></form>
}








