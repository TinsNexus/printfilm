import { points } from '../lib/points'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, Download, Eye, FileText, ListChecks, ListFilter, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react'
import { resolveToolMediaUrl, type ToolRunRecord } from '../api/tools'
import { listGenerationTasks } from '../api/generationTasks'
import GenerationLayout from '../components/tools/GenerationLayout'
import GenerationDateRange from '../components/tools/GenerationDateRange'
import GenerationSelect from '../components/tools/GenerationSelect'
import { AssetDetailDialog } from '../components/assets/AssetDetailDialog'
import { useToolRunDetail } from '../hooks/useToolRunDetail'
import { mediaIcons, useGenerationText } from '../lib/generationMedia'
import { formatGenerationErrorMessage } from '../lib/generationError'
import { generationBillingState, generationRecordKey, generationTaskKind, generationTaskKinds as taskKinds, type GenerationTaskKind as TaskKind } from '../lib/generationTaskHistory'
import { subscribeWorkspace, workspaceScope } from '../features/teams/workspaceScope'
import Pagination from '../components/ui/Pagination'
import { fetchMediaBlob, triggerBlobDownload } from '../lib/clientDownload'
import { tr } from '../i18n/translate.ts'
import { getActiveLocale, LOCALE_DATE } from '../i18n/detect.ts'

const taskIcons = { ...mediaIcons, all: ListChecks, text: FileText }
const workspaceSnapshot = () => workspaceScope.epoch

export default function GenerationTasksPage() {
  if (!localStorage.getItem('token')) return <Navigate to="/auth?next=/tasks" replace />
  return <TaskHistory />
}

function TaskHistory() {
  const workspaceEpoch = useSyncExternalStore(subscribeWorkspace, workspaceSnapshot)
  return <TaskHistoryContent key={workspaceEpoch} />
}

