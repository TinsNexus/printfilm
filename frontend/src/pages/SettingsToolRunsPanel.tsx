import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye } from 'lucide-react'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import Modal from '../components/ui/Modal'
import Pagination from '../components/ui/Pagination'
import { fetchMediaBlob, triggerBlobDownload } from '../lib/clientDownload'
import {
  getToolRun,
  listToolRuns,
  resolveToolMediaUrl,
  type ToolRunRecord,
} from '../api/tools'
import { getToolDef } from '../lib/toolsCatalog'
import { pageCountOf } from '../lib/pagination'
import { useI18n } from '../i18n'
import { tr } from '../i18n/translate'

const PAGE_SIZE_DEFAULT = 8

// 状态 → 文案键（展示时再翻译，避免模块级常量固化语言）
const STATUS_KEY: Record<string, string> = {
  queued: 'toolRuns.statusRunning',
  running: 'toolRuns.statusRunning',
  succeeded: 'toolRuns.statusDone',
  failed: 'toolRuns.statusFailed',
}

// 格式化记录时间
function formatWhen(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 封面：预览图或结果首张
function coverOf(item: ToolRunRecord): string {
  return resolveToolMediaUrl(item.preview_url || item.urls[0] || '')
}

// 是否视频类结果
function isVideoRecord(item: ToolRunRecord, url?: string): boolean {
  if (item.kind === 'video') return true
  const target = url || item.urls[0] || item.preview_url || ''
  return /\.mp4($|\?)/i.test(target)
}

// 下载文件名：工具名 + 记录 id
function downloadName(item: ToolRunRecord, url: string): string {
  const tool = getToolDef(item.tool_id)
  const title = (tool?.title || item.tool_id).replace(/\s+/g, '')
  const ext = isVideoRecord(item, url) ? 'mp4' : url.match(/\.([a-z0-9]{3,4})($|\?)/i)?.[1] || 'png'
  return `${title}_${item.id}.${ext}`
}

/** 个人中心「工具创作」列表：服务端分页 + 详情查看/下载 */
export default function SettingsToolRunsPanel() {
  const { t: tx } = useI18n()
  const statusLabel = (s: string) => (STATUS_KEY[s] ? tx(STATUS_KEY[s]) : s)
  /*
   * page 页码
   * pageSize 每页条数
   * items 当前页记录
   * total 总数
   * loading 加载中
   * error 错误
   * detail 详情弹窗记录
   * detailLoading 详情加载中
   * downloading 正在下载的 url
   * actionError 下载/详情错误
   */
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [items, setItems] = useState<ToolRunRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ToolRunRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    listToolRuns(page, pageSize)
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : tr('toolRuns.failedLoad'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize])

  const pageCount = pageCountOf(total, pageSize)

  // 打开详情：再拉一次接口，确保 OSS 地址最新
  async function openDetail(item: ToolRunRecord) {
    setActionError('')
    setDetail(item)
    setDetailLoading(true)
    try {
      const fresh = await getToolRun(item.id)
      setDetail(fresh)
      setItems((prev) => prev.map((row) => (row.id === fresh.id ? fresh : row)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tx('toolRuns.couldLoadDetails'))
    } finally {
      setDetailLoading(false)
    }
  }

  // 从 OSS/公网地址下载结果
  async function downloadUrl(item: ToolRunRecord, url: string) {
    const abs = resolveToolMediaUrl(url)
    if (!abs) return
    setActionError('')
    setDownloading(abs)
    try {
      const blob = await fetchMediaBlob(abs)
      triggerBlobDownload(blob, downloadName(item, abs))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tx('toolRuns.downloadFailed'))
    } finally {
      setDownloading('')
    }
  }

  return (
    <section className="pf-settings-card">
      <div className="pf-settings-card-head">
        <div>
          <h1>{tx('toolRuns.toolCreations')}</h1>
          <p className="pf-muted">{tx('toolRuns.generationHistoryStandaloneTools')}</p>
        </div>
        <div className="pf-settings-actions">
          <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/tools">
            {tx('toolRuns.startCreating')}
          </Link>
        </div>
      </div>
      {loading ? <p className="pf-muted">{tx('toolRuns.loading')}</p> : null}
      {error ? <BillingErrorNotice message={error} /> : null}
      {actionError ? <BillingErrorNotice message={actionError} /> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="pf-settings-empty">
          <p>{tx('toolRuns.toolCreationsYet')}</p>
          <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/tools">
            {tx('toolRuns.startCreating')}
          </Link>
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="pf-settings-list">
          {items.map((item) => {
            const tool = getToolDef(item.tool_id)
            const cover = coverOf(item)
            const video = isVideoRecord(item, cover)
            const firstUrl = item.urls[0] || item.preview_url || ''
            const canDownload = item.status === 'succeeded' && Boolean(firstUrl)
            return (
              <li key={item.id}>
                <div className="pf-settings-list-row pf-settings-tool-row">
                  <button type="button" className="pf-settings-tool-main" onClick={() => void openDetail(item)}>
                    {cover ? (
                      video && !item.preview_url ? (
                        <video className="pf-settings-thumb" src={cover} muted />
                      ) : (
                        <img className="pf-settings-thumb" src={cover} alt="" />
                      )
                    ) : (
                      <span className="pf-settings-thumb is-empty" aria-hidden />
                    )}
                    <span className="pf-settings-list-main">
                      <strong>{tool?.title || item.tool_id}</strong>
                      <em className="pf-muted">
                        {statusLabel(item.status)}
                        {item.prompt ? ` · ${item.prompt.slice(0, 36)}` : ''}
                      </em>
                    </span>
                  </button>
                  <span className="pf-settings-tool-actions">
                    <span className="pf-settings-list-meta pf-muted">{formatWhen(item.created_at)}</span>
                    <button
                      type="button"
                      className="pf-btn pf-btn-ghost pf-btn-sm"
                      onClick={() => void openDetail(item)}
                    >
                      <Eye size={14} aria-hidden />
                      {tx('toolRuns.view')}
                    </button>
                    <button
                      type="button"
                      className="pf-btn pf-btn-ghost pf-btn-sm"
                      disabled={!canDownload || downloading === resolveToolMediaUrl(firstUrl)}
                      onClick={() => void downloadUrl(item, firstUrl)}
                    >
                      <Download size={14} aria-hidden />
                      {downloading === resolveToolMediaUrl(firstUrl) ? tx('toolRuns.downloading') : tx('toolRuns.download')}
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onChange={setPage}
        ariaLabel={tx('toolRuns.toolCreationPages')}
      />

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? getToolDef(detail.tool_id)?.title || tx('toolRuns.creationDetails') : tx('toolRuns.creationDetails')}
        size="lg"
        className="pf-tool-run-modal"
        footer={
          detail ? (
            <div className="pf-tool-run-foot">
              <Link className="pf-btn pf-btn-ghost pf-btn-sm" to={`/tools/${detail.tool_id}`} onClick={() => setDetail(null)}>
                {tx('toolRuns.createAgain')}
              </Link>
              {detail.urls[0] || detail.preview_url ? (
                <button
                  type="button"
                  className="pf-btn pf-btn-lime pf-btn-sm"
                  disabled={
                    detail.status !== 'succeeded' ||
                    downloading === resolveToolMediaUrl(detail.urls[0] || detail.preview_url || '')
                  }
                  onClick={() => void downloadUrl(detail, detail.urls[0] || detail.preview_url || '')}
                >
                  <Download size={14} aria-hidden />
                  {tx('toolRuns.downloadResult')}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailLoading && !detail?.urls.length ? <p className="pf-muted">{tx('toolRuns.loading')}</p> : null}
        {detail ? (
          <div className="pf-tool-run-detail">
            <div className="pf-tool-run-media">
              {detail.urls.length || detail.preview_url ? (
                isVideoRecord(detail) && (detail.urls[0] || '').match(/\.mp4/i) ? (
                  <video src={resolveToolMediaUrl(detail.urls[0])} controls playsInline />
                ) : (
                  <img
                    src={resolveToolMediaUrl(detail.urls[0] || detail.preview_url)}
                    alt={tx('toolRuns.generatedResult')}
                  />
                )
              ) : (
                <p className="pf-muted">
                  {statusLabel(detail.status)}
                  {detail.error ? ` · ${detail.error}` : tx('toolRuns.resultReadyYet')}
                </p>
              )}
            </div>
            <dl className="pf-tool-run-meta">
              <div>
                <dt>{tx('toolRuns.status')}</dt>
                <dd>{statusLabel(detail.status)}</dd>
              </div>
              <div>
                <dt>{tx('toolRuns.time')}</dt>
                <dd>{formatWhen(detail.created_at)}</dd>
              </div>
              {detail.prompt ? (
                <div className="is-block">
                  <dt>{tx('toolRuns.prompt')}</dt>
                  <dd>{detail.prompt}</dd>
                </div>
              ) : null}
              {detail.params?.ratio ? (
                <div>
                  <dt>{tx('toolRuns.aspectRatio')}</dt>
                  <dd>{detail.params.ratio}</dd>
                </div>
              ) : null}
              {detail.params?.mode ? (
                <div>
                  <dt>{tx('toolRuns.outputType')}</dt>
                  <dd>{detail.params.mode}</dd>
                </div>
              ) : null}
              {detail.params?.pack ? (
                <div>
                  <dt>{tx('toolRuns.tool')}</dt>
                  <dd>{detail.params.pack}</dd>
                </div>
              ) : null}
              {detail.error ? (
                <div className="is-block">
                  <dt>{tx('toolRuns.error')}</dt>
                  <dd className="pf-error">{detail.error}</dd>
                </div>
              ) : null}
            </dl>
            {detail.urls.length > 1 ? (
              <div className="pf-tool-run-files">
                {detail.urls.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    className="pf-btn pf-btn-ghost pf-btn-sm"
                    disabled={downloading === resolveToolMediaUrl(url)}
                    onClick={() => void downloadUrl(detail, url)}
                  >
                    <Download size={14} aria-hidden />
                    {tx('toolRuns.downloadFileN', { n: idx + 1 })}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
