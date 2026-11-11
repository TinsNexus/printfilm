import { tr } from "../../i18n/translate.ts";
import { points } from '../../lib/points'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleAlert, Coins, RefreshCw, Smartphone, Wallet } from 'lucide-react'
import { PaginationBar } from '@/components/PaginationBar'
import { request, type Item, type Listing } from './api'
import { appAmountFen, appMoney, appPanels, appRecordFields, appRecordIds, type AppPanel } from './appPresentation'
import FundingReviewForm from './FundingReviewForm'
import AppleValuationForm from './AppleValuationForm'

const base = '/api/admin/marketplace/app'
// 状态筛选：[值, 文案 key]，渲染时 tr
const stateOptions: Partial<Record<AppPanel, Array<[string, string]>>> = {
  transactions: [['paid', 'mkApp.label.paid'], ['refunded', 'mkApp.label.refunded']],
  notifications: [['pending', 'mkApp.label.pending'], ['running', 'mkApp.label.processing'], ['failed', 'mkApp.label.failed'], ['done', 'mkApp.label.done']],
  'unlock-orders': [['paid', 'mkApp.unlock.paid'], ['revoked', 'mkApp.unlock.revoked']],
  media: [['pending', 'mkOps.app.queued'], ['running', 'mkApp.label.processing'], ['done', 'mkApp.label.ready'], ['failed', 'mkOps.app.failed']],
}

