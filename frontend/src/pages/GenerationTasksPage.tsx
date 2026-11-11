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
    all: text(tr('generationTasksPage.all'), 'All'), processing: text(tr('generationTasksPage.processing'), 'Processing'), succeeded: text(tr('generationTasksPage.done'), 'Completed'),
    failed: text(tr('generationTasksPage.failed'), 'Failed'), cancelled: text(tr('generationTasksPage.cancelled'), 'Cancelled'), queued: text(tr('generationTasksPage.queued'), 'Queued'), running: text(tr('generationTasksPage.processing'), 'Processing'),
  }
  const kindLabels: Record<TaskKind, string> = {
    all: text(tr('generationTasksPage.allTasks'), 'All tasks'), video: text(tr('generationTasksPage.videoTasks'), 'Video tasks'), image: text(tr('generationTasksPage.imageTasks'), 'Image tasks'),
    audio: text(tr('generationTasksPage.audioTasks'), 'Audio tasks'),
  }
  const billingLabels = {
    hidden: text(tr('generationTasksPage.costHidden'), 'Cost hidden'), pending: text(tr('generationTasksPage.pendingSettlement'), 'Pending charge'), settled: text(tr('generationTasksPage.settled'), 'Charged'),
    refunded: text(tr('generationTasksPage.refunded'), 'Refunded'), free: text(tr('generationTasksPage.noCharge'), 'No charge'), not_charged: text(tr('generationTasksPage.notCharged'), 'Not charged'),
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
      if (from && to && from > to) { setError(text(tr('generationTasksPage.startDateCannotAfterEnd'), 'Start date must precede end date')); setLoading(false); return }
      try {
        const data = await listGenerationTasks(page, pageSize, { kind: kind === 'all' ? undefined : kind, status, task_id: taskId,
          created_from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
          created_to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '' })
        if (disposed) return
        setItems(data.items); setTotal(data.total); setCounts(data.counts || {}); setError('')
        if (page > Math.max(1, Math.ceil(data.total / pageSize))) setPage(Math.max(1, Math.ceil(data.total / pageSize)))
        timer = setTimeout(refresh, 5000)
      } catch (err) {
        if (!disposed) { setError(err instanceof Error ? err.message : text(tr('generationTasksPage.failedLoad'), 'Loading failed')); timer = setTimeout(refresh, 10000) }
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
    } catch (err) { setError(err instanceof Error ? err.message : text(tr('generationTasksPage.downloadFailed'), 'Download failed')) }
    finally { setDownloading(null) }
  }
  function when(value?: string | null) {
    return value ? new Date(value).toLocaleString(text('zh-CN', 'en-US'), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
  }
  function elapsed(item: ToolRunRecord) {
    if (!item.started_at || !item.finished_at) return '—'
    const seconds = Math.max(0, Math.round((Date.parse(item.finished_at) - Date.parse(item.started_at)) / 1000))
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  function errorSummary(error: string) {
    const friendlyMessage = formatGenerationErrorMessage(error)
    if (friendlyMessage !== error) return friendlyMessage
    if (/sensitive|policyviolation|content.?filter|审核/i.test(error)) return text(tr('generationTasksPage.contentFailedModerationAdjustDescription'), 'Content review failed. Try adjusting your prompt.')
    if (/余额不足|insufficient.*balance/i.test(error)) return text(tr('generationTasksPage.insufficientBalanceTopUpTry'), 'Insufficient balance. Please top up.')
    if (/timeout|timed out|超时/i.test(error)) return text(tr('generationTasksPage.generationTimedOutPleaseTry'), 'Generation timed out. Please try again.')
    return error.length > 90 || /^[{[]/.test(error) ? text(tr('generationTasksPage.notFinishedClickDetails'), 'Generation failed. View details for more information.') : error
  }
  const hasFilters = Boolean(status || taskId || from || to)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const StatusIcon = { succeeded: CheckCircle2, failed: AlertCircle, running: Clock3, queued: Clock3, cancelled: X }
  return <GenerationLayout tasks>
    <header className="gen-tasks-heading">
      <div><div className="gen-section-eyebrow">{text(tr('generationTasksPage.creations'), 'CREATION LIBRARY')}</div><h1>{text(tr('generationTasksPage.myTasks'), 'My tasks')}<span className="gen-heading-dot" /></h1><p>{text(tr('generationTasksPage.everyIdeaLeavesTrail'), 'Every idea, all in one place.')}</p></div>
      <div className="gen-task-actions"><button className="gen-secondary" type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'gen-spin' : ''} />{text(tr('generationTasksPage.refresh'), 'Refresh')}</button><Link className="gen-primary" to={createPath}><Plus size={18} />{text(tr('generationTasksPage.create'), 'Create something')}</Link></div>
    </header>
    <div className="gen-library">
      <div className="gen-task-tabs"><div role="tablist" aria-label={text(tr('generationTasksPage.taskType'), 'Media type')}>
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
      </div><span className="gen-auto-sync"><i />{text(tr('generationTasksPage.autoRefresh'), 'Auto-updating')}</span></div>
      <div className="gen-task-filters">
        <div className="gen-status-tabs" aria-label={text(tr('generationTasksPage.taskStatus'), 'Task status')}>
          {['all', 'processing', 'succeeded', 'failed', 'cancelled'].map(value => <button type="button" key={value} aria-pressed={(status || 'all') === value} className={(status || 'all') === value ? 'is-active' : ''} onClick={() => filter('status', value === 'all' ? '' : value)}>{labels[value]}<span>{counts[value] || 0}</span></button>)}
        </div>
        <div className="gen-filter-inputs">
          <form className={`gen-search ${taskId ? 'has-value' : ''}`} role="search" onSubmit={event => { event.preventDefault(); filter('task_id', query.trim()) }}>
            <Search size={18} aria-hidden /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={text(tr('generationTasksPage.searchTaskIdUpstreamId'), 'Search task or upstream ID')} aria-label={text(tr('generationTasksPage.searchTaskId'), 'Search task ID')} />
            {query && <button className="gen-search-clear" type="button" aria-label={text(tr('generationTasksPage.clearSearch'), 'Clear search')} onClick={() => { setQuery(''); filter('task_id', '') }}><X size={14} /></button>}
            <button type="submit" className="gen-search-submit" aria-label={text(tr('generationTasksPage.search'), 'Search')}><ArrowUpRight size={17} /></button>
          </form>
          <GenerationDateRange from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end); setPage(1) }} />
          {hasFilters && <button type="button" className="gen-reset-filters" onClick={() => { setFrom(''); setTo(''); setQuery(''); setParams({ kind }); setPage(1) }}>{text(tr('generationTasksPage.resetFilters'), 'Reset filters')}</button>}
        </div>
      </div>
      {error && <p className="gen-inline-error" role="alert">{error}</p>}
      <div className="gen-list-heading" aria-hidden><span><ListFilter size={14} />{text(tr('generationTasksPage.output'), 'Creation')}</span><span>{text(tr('generationTasksPage.taskStatus'), 'Status')}</span><span>{text(tr('generationTasksPage.cost'), 'Cost')}</span><span>{text(tr('generationTasksPage.created'), 'Created')}</span><span>{text(tr('generationTasksPage.actions'), 'Actions')}</span></div>
      <section className="gen-task-list" aria-label={text(tr('generationTasksPage.generationTasks'), 'Generation history')} aria-busy={loading}>
      {loading && !items.length ? <div className="gen-empty"><Loader2 className="gen-spin" size={28} />{text(tr('generationTasksPage.loadingTasks'), 'Loading tasks…')}</div> : !items.length ? <div className="gen-empty"><Icon size={36} /><strong>{text(tr('generationTasksPage.noMatchingTasks'), 'No matching tasks')}</strong><p>{text(tr('generationTasksPage.adjustFiltersStartSomethingNew'), 'Adjust your filters or create something new.')}</p><Link to={createPath}>{text(tr('generationTasksPage.startCreating'), 'Start creating')} →</Link></div> : items.map(item => {
        const RowStatusIcon = StatusIcon[item.status as keyof typeof StatusIcon] || Clock3
        const RowIcon = taskIcons[item.kind as TaskKind] || FileText
        const recordKey = generationRecordKey(item)
        const billingState = generationBillingState(item)
        const ratio = typeof (item.params?.aspect_ratio ?? item.params?.ratio) === 'string' ? String(item.params?.aspect_ratio ?? item.params?.ratio) : ''
        const shortVideoImage = item.domain === 'kepu' && item.kind === 'image'
        const title = item.prompt || (shortVideoImage ? text(tr('generationTasksPage.aiShortVideoImage'), 'AI short video images') : text(tr('generationTasksPage.generationTask'), 'Generation task'))
        const formatLabel = item.kind === 'video' ? 'MP4' : item.kind === 'audio' ? 'MP3' : item.kind === 'text' ? text(tr('generationTasksPage.text'), 'Text') : text(tr('generationTasksPage.image'), 'Image')
        return <article className={`gen-task-row ${item.status === 'failed' ? 'has-error' : ''}`} key={recordKey}>
        <button className="gen-task-cover" type="button" onClick={() => openDetail(item)} aria-label={text(tr('generationTasksPage.viewResults'), 'View result')}>
          {item.kind === 'image' && (item.preview_url || item.urls[0]) ? <img src={resolveToolMediaUrl(item.preview_url || item.urls[0])} alt="" /> : item.kind === 'video' && item.preview_url ? <img src={resolveToolMediaUrl(item.preview_url)} alt="" /> : item.kind === 'video' && item.urls[0] ? <video src={resolveToolMediaUrl(item.urls[0])} preload="metadata" muted /> : <RowIcon size={28} />}
          <span className="gen-cover-overlay"><Eye size={18} /></span>
        </button>
        <div className="gen-task-description"><button type="button" className="gen-task-title" onClick={() => openDetail(item)} title={title}>{title}</button><div className="gen-task-metadata"><span className="gen-task-tag">{kindLabels[item.kind as TaskKind] || 'AI'}</span>{shortVideoImage && <span className="gen-task-tag">{text(tr('generationTasksPage.aiShortVideo'), 'AI short video')}</span>}{item.kind === 'image' && item.urls.length > 1 && <span className="gen-task-tag">{text(tr('generationTasksPage.images', { length: item.urls.length }), `${item.urls.length} images`)}</span>}{ratio && <span className="gen-task-tag">{ratio}</span>}</div>{item.error && <button type="button" className="gen-task-error" onClick={() => openDetail(item)} title={formatGenerationErrorMessage(item.error)}><AlertCircle size={12} /><span>{errorSummary(item.error)}</span><ArrowUpRight size={12} /></button>}</div>
        <div className="gen-task-state"><span className={`gen-state is-${item.status}`}><RowStatusIcon size={13} />{labels[item.status] || item.status}</span><small>{formatLabel}</small></div>
        <div className="gen-task-cost"><strong>{billingState === 'hidden' ? '—' : points(item.billing_charged_fen || 0)}</strong><small>{billingLabels[billingState]}</small></div>
        <div className="gen-task-time"><span>{when(item.created_at)}</span><small>{text('耗时', 'Duration')} {elapsed(item)}</small></div>
        <div className="gen-row-actions">{item.status === 'succeeded' && (item.kind === 'text' ? item.text_content : item.urls[0]) && <button type="button" className="gen-secondary" disabled={downloading === recordKey} onClick={() => void download(item)}>{downloading === recordKey ? <Loader2 size={15} className="gen-spin" /> : <Download size={15} />}{text('下载', 'Download')}</button>}<button type="button" className="gen-icon-button" onClick={() => openDetail(item)} aria-label={text('查看任务详情', 'Task details')}><Eye size={18} /></button></div>
      </article>})}
    </section>
    <footer className="gen-task-pagination"><span>{text(tr('generationTasksPage.total'), 'Total')} <strong>{total}</strong> {text(tr('generationTasksPage.records'), 'creations')}<span className="gen-pagination-divider" />{text(tr('generationTasksPage.page', { page, pageCount }), `Page ${page} of ${pageCount}`)}</span>
      <div><Pagination page={page} pageCount={pageCount} onChange={setPage} showSummary={false} /><GenerationSelect compact label={text(tr('generationTasksPage.rowsPerPage'), 'Items per page')} value={String(pageSize)} options={[8, 16, 24, 50].map(value => ({ value: String(value), label: text(tr('generationTasksPage.page2', { value }), `${value} / page`) }))} onChange={value => { setPageSize(Number(value)); setPage(1) }} /></div>
    </footer>
    </div>
    {detail && detailAsset && <AssetDetailDialog key={generationRecordKey(detail)} asset={detailAsset} onClose={closeDetail}
      notice={<section className="pf-asset-detail-prompt"><div className="pf-asset-detail-text">
        <p role="status">{labels[detail.status] || detail.status}{(detail.status === 'queued' || detail.status === 'running') && text(tr('generationTasksPage.resultsUpdateAutomatically'), '. Results will update automatically.')}</p>
        {(detail.error || detailError) && <p role="alert">{formatGenerationErrorMessage(detail.error || detailError)}</p>}
      </div></section>}
      actions={detail.urls.length > 1 && <div className="pf-asset-detail-utilities" role="group" aria-label={text(tr('generationTasksPage.results'), 'Generation results')}>
        {detail.urls.map((url, index) => <button type="button" key={url} className="pf-btn pf-btn-sm" aria-pressed={resultIndex === index} onClick={() => selectResult(index)}>{text(tr('generationTasksPage.result', { n: index + 1 }), `Result ${index + 1}`)}</button>)}
      </div>}>
    </AssetDetailDialog>}
  </GenerationLayout>
}
