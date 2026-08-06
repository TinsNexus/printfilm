import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Project } from '../api'
import BrandMark from '../components/BrandMark'

type HistoryItem = Omit<Project, 'shots'>

const STATUS_LABEL: Record<string, string> = {
  PARALLEL_ASSETS: '出图+配音并行',
  ASSETS_READY: '素材就绪',
  DRAFT: '草稿',
  SCRIPTING: '拆分镜中',
  SCRIPT_READY: '分镜完成',
  IMAGING: '出图+配音并行中',
  IMAGE_READY: '分镜图完成',
  VIDEOING: '生成 AI 视频',
  VIDEO_READY: '视频完成',
  AUDIOING: '生成配音',
  COMPOSING: '合成成片',
  AUDITING: '审核中',
  DONE: '已完成',
  FAILED: '失败',
  REJECTED: '未通过',
  CANCELLED: '已取消',
}

function isRunning(status: string) {
  return [
    'SCRIPTING',
    'IMAGING',
    'VIDEOING',
    'AUDIOING',
    'COMPOSING',
    'AUDITING',
    'PARALLEL_ASSETS',
  ].includes(status)
}

function statusTone(status: string) {
  if (status === 'DONE') return 'ok'
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELLED') return 'bad'
  if (isRunning(status)) return 'run'
  return 'idle'
}

function canDownload(p: HistoryItem) {
  return p.status === 'DONE' && Boolean(p.final_video_url)
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function HistoryPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [packing, setPacking] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<{ url: string; title: string; bust?: string } | null>(null)

  const hasRunning = useMemo(
    () => items.some((p) => isRunning(p.status) && p.progress < 100),
    [items],
  )

  const downloadable = useMemo(() => items.filter(canDownload), [items])
  const selectedDownloadable = useMemo(
    () => downloadable.filter((p) => selected.has(p.id)),
    [downloadable, selected],
  )
  const allDownloadableSelected =
    downloadable.length > 0 && downloadable.every((p) => selected.has(p.id))

  async function load() {
    try {
      const list = await api.listProjects()
      setItems(list as HistoryItem[])
      setError('')
      setSelected((prev) => {
        const ids = new Set(list.map((x) => x.id))
        return new Set([...prev].filter((id) => ids.has(id)))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    load()
  }, [nav])

  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [hasRunning])

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAllDownloadable() {
    if (allDownloadableSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        downloadable.forEach((p) => next.delete(p.id))
        return next
      })
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      downloadable.forEach((p) => next.add(p.id))
      return next
    })
  }

  async function onBatchDownload() {
    const ids = selectedDownloadable.map((p) => p.id)
    if (!ids.length) {
      setError('请先勾选已完成的作品')
      return
    }
    setPacking(true)
    setError('')
    try {
      const { blob, filename } = await api.downloadZip(ids)
      triggerBlobDownload(blob, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打包下载失败')
    } finally {
      setPacking(false)
    }
  }

  async function onCancel(p: HistoryItem) {
    if (!window.confirm(`取消「${p.title || '未命名作品'}」的生成任务？`)) return
    setBusyId(p.id)
    try {
      await api.cancelProject(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失败')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(p: HistoryItem) {
    if (!window.confirm(`删除「${p.title || '未命名作品'}」？此操作不可恢复。`)) return
    setBusyId(p.id)
    try {
      await api.deleteProject(p.id)
      setItems((prev) => prev.filter((x) => x.id !== p.id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(p.id)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <BrandMark />
        <nav>
          <Link to="/studio">创作</Link>
          <Link to="/history">历史</Link>
          <Link to="/">首页</Link>
        </nav>
      </header>

      <section className="section history-section">
        <div className="history-head">
          <div>
            <h2>创作历史</h2>
            <p className="lede">查看草稿、进行中任务与已完成作品，点击可继续编辑。</p>
          </div>
          <div className="history-head-actions">
            {downloadable.length > 0 && (
              <>
                <label className="history-select-all">
                  <input
                    type="checkbox"
                    checked={allDownloadableSelected}
                    onChange={toggleAllDownloadable}
                  />
                  全选可下载（{downloadable.length}）
                </label>
                <button
                  type="button"
                  className="btn primary"
                  disabled={packing || selectedDownloadable.length === 0}
                  onClick={onBatchDownload}
                >
                  {packing
                    ? '打包中…'
                    : `打包下载${selectedDownloadable.length ? `（${selectedDownloadable.length}）` : ''}`}
                </button>
              </>
            )}
            <button type="button" className="btn ghost" onClick={() => load()} disabled={packing}>
              刷新
            </button>
          </div>
        </div>

        {loading && <p className="muted">加载中…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <p>还没有创作记录。</p>
            <button type="button" className="btn primary" onClick={() => nav('/studio')}>
              去创作
            </button>
          </div>
        )}

        <div className="history-list">
          {items.map((p) => {
            const tone = statusTone(p.status)
            const label = STATUS_LABEL[p.status] || p.status
            const busy = busyId === p.id
            const downloadableItem = canDownload(p)
            const checked = selected.has(p.id)
            return (
              <article
                key={p.id}
                className={`history-card tone-${tone}${checked ? ' selected' : ''}`}
              >
                <div className="history-select">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!downloadableItem || packing}
                    title={downloadableItem ? '勾选以打包下载' : '未完成，无法下载'}
                    onChange={(e) => toggleOne(p.id, e.target.checked)}
                    aria-label={`选择 ${p.title || p.id}`}
                  />
                </div>
                <button
                  type="button"
                  className="history-cover clickable"
                  onClick={() => nav(`/studio?project=${p.id}`)}
                >
                  {p.cover_url ? (
                    <img src={api.assetUrl(p.cover_url)} alt="" />
                  ) : (
                    <div className="placeholder">#{p.id}</div>
                  )}
                </button>
                <div className="history-body">
                  <header>
                    <h3>
                      <button
                        type="button"
                        className="linkish title-btn"
                        onClick={() => nav(`/studio?project=${p.id}`)}
                      >
                        {p.title || '未命名作品'}
                      </button>
                    </h3>
                    <span className={`status-pill tone-${tone}`}>{label}</span>
                  </header>
                  <p className="muted small">
                    模板 {p.template_id}
                    {p.pipeline_mode === 'image_text' ? ' · 图文模式' : ' · 完整成片'}
                    {' · '}
                    {new Date(p.created_at).toLocaleString()}
                  </p>
                  <div className="progress-bar" aria-label={`进度 ${p.progress}%`}>
                    <i style={{ width: `${Math.max(0, Math.min(100, p.progress))}%` }} />
                  </div>
                  <div className="history-meta">
                    <span>进度 {p.progress}%</span>
                    {p.error_msg && <span className="error small truncate">{p.error_msg}</span>}
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => nav(`/studio?project=${p.id}`)}
                    >
                      打开
                    </button>
                    {p.status === 'DONE' && p.final_video_url && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() =>
                          setPreview({
                            url: p.final_video_url!,
                            title: p.title || '成片',
                            bust: p.updated_at,
                          })
                        }
                      >
                        播放
                      </button>
                    )}
                    {isRunning(p.status) && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => onCancel(p)}
                      >
                        取消任务
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() => onDelete(p)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {preview && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPreview(null)}>
          <div
            className={`modal preview-modal${preview.url.includes('/generated/') ? ' portrait' : ''}`}
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="preview-head">
              <h3>{preview.title}</h3>
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
                关闭
              </button>
            </header>
            <video
              key={`${preview.url}:${preview.bust || ''}`}
              className="preview-media"
              src={api.assetUrl(preview.url, preview.bust)}
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      )}
    </div>
  )
}