function TaskHistoryContent() {
  const text = useGenerationText()
  const [params, setParams] = useSearchParams()
  const kind = generationTaskKind(params.get('kind'))
  const status = ['processing', 'succeeded', 'failed', 'cancelled'].includes(params.get('status') || '') ? params.get('status')! : ''
  const taskId = params.get('task_id') || ''
  const [query, setQuery] = useState(taskId)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [items, setItems] = useState<ToolRunRecord[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const { detail, asset: detailAsset, error: detailError, resultIndex, selectResult, openDetail, closeDetail } = useToolRunDetail()
  const [downloading, setDownloading] = useState<string | null>(null)
  const Icon = taskIcons[kind]
  const createPath = kind === 'all' ? '/' : `/tools/${kind}`
  const labels: Record<string, string> = {
    all: tr('generationTasksPage.all'), processing: tr('generationTasksPage.processing'), succeeded: tr('generationTasksPage.done'),
    failed: tr('generationTasksPage.failed'), cancelled: tr('generationTasksPage.cancelled'), queued: tr('generationTasksPage.queued'), running: tr('generationTasksPage.processing'),
  }
  const kindLabels: Record<TaskKind, string> = {
    all: tr('generationTasksPage.allTasks'), video: tr('generationTasksPage.videoTasks'), image: tr('generationTasksPage.imageTasks'),
    audio: tr('generationTasksPage.audioTasks'),
  }
  const billingLabels = {
    hidden: tr('generationTasksPage.costHidden'), pending: tr('generationTasksPage.pendingSettlement'), settled: tr('generationTasksPage.settled'),
    refunded: tr('generationTasksPage.refunded'), free: tr('generationTasksPage.noCharge'), not_charged: tr('generationTasksPage.notCharged'),
  }
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next); setPage(1)
  }
  useEffect(() => {
    const requestedKind = params.get('kind')
    if (!requestedKind || requestedKind === kind) return
    const next = new URLSearchParams(params)
    next.delete('kind')
    setParams(next, { replace: true })
  }, [params, setParams, kind])
  useEffect(() => { setQuery(taskId) }, [taskId])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    setLoading(true)
    async function refresh() {
      if (from && to && from > to) { setError(tr('generationTasksPage.startDateCannotAfterEnd')); setLoading(false); return }
      try {
        const data = await listGenerationTasks(page, pageSize, { kind: kind === 'all' ? undefined : kind, status, task_id: taskId,
          created_from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
          created_to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '' })
        if (disposed) return
        setItems(data.items); setTotal(data.total); setCounts(data.counts || {}); setError('')
        if (page > Math.max(1, Math.ceil(data.total / pageSize))) setPage(Math.max(1, Math.ceil(data.total / pageSize)))
        timer = setTimeout(refresh, 5000)
      } catch (err) {
        if (!disposed) { setError(err instanceof Error ? err.message : tr('generationTasksPage.failedLoad')); timer = setTimeout(refresh, 10000) }
      } finally { if (!disposed) setLoading(false) }
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [kind, status, taskId, from, to, page, pageSize, revision, text])

  async function download(item: ToolRunRecord, url = item.urls[0]) {
    setDownloading(generationRecordKey(item))
    try {
      const blob = item.kind === 'text' ? new Blob([item.text_content || ''], { type: 'text/plain;charset=utf-8' }) : await fetchMediaBlob(resolveToolMediaUrl(url))
      triggerBlobDownload(blob, `printfilm_${item.kind}_${item.id}.${item.kind === 'video' ? 'mp4' : item.kind === 'audio' ? 'mp3' : item.kind === 'text' ? 'txt' : 'png'}`)
    } catch (err) { setError(err instanceof Error ? err.message : tr('generationTasksPage.downloadFailed')) }
    finally { setDownloading(null) }
  }
  function when(value?: string | null) {
    return value ? new Date(value).toLocaleString(LOCALE_DATE[getActiveLocale()], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
  }
  function elapsed(item: ToolRunRecord) {
    if (!item.started_at || !item.finished_at) return '—'
    const seconds = Math.max(0, Math.round((Date.parse(item.finished_at) - Date.parse(item.started_at)) / 1000))
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  function errorSummary(error: string) {
    const friendlyMessage = formatGenerationErrorMessage(error)
    if (friendlyMessage !== error) return friendlyMessage
    if (/sensitive|policyviolation|content.?filter|审核/i.test(error)) return tr('generationTasksPage.contentFailedModerationAdjustDescription')
    if (/余额不足|insufficient.*balance/i.test(error)) return tr('generationTasksPage.insufficientBalanceTopUpTry')
    if (/timeout|timed out|超时/i.test(error)) return tr('generationTasksPage.generationTimedOutPleaseTry')
    return error.length > 90 || /^[{[]/.test(error) ? tr('generationTasksPage.notFinishedClickDetails') : error
  }
  const hasFilters = Boolean(status || taskId || from || to)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const StatusIcon = { succeeded: CheckCircle2, failed: AlertCircle, running: Clock3, queued: Clock3, cancelled: X }
  return <GenerationLayout tasks>
    <header className="gen-tasks-heading">
      <div><div className="gen-section-eyebrow">{tr('generationTasksPage.creations')}</div><h1>{tr('generationTasksPage.myTasks')}<span className="gen-heading-dot" /></h1><p>{tr('generationTasksPage.everyIdeaLeavesTrail')}</p></div>
      <div className="gen-task-actions"><button className="gen-secondary" type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'gen-spin' : ''} />{tr('generationTasksPage.refresh')}</button><Link className="gen-primary" to={createPath}><Plus size={18} />{tr('generationTasksPage.create')}</Link></div>
    </header>
    <div className="gen-library">
      <div className="gen-task-tabs"><div role="tablist" aria-label={tr('generationTasksPage.taskType')}>
        {taskKinds.map((value, index) => {
          const TabIcon = taskIcons[value]
          return <button type="button" key={value} id={`gen-tab-${value}`} role="tab" tabIndex={value === kind ? 0 : -1}
            aria-selected={value === kind} className={value === kind ? 'is-active' : ''} onClick={() => filter('kind', value === 'all' ? '' : value)}
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? taskKinds.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : taskKinds.length - 1)) % taskKinds.length
              filter('kind', taskKinds[next] === 'all' ? '' : taskKinds[next]); document.getElementById(`gen-tab-${taskKinds[next]}`)?.focus()
            }}><TabIcon size={18} />{kindLabels[value]}</button>
        })}
      </div><span className="gen-auto-sync"><i />{tr('generationTasksPage.autoRefresh')}</span></div>
      <div className="gen-task-filters">
        <div className="gen-status-tabs" aria-label={tr('generationTasksPage.taskStatus')}>
          {['all', 'processing', 'succeeded', 'failed', 'cancelled'].map(value => <button type="button" key={value} aria-pressed={(status || 'all') === value} className={(status || 'all') === value ? 'is-active' : ''} onClick={() => filter('status', value === 'all' ? '' : value)}>{labels[value]}<span>{counts[value] || 0}</span></button>)}
        </div>
        <div className="gen-filter-inputs">
          <form className={`gen-search ${taskId ? 'has-value' : ''}`} role="search" onSubmit={event => { event.preventDefault(); filter('task_id', query.trim()) }}>
            <Search size={18} aria-hidden /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr('generationTasksPage.searchTaskIdUpstreamId')} aria-label={tr('generationTasksPage.searchTaskId')} />
            {query && <button className="gen-search-clear" type="button" aria-label={tr('generationTasksPage.clearSearch')} onClick={() => { setQuery(''); filter('task_id', '') }}><X size={14} /></button>}
            <button type="submit" className="gen-search-submit" aria-label={tr('generationTasksPage.search')}><ArrowUpRight size={17} /></button>
          </form>
          <GenerationDateRange from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end); setPage(1) }} />
          {hasFilters && <button type="button" className="gen-reset-filters" onClick={() => { setFrom(''); setTo(''); setQuery(''); setParams({ kind }); setPage(1) }}>{tr('generationTasksPage.resetFilters')}</button>}
        </div>
      </div>
      {error && <p className="gen-inline-error" role="alert">{error}</p>}
      <div className="gen-list-heading" aria-hidden><span><ListFilter size={14} />{tr('generationTasksPage.output')}</span><span>{tr('generationTasksPage.taskStatus')}</span><span>{tr('generationTasksPage.cost')}</span><span>{tr('generationTasksPage.created')}</span><span>{tr('generationTasksPage.actions')}</span></div>
      <section className="gen-task-list" aria-label={tr('generationTasksPage.generationTasks')} aria-busy={loading}>
      {loading && !items.length ? <div className="gen-empty"><Loader2 className="gen-spin" size={28} />{tr('generationTasksPage.loadingTasks')}</div> : !items.length ? <div className="gen-empty"><Icon size={36} /><strong>{tr('generationTasksPage.noMatchingTasks')}</strong><p>{tr('generationTasksPage.adjustFiltersStartSomethingNew')}</p><Link to={createPath}>{tr('generationTasksPage.startCreating')} →</Link></div> : items.map(item => {
        const RowStatusIcon = StatusIcon[item.status as keyof typeof StatusIcon] || Clock3
        const RowIcon = taskIcons[item.kind as TaskKind] || FileText
        const recordKey = generationRecordKey(item)
        const billingState = generationBillingState(item)
        const ratio = typeof (item.params?.aspect_ratio ?? item.params?.ratio) === 'string' ? String(item.params?.aspect_ratio ?? item.params?.ratio) : ''
        const shortVideoImage = item.domain === 'kepu' && item.kind === 'image'
        const title = item.prompt || (shortVideoImage ? tr('generationTasksPage.aiShortVideoImage') : tr('generationTasksPage.generationTask'))
        const formatLabel = item.kind === 'video' ? 'MP4' : item.kind === 'audio' ? 'MP3' : item.kind === 'text' ? tr('generationTasksPage.text') : tr('generationTasksPage.image')
        return <article className={`gen-task-row ${item.status === 'failed' ? 'has-error' : ''}`} key={recordKey}>
        <button className="gen-task-cover" type="button" onClick={() => openDetail(item)} aria-label={tr('generationTasksPage.viewResults')}>
          {item.kind === 'image' && (item.preview_url || item.urls[0]) ? <img src={resolveToolMediaUrl(item.preview_url || item.urls[0])} alt="" /> : item.kind === 'video' && item.preview_url ? <img src={resolveToolMediaUrl(item.preview_url)} alt="" /> : item.kind === 'video' && item.urls[0] ? <video src={resolveToolMediaUrl(item.urls[0])} preload="metadata" muted /> : <RowIcon size={28} />}
          <span className="gen-cover-overlay"><Eye size={18} /></span>
        </button>
        <div className="gen-task-description"><button type="button" className="gen-task-title" onClick={() => openDetail(item)} title={title}>{title}</button><div className="gen-task-metadata"><span className="gen-task-tag">{kindLabels[item.kind as TaskKind] || 'AI'}</span>{shortVideoImage && <span className="gen-task-tag">{tr('generationTasksPage.aiShortVideo')}</span>}{item.kind === 'image' && item.urls.length > 1 && <span className="gen-task-tag">{tr('generationTasksPage.images', { length: item.urls.length })}</span>}{ratio && <span className="gen-task-tag">{ratio}</span>}</div>{item.error && <button type="button" className="gen-task-error" onClick={() => openDetail(item)} title={formatGenerationErrorMessage(item.error)}><AlertCircle size={12} /><span>{errorSummary(item.error)}</span><ArrowUpRight size={12} /></button>}</div>
        <div className="gen-task-state"><span className={`gen-state is-${item.status}`}><RowStatusIcon size={13} />{labels[item.status] || item.status}</span><small>{formatLabel}</small></div>
        <div className="gen-task-cost"><strong>{billingState === 'hidden' ? '—' : points(item.billing_charged_fen || 0)}</strong><small>{billingLabels[billingState]}</small></div>
        <div className="gen-task-time"><span>{when(item.created_at)}</span><small>{tr('generationTasksPage.duration')} {elapsed(item)}</small></div>
        <div className="gen-row-actions">{item.status === 'succeeded' && (item.kind === 'text' ? item.text_content : item.urls[0]) && <button type="button" className="gen-secondary" disabled={downloading === recordKey} onClick={() => void download(item)}>{downloading === recordKey ? <Loader2 size={15} className="gen-spin" /> : <Download size={15} />}{tr('generationTasksPage.download')}</button>}<button type="button" className="gen-icon-button" onClick={() => openDetail(item)} aria-label={tr('generationTasksPage.taskDetails')}><Eye size={18} /></button></div>
      </article>})}
    </section>
    <footer className="gen-task-pagination"><span>{tr('generationTasksPage.total')} <strong>{total}</strong> {tr('generationTasksPage.records')}<span className="gen-pagination-divider" />{tr('generationTasksPage.page', { page, pageCount })}</span>
      <div><Pagination page={page} pageCount={pageCount} onChange={setPage} showSummary={false} /><GenerationSelect compact label={tr('generationTasksPage.rowsPerPage')} value={String(pageSize)} options={[8, 16, 24, 50].map(value => ({ value: String(value), label: tr('generationTasksPage.page2', { value }) }))} onChange={value => { setPageSize(Number(value)); setPage(1) }} /></div>
    </footer>
    </div>
    {detail && detailAsset && <AssetDetailDialog key={generationRecordKey(detail)} asset={detailAsset} onClose={closeDetail}
      notice={<section className="pf-asset-detail-prompt"><div className="pf-asset-detail-text">
        <p role="status">{labels[detail.status] || detail.status}{(detail.status === 'queued' || detail.status === 'running') && tr('generationTasksPage.resultsUpdateAutomatically')}</p>
        {(detail.error || detailError) && <p role="alert">{formatGenerationErrorMessage(detail.error || detailError)}</p>}
      </div></section>}
      actions={detail.urls.length > 1 && <div className="pf-asset-detail-utilities" role="group" aria-label={tr('generationTasksPage.results')}>
        {detail.urls.map((url, index) => <button type="button" key={url} className="pf-btn pf-btn-sm" aria-pressed={resultIndex === index} onClick={() => selectResult(index)}>{tr('generationTasksPage.result', { n: index + 1 })}</button>)}
      </div>}>
    </AssetDetailDialog>}
  </GenerationLayout>
}
