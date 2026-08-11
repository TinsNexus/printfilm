import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type UsageSummary } from '../api'
import type { Project } from '../api'
import AppShell from '../components/layout/AppShell'
import PillTabs from '../components/ui/PillTabs'
import StatCard from '../components/ui/StatCard'
import {
  IconClapper,
  IconClock,
  IconCopy,
  IconDownload,
  IconEdit,
  IconEye,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconTrash,
} from '../components/ui/Icons'
import { dialog } from '../lib/dialog'
import {
  downloadSingleVideo,
  triggerBlobDownload,
  zipVideosClient,
} from '../lib/clientDownload'
import { isRunning, STATUS_CN, statusTone } from '../lib/status'

type HistoryItem = Omit<Project, 'shots'>

const PAGE_SIZE = 8

/** 格式化 token 数量，过大时用 k/M 缩写 */
function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString('zh-CN')
}

function canDownload(p: HistoryItem) {
  return p.status === 'DONE' && Boolean(p.final_video_url)
}

function statusBadgeClass(status: string) {
  const tone = statusTone(status)
  if (tone === 'ok') return 'ok'
  if (tone === 'run') return 'run'
  if (tone === 'bad') return 'bad'
  if (status === 'DRAFT') return 'draft'
  return ''
}

export default function HistoryPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [packing, setPacking] = useState(false)
  const [packProgress, setPackProgress] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState('全部')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [preview, setPreview] = useState<{
    url: string
    title: string
    projectId: number
  } | null>(null)

  const hasRunning = useMemo(
    () => items.some((p) => isRunning(p.status) && p.progress < 100),
    [items],
  )

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
    api.templates().then((list) => {
      const map: Record<string, string> = {}
      for (const t of list) map[t.id] = t.name
      setTemplates(map)
    })
    api
      .usageSummary()
      .then(setUsage)
      .catch(() => setUsage(null))
  }, [nav])

  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(() => {
      load().catch(() => undefined)
    }, 2000)
    return () => clearInterval(timer)
  }, [hasRunning])

  useEffect(() => {
    setPage(1)
  }, [tab, q])

  const stats = useMemo(() => {
    const total = items.length
    const generating = items.filter((p) => isRunning(p.status)).length
    const done = items.filter((p) => p.status === 'DONE').length
    return { total, generating, done }
  }, [items])

  const filtered = useMemo(() => {
    let list = items
    if (tab === '草稿') list = list.filter((p) => p.status === 'DRAFT')
    else if (tab === '生成中') list = list.filter((p) => isRunning(p.status))
    else if (tab === '已完成') list = list.filter((p) => p.status === 'DONE')
    else if (tab === '已发布') list = list.filter((p) => p.status === 'DONE')
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter((p) => p.title.toLowerCase().includes(s))
    }
    return list
  }, [items, tab, q])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const downloadable = useMemo(() => items.filter(canDownload), [items])
  const selectedDownloadable = useMemo(
    () => downloadable.filter((p) => selected.has(p.id)),
    [downloadable, selected],
  )

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function remove(id: number) {
    const ok = await dialog.confirm({
      title: '删除项目',
      message: '确定删除该项目？素材与成片将一并清除。',
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(id)
    try {
      await api.deleteProject(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  async function downloadOne(p: HistoryItem) {
    if (!canDownload(p) || !p.final_video_url) return
    setBusyId(p.id)
    setError('')
    try {
      await downloadSingleVideo({
        url: api.assetUrl(p.final_video_url, p.updated_at),
        title: p.title,
        projectId: p.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setBusyId(null)
    }
  }

  async function downloadPreview() {
    if (!preview) return
    setBusyId(preview.projectId)
    setError('')
    try {
      await downloadSingleVideo({
        url: preview.url,
        title: preview.title,
        projectId: preview.projectId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setBusyId(null)
    }
  }

  async function packSelected() {
    if (!selectedDownloadable.length) return
    setPacking(true)
    setPackProgress(`0/${selectedDownloadable.length}`)
    setError('')
    try {
      const { blob, filename } = await zipVideosClient(
        selectedDownloadable.map((p) => ({
          id: p.id,
          title: p.title,
          url: api.assetUrl(p.final_video_url!, p.updated_at),
        })),
        (done, total) => setPackProgress(`${done}/${total}`),
      )
      triggerBlobDownload(blob, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打包失败')
    } finally {
      setPacking(false)
      setPackProgress('')
    }
  }

  function continueEdit(p: HistoryItem) {
    if (p.status === 'DRAFT') nav(`/studio/${p.id}/style`)
    else nav(`/studio/${p.id}`)
  }

  function pageButtons() {
    const buttons: (number | '…')[] = []
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) buttons.push(i)
      return buttons
    }
    buttons.push(1)
    if (page > 3) buttons.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) buttons.push(i)
    if (page < pageCount - 2) buttons.push('…')
    buttons.push(pageCount)
    return buttons
  }

  return (
    <AppShell active="history" wide>
      <div className="pf-history-head">
        <div>
          <h1>我的项目</h1>
          <p>管理你的 AI 视频创作项目，继续编辑或发布你的作品。</p>
        </div>
        <button type="button" className="pf-btn pf-btn-lime pf-btn-icon" onClick={() => nav('/studio/new')}>
          <IconPlus size={16} />
          新建项目
        </button>
      </div>

      <div className="pf-stats">
        <StatCard
          label="总作品数"
          value={stats.total}
          trend="—"
          icon={<IconClapper size={18} />}
        />
        <StatCard
          label="生成中"
          value={stats.generating}
          trend={stats.generating ? '正在生成中' : '暂无任务'}
          icon={<IconRefresh size={18} />}
        />
        <StatCard
          label="已完成"
          value={stats.done}
          trend="—"
          icon={<IconSend size={18} />}
        />
        <StatCard
          label="本月时长"
          value="—"
          trend="额度统计即将推出"
          icon={<IconClock size={18} />}
        />
      </div>

      <div className="pf-history-layout">
        <section className="pf-history-main">
          <div className="pf-history-filters">
            <PillTabs
              items={['全部', '草稿', '生成中', '已完成', '已发布']}
              value={tab}
              onChange={setTab}
              ariaLabel="项目状态"
            />
            <div className="pf-history-filter-right">
              <button type="button" className="pf-type-select" disabled title="即将推出">
                全部类型
              </button>
              <label className="pf-search-field">
                <IconSearch size={15} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索项目名称"
                />
              </label>
            </div>
          </div>

          <div className="pf-history-batch">
            <button
              type="button"
              className="pf-btn-text"
              disabled={!selectedDownloadable.length || packing}
              onClick={packSelected}
            >
              <IconDownload size={15} />
              {packing
                ? `打包中 ${packProgress}…`
                : `打包下载 (${selectedDownloadable.length})`}
            </button>
          </div>

          {error ? <p className="pf-error">{error}</p> : null}
          {loading ? <p className="pf-muted">加载中…</p> : null}
          {!loading && filtered.length === 0 ? (
            <div className="pf-history-empty">暂无项目，点击「新建项目」开始创作</div>
          ) : null}

          <div className="pf-project-list">
            {pageItems.map((p) => {
              const badge = statusBadgeClass(p.status)
              const ratio =
                p.output_ratio || (p.pipeline_mode === 'image_text' ? '9:16' : '16:9')
              const tplName = templates[p.template_id] || p.template_id
              const when = new Date(p.updated_at || p.created_at).toLocaleString()
              return (
                <article key={p.id} className="pf-project-card">
                  <label className="pf-project-check">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      disabled={!canDownload(p)}
                      onChange={() => toggle(p.id)}
                    />
                  </label>
                  <button
                    type="button"
                    className="pf-project-thumb"
                    onClick={() => continueEdit(p)}
                  >
                    {p.cover_url ? (
                      <img src={api.assetUrl(p.cover_url, p.updated_at)} alt="" />
                    ) : (
                      <div className="ph">无封面</div>
                    )}
                    {isRunning(p.status) ? (
                      <span className="pf-thumb-progress">{p.progress}%</span>
                    ) : null}
                  </button>
                  <div className="pf-project-info">
                    <h3>{p.title}</h3>
                    <div className="pf-project-meta">
                      <span className={`pf-badge ${badge}`}>
                        {STATUS_CN[p.status] || p.status}
                      </span>
                      <span className="pf-muted">
                        模板 {tplName} · {when}
                      </span>
                    </div>
                    {isRunning(p.status) ? (
                      <div className="pf-inline-meter">
                        <i style={{ width: `${Math.min(100, p.progress)}%` }} />
                      </div>
                    ) : null}
                    {p.error_msg ? <p className="pf-error pf-project-err">{p.error_msg}</p> : null}
                  </div>
                  <div className="pf-project-ratio">{ratio}</div>
                  <div className="pf-project-actions">
                    <button type="button" className="pf-btn-text" onClick={() => continueEdit(p)}>
                      <IconEdit size={14} />
                      继续编辑
                    </button>
                    <button
                      type="button"
                      className="pf-btn-text"
                      disabled={!p.final_video_url}
                      onClick={() =>
                        p.final_video_url &&
                        setPreview({
                          url: api.assetUrl(p.final_video_url, p.updated_at),
                          title: p.title,
                          projectId: p.id,
                        })
                      }
                    >
                      <IconEye size={14} />
                      预览
                    </button>
                    <button
                      type="button"
                      className="pf-btn-text"
                      disabled={!canDownload(p) || busyId === p.id || packing}
                      onClick={() => downloadOne(p)}
                    >
                      <IconDownload size={14} />
                      {busyId === p.id ? '下载中…' : '下载'}
                    </button>
                    <button type="button" className="pf-btn-text" disabled title="即将推出">
                      <IconCopy size={14} />
                      复制
                    </button>
                    <button
                      type="button"
                      className="pf-icon-btn danger"
                      disabled={busyId === p.id}
                      title="删除"
                      onClick={() => remove(p.id)}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {filtered.length > 0 ? (
            <div className="pf-pagination">
              <button
                type="button"
                className="pf-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {pageButtons().map((b, i) =>
                b === '…' ? (
                  <span key={`e-${i}`} className="pf-page-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={b}
                    type="button"
                    className={page === b ? 'pf-page-btn active' : 'pf-page-btn'}
                    onClick={() => setPage(b)}
                  >
                    {b}
                  </button>
                ),
              )}
              <button
                type="button"
                className="pf-page-btn"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                ›
              </button>
            </div>
          ) : null}
        </section>

        <aside className="pf-history-side">
          <div className="pf-side-box">
            <h3>本月使用情况</h3>
            <p className="pf-side-desc">按上游 token 实际用量计费</p>

            <div className="pf-usage-row">
              <span>Token 用量</span>
              <span className="pf-usage-val">{formatTokens(usage?.tokens ?? 0)}</span>
            </div>
            <div className="pf-meter">
              <i
                style={{
                  width: `${Math.min(100, Math.log10((usage?.tokens || 0) + 1) * 18)}%`,
                }}
              />
            </div>

            <div className="pf-usage-row">
              <span>本月费用</span>
              <span className="pf-usage-val">¥{(usage?.charge_yuan ?? 0).toFixed(2)}</span>
            </div>
            <div className="pf-meter">
              <i
                style={{
                  width: `${Math.min(100, (usage?.charge_fen || 0) / 20)}%`,
                }}
              />
            </div>

            <div className="pf-usage-row">
              <span>可用余额</span>
              <span className="pf-usage-val">¥{(usage?.balance_yuan ?? 0).toFixed(2)}</span>
            </div>
            {(usage?.frozen_fen ?? 0) > 0 ? (
              <div className="pf-usage-row">
                <span>冻结中</span>
                <span className="pf-muted">¥{(usage?.frozen_yuan ?? 0).toFixed(2)}</span>
              </div>
            ) : null}

            <div className="pf-usage-foot">
              <span className="pf-muted">调用 {usage?.calls ?? 0} 次</span>
              <Link to="/pricing" className="pf-link">
                去充值 →
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {preview ? (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>{preview.title}</h3>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  disabled={busyId === preview.projectId}
                  onClick={downloadPreview}
                >
                  <IconDownload size={14} />
                  {busyId === preview.projectId ? '下载中…' : '下载'}
                </button>
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm"
                  onClick={() => setPreview(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <video className="preview-media" src={preview.url} controls autoPlay />
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