/** App独立运营面板；所有余额、统计和财务判断均由服务端返回。 */
export default function AppOperations({ revision = 0 }: { revision?: number }) {
  const [panel, setPanel] = useState<AppPanel>('unlock-orders')
  const [environment, setEnvironment] = useState('Production')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')
  const [listing, setListing] = useState<Listing | null>(null)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<Item | null>(null)
  const supportsUserFilter = ['transactions', 'wallets', 'wallet-entries', 'unlock-orders', 'revenue', 'recharge-orders', 'funding-sources', 'debts', 'repayments'].includes(panel)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setListing(null)
    const params = new URLSearchParams({ page: String(page), page_size: '20', environment })
    if (status) params.set('status', status)
    if (userId && supportsUserFilter) params.set('user_id', userId)
    request<Listing>(`${base}/${panel}?${params}`).then(value => { if (active) setListing(value) })
      .catch(cause => { if (active) setError((cause as Error).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [panel, page, status, userId, supportsUserFilter, environment, refresh, revision])
  useEffect(() => {
    let active = true
    setSummary(null); setSummaryError('')
    request<Record<string, unknown>>(`${base}/summary?environment=${environment}`).then(value => { if (active) setSummary(value) })
      .catch(cause => { if (active) setSummaryError((cause as Error).message) })
    return () => { active = false }
  }, [environment, refresh, revision])
  function changePanel(next: AppPanel) {
    setPanel(next); setPage(1); setStatus(''); setEditing(null); setError(''); setMessage('')
  }
  async function retryNotification(id: number) {
    if (!window.confirm(tr('mkOps.app.confirmRetryNotification'))) return
    setBusy(true); setMessage(''); setError('')
    try { await request(`${base}/notifications/${id}/retry`, 'POST'); setRefresh(value => value + 1); setMessage(tr('mkOps.app.notificationQueued')) }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  async function retryMedia(id: number) {
    if (!window.confirm(tr('mkOps.app.confirmRetryMedia'))) return
    setBusy(true); setMessage(''); setError('')
    try { await request(`${base}/media/${id}/retry`, 'POST'); setRefresh(value => value + 1); setMessage(tr('mkOps.app.mediaQueued')) }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  const stats = [
    { key: 'wallet_balance_fen', label: tr('mkApp.field.balance_fen'), icon: Wallet },
    { key: 'topup_count', label: tr('mkOps.app.topupCount'), icon: Coins },
    { key: 'pending_notifications', label: tr('mkOps.app.pendingNotifications'), icon: CircleAlert },
    { key: 'payout_due_fen', label: tr('mkOps.app.payoutDue'), icon: Smartphone },
  ]
  return <section aria-label={tr('mkOps.app.sectionLabel')} className="grid gap-5">
    <div className="market-ops-feedback"><strong>{tr('mkOps.app.introTitle')}</strong><p className="mt-2">{tr('mkOps.app.intro')}</p></div>
    <div className="market-ops-filter"><label>{tr('mkApp.field.environment')} <select aria-label={tr('mkApp.field.environment')} value={environment} onChange={event => { setEnvironment(event.target.value); setPage(1); setEditing(null); setMessage('') }}><option value="Production">{tr('mkOps.env.production')}</option><option value="Sandbox">{tr('mkOps.env.sandbox')}</option></select></label><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> {tr('mkOps.app.refresh')}</button></div>
    {environment === 'Sandbox' && <p className="market-ops-feedback">{tr('mkOps.app.sandboxDeployNote')}</p>}
    <div className="market-ops-stats">{stats.map(card => <div key={card.key} className="market-ops-stat flex min-w-0 items-center gap-4 rounded-xl border border-[var(--ops-line)] bg-white p-5"><span className="market-ops-stat-icon"><card.icon size={20} /></span><span><span className="market-ops-stat-label">{card.label}</span><strong>{summary?.[card.key] === undefined ? '—' : card.key === 'wallet_balance_fen' ? points(summary[card.key]) : card.key.endsWith('_fen') ? appMoney(summary[card.key]) : String(summary[card.key])}</strong></span></div>)}</div>
    {environment === 'Sandbox' && <p className="market-ops-feedback">{tr('mkOps.app.sandboxRecordsNote')}</p>}
    {summaryError && <p role="alert" className="market-ops-feedback is-error">{tr('mkOps.app.summaryFailed', { error: summaryError })}</p>}
    {summary && <p className="market-ops-context">{tr('mkOps.app.summaryLine', { app: tr(summary.app_enabled ? 'mkOps.app.on' : 'mkOps.app.off'), iap: tr(summary.iap_enabled ? 'mkOps.app.on' : 'mkOps.app.off'), ready: tr(summary.production_ready ? 'mkOps.app.prodReady' : 'mkOps.app.notReady'), debt: appMoney(summary.creator_debt_fen) })}</p>}
    <nav className="flex flex-wrap gap-2" aria-label={tr('mkOps.app.panelsNav')}>{Object.entries(appPanels).map(([key, label]) => <button type="button" key={key} aria-pressed={panel === key} className={panel === key ? 'market-ops-approve' : ''} onClick={() => changePanel(key as AppPanel)}>{label}</button>)}</nav>
    {panel === 'products' && <ProductForm key={`${editing?.id ?? 'new'}-${editing?.enabled}`} item={editing} onSaved={() => { setEditing(null); setRefresh(value => value + 1) }} onCancel={() => setEditing(null)} />}
    {panel === 'transactions' && <AppleValuationForm onSaved={() => setRefresh(value => value + 1)} />}
    {panel === 'funding-reviews' && <FundingReviewForm environment={environment} onSaved={() => setRefresh(value => value + 1)} />}
    {panel === 'settlements' && <FinanceForm key={`settlement-${environment}`} kind="settlement" environment={environment} onSaved={() => setRefresh(value => value + 1)} />}
    {panel === 'payouts' && <FinanceForm key={`payout-${environment}`} kind="payout" environment={environment} onSaved={() => setRefresh(value => value + 1)} />}
    {panel === 'revenue' && <p className="market-ops-feedback">{tr('mkOps.app.revenueNote')}</p>}
    {(panel === 'products' || panel === 'media') && <p className="market-ops-context">{tr(panel === 'products' ? 'mkOps.app.productsNote' : 'mkOps.app.mediaNote')}</p>}
    <div className="market-ops-filter"><div><h2>{appPanels[panel]}</h2><span>{listing ? tr('mkOps.app.totalN', { n: listing.meta.total }) : tr('mkOps.app.readingRecords')}</span></div>{stateOptions[panel] && <select aria-label={tr('mkOps.app.recordStatus')} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">{tr('mkOps.allStatuses')}</option>{stateOptions[panel]?.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</select>}{supportsUserFilter && <label className="text-sm">{tr(panel === 'revenue' ? 'mkApp.field.owner_id' : 'mkApp.field.user_id')} <input aria-label={tr('mkOps.app.filterUserId')} type="number" min="1" value={userId} onChange={event => { setUserId(event.target.value); setPage(1) }} placeholder={tr(panel === 'revenue' ? 'mkOps.app.allCreators' : 'mkOps.app.allUsers')} /></label>}</div>
    {error && <p role="alert" className="market-ops-feedback is-error">{error}<button type="button" className="ml-3" onClick={() => setRefresh(value => value + 1)}>{tr('mkOps.reload')}</button></p>}
    {message && <p role="status" className="market-ops-feedback">{message}</p>}
    {loading ? <p role="status">{tr('mkOps.app.loadingPanel', { panel: appPanels[panel] })}</p> : listing?.items.length ? <div>{listing.items.map(item => <article className="market-ops-record" key={item.id}><header className="market-ops-record-head"><div><span className="market-ops-record-id">#{item.id}</span><h3>{String(item.title || item.product_id || item.out_trade_no || appPanels[panel])}</h3></div></header><dl className="market-ops-summary">{appRecordFields(item, panel).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{panel === 'products' && <button type="button" onClick={() => setEditing(item)}>{tr('mkOps.app.editProduct')}</button>}{panel === 'notifications' && item.status === 'failed' && <button type="button" disabled={busy} onClick={() => void retryNotification(item.id)}>{tr('mkOps.app.retryNotification')}</button>}{panel === 'media' && item.status === 'failed' && <button type="button" disabled={busy} onClick={() => void retryMedia(item.id)}>{tr('mkOps.app.retryMedia')}</button>}</article>)}</div> : !error && <div className="market-ops-empty"><h3>{tr('mkOps.app.emptyPanel', { panel: appPanels[panel] })}</h3><p>{tr('mkOps.app.emptyHint')}</p></div>}
    {!loading && listing && <PaginationBar page={page} pageSize={listing.meta.page_size} total={listing.meta.total} onPageChange={setPage} />}
  </section>
}

/** 商品只保存苹果编号和固定币数；真实售价由StoreKit展示。 */
function ProductForm({ item, onSaved, onCancel }: { item: Item | null; onSaved: () => void; onCancel: () => void }) {
  const [presets, setPresets] = useState<Array<Record<string, unknown>>>([])
  const [skuId, setSkuId] = useState(String(item?.sku_id || 'topup_10'))
  useEffect(() => { let active = true; request<{items: Array<Record<string, unknown>>}>(`${base}/product-presets`).then(result => { if (active) setPresets(result.items) }).catch(cause => { if (active) setError((cause as Error).message) }); return () => { active = false } }, [])
  useEffect(() => { setSkuId(String(item?.sku_id || 'topup_10')) }, [item])
  const preset = presets.find(row => row.id === skuId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const coins = Number(preset?.credit_fen)
      const price = Number(preset?.amount_fen)
      if (!Number.isSafeInteger(coins) || coins <= 0) throw new Error(tr('mkOps.app.errCredit'))
      await request(`${base}/products`, 'PUT', { product_id: String(item?.product_id || preset?.product_id), sku_id: skuId, coins, price_fen: price, expected_prices: preset?.expected_prices, enabled: form.get('enabled') === 'on' })
      setMessage(tr('mkOps.app.productSaved')); onSaved()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support max-w-none" onSubmit={save}>
    <h3>{tr(item ? 'mkOps.app.editProductTitle' : 'mkOps.app.bindProductTitle')}</h3>
    <p>{tr('mkOps.app.productDesc')}</p>
    <div className="grid gap-4 md:grid-cols-4">
      <label>{tr('mkOps.app.sharedPackage')}<select value={skuId} disabled={Boolean(item?.sku_id)} onChange={event => setSkuId(event.target.value)}>{presets.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)} · {String(row.id)}</option>)}</select></label>
      <label>{tr('mkApp.field.product_id')}<input readOnly value={String(item?.product_id || preset?.product_id || '')} /></label>
      <label>{tr('mkApp.field.total_units')}<input readOnly value={preset ? points(preset.credit_fen) : tr('mkOps.loadingShort')} /></label>
      <label>{tr('mkOps.app.expectedPrice')}<input readOnly value={preset ? `CNY ${Number(preset.amount_fen) / 100} / USD ${Number((preset.expected_prices as Record<string, number>)?.USD) / 100}` : tr('mkOps.loadingShort')} /></label>
    </div>
    <label><input type="checkbox" name="enabled" defaultChecked={Boolean(item?.enabled)} /> {tr('mkOps.app.allowPurchase')}</label>
    <div className="flex gap-3"><button type="submit" disabled={busy}>{tr(busy ? 'mkOps.saving' : 'mkOps.app.saveProduct')}</button>{item && <button type="button" onClick={onCancel}>{tr('mkOps.app.cancelEdit')}</button>}</div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form>
}

/** 登记已核对的账单与线下打款，金额和可结算余额必须由服务端复核。 */
function FinanceForm({ kind, environment, onSaved }: { kind: 'settlement' | 'payout'; environment: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const settlement = kind === 'settlement'
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const values = settlement ? { environment, month: form.get('month'), transaction_ids: appRecordIds(form.get('ids')), channel_fee_fen: appAmountFen(form.get('channel_fee')), tax_fen: appAmountFen(form.get('tax')), received_fen: appAmountFen(form.get('received'), true, true), note: form.get('note') }
        : { environment, owner_id: Number(form.get('owner_id')), ledger_ids: appRecordIds(form.get('ids')), amount_fen: appAmountFen(form.get('amount')), note: form.get('note') }
      const fingerprint = JSON.stringify(values)
      if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
      const body = { ...values, idempotency_key: intent.current.key }
      if (!window.confirm(tr(settlement ? 'mkOps.app.confirmSettlement' : 'mkOps.app.confirmPayout'))) return
      setBusy(true)
      await request(`${base}/${settlement ? 'settlements' : 'payouts'}`, 'POST', body)
      intent.current = null; setMessage(tr(settlement ? 'mkOps.app.settlementSaved' : 'mkOps.app.payoutSaved')); onSaved()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form key={`${kind}-${environment}`} className="market-ops-support max-w-none" onSubmit={save}>
    <h3>{tr(settlement ? 'mkOps.app.settlementTitle' : 'mkOps.app.payoutTitle')}</h3>
    <p>{tr(settlement ? 'mkOps.app.settlementDesc' : 'mkOps.app.payoutDesc')}</p>
    <div className="grid gap-4 md:grid-cols-3">
      {settlement ? <>
        <label>{tr('mkApp.field.month')}<input name="month" type="month" required /></label>
        <label>{tr('mkOps.app.appleFee')}<input name="channel_fee" type="number" min="0" step="0.01" required /></label>
        <label>{tr('mkOps.app.taxYuan')}<input name="tax" type="number" min="0" step="0.01" required /></label>
        <label>{tr('mkOps.app.netReceived')}<input name="received" type="number" step="0.01" required /></label>
      </> : <>
        <label>{tr('mkOps.app.creatorUserId')}<input name="owner_id" type="number" min="1" step="1" required /></label>
        <label>{tr('mkOps.app.paidAmount')}<input name="amount" type="number" min="0" step="0.01" required /></label>
      </>}
      <label>{tr(settlement ? 'mkApp.field.transaction_ids' : 'mkApp.field.ledger_ids')}<input name="ids" required placeholder={tr('mkOps.app.idsPlaceholder')} /></label>
    </div>
    <label>{tr('mkOps.app.evidenceNote')}<textarea name="note" required maxLength={3000} rows={3} placeholder={tr(settlement ? 'mkOps.app.settlementPlaceholder' : 'mkOps.app.payoutPlaceholder')} /></label>
    <button type="submit" disabled={busy || environment === 'Sandbox'}>{tr(busy ? 'mkOps.saving' : settlement ? 'mkOps.funding.submit' : 'mkOps.app.submitPayout')}</button>
    {environment === 'Sandbox' && <p>{tr('mkOps.app.sandboxFinanceNote')}</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form>
}
