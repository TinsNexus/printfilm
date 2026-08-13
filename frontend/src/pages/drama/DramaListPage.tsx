/** 漫剧 Agent 首页：AI 生剧本 / 自由画布 + 我的项目（多选删除） */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Clapperboard,
  FolderOpen,
  LayoutGrid,
  Library,
  MoreHorizontal,
  PenLine,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import { dramaApi, type DramaProjectListItem } from '../../api/drama'
import { dialog } from '../../lib/dialog'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import RequireAuth from './RequireAuth'
import { DramaEpisodeCountPopover } from './DramaEpisodeCountPopover'
import { DramaImageStyleModal } from './DramaImageStyleModal'
import './drama.css'

const CREATIVE_MIN_LENGTH = 20
const CANVAS_PLACEHOLDER =
  '自由画布创作项目，稍后在画布中完善故事与资产。'

type AgentTab = 'ai' | 'canvas'

// 格式化更新时间
function formatUpdatedAt(raw?: string) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 封面竖排标题（无预览图时）
function verticalTitleLabel(name: string, max = 12): string {
  const clean = (name || '').replace(/\s+/g, '')
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

export default function DramaListPage() {
  return (
    <RequireAuth>
      <DramaListInner />
    </RequireAuth>
  )
}

// 渲染 Agent 首页内容
function DramaListInner() {
  const navigate = useNavigate()
  /*
   * tab 当前面板 Tab
   * storyText AI 创意输入
   * episodeCount 目标集数
   * imageStyleId 画面风格
   * items 我的项目列表
   * loading 列表加载中
   * busy 创建中
   * canvasBusy 画布创建中
   * error 错误文案
   * selected 多选 id
   * deleting 批量删除中
   */
  const [tab, setTab] = useState<AgentTab>('ai')
  const [storyText, setStoryText] = useState('')
  const [episodeCount, setEpisodeCount] = useState(12)
  const [imageStyleId, setImageStyleId] = useState<ImageStyleId | ''>('')
  const [items, setItems] = useState<DramaProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // 加载项目列表
  async function loadProjects() {
    const rows = await dramaApi.listProjects()
    setItems(rows)
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id))
      return new Set([...prev].filter((id) => ids.has(id)))
    })
  }

  useEffect(() => {
    setLoading(true)
    loadProjects()
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  // AI 立即生成：创建项目并进入大纲步骤
  async function handleGenerate() {
    const source = storyText.trim()
    if (source.length < CREATIVE_MIN_LENGTH) {
      setError(`故事内容至少 ${CREATIVE_MIN_LENGTH} 字`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const project = await dramaApi.createProject({
        source,
        episode_count: episodeCount,
        image_style_id: imageStyleId || undefined,
        title: source.slice(0, 40),
      })
      navigate(`/drama/projects/${project.id}`, { state: { activeStep: 'outline' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  // 自由画布：创建占位创意项目并进入画布
  async function handleEnterCanvas() {
    if (canvasBusy) return
    setCanvasBusy(true)
    setError('')
    try {
      const project = await dramaApi.createProject({
        source: CANVAS_PLACEHOLDER,
        episode_count: 1,
        title: '自由画布项目',
      })
      navigate(`/drama/projects/${project.id}/canvas`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建画布项目失败')
    } finally {
      setCanvasBusy(false)
    }
  }

  // 切换 Tab；画布 Tab 直接创建并跳转
  function handleTabClick(next: AgentTab) {
    if (next === 'canvas') {
      void handleEnterCanvas()
      return
    }
    setTab('ai')
  }

  const selectionMode = selected.size > 0
  const storyLen = storyText.trim().length
  const canGenerate = storyLen >= CREATIVE_MIN_LENGTH && !busy
  const withScript = items.filter((i) => i.has_script).length

  // 切换选中
  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 打开项目（多选模式下改为勾选）
  function openProject(item: DramaProjectListItem) {
    if (selectionMode) {
      toggleSelect(item.id)
      return
    }
    navigate(`/drama/projects/${item.id}`)
  }

  // 重命名
  async function handleRename(item: DramaProjectListItem) {
    const name = await dialog.prompt({
      title: '重命名项目',
      message: '输入新的项目名称',
      defaultValue: item.title,
      confirmText: '保存',
    })
    if (!name?.trim() || name.trim() === item.title) return
    try {
      await dramaApi.updateProject(item.id, { title: name.trim() })
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败')
    }
  }

  // 删除单个
  async function handleDeleteOne(item: DramaProjectListItem) {
    const ok = await dialog.confirm({
      title: '删除项目',
      message: `确定删除「${item.title}」？分集、剧本与资产将一并删除，且无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await dramaApi.deleteProject(item.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  // 批量删除
  async function handleDeleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await dialog.confirm({
      title: '删除项目',
      message: `将删除已选择的 ${ids.length} 个项目，包含分集、剧本与资产等数据，删除后无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await Promise.all(ids.map((id) => dramaApi.deleteProject(id)))
      setSelected(new Set())
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppShell active="drama">
      <div className="drama-page drama-agent-page">
        <header className="drama-agent-hero">
          <div className="drama-agent-hero-main">
            <div className="drama-agent-hero-icon" aria-hidden>
              <Wand2 size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1>漫剧 Agent</h1>
              <p className="drama-agent-hero-sub">
                输入创意一键生成分集剧本，或从{' '}
                <strong>自由画布</strong> 搭故事与资产
              </p>
            </div>
          </div>
          <div className="drama-agent-hero-actions">
            <Link className="drama-btn-ghost drama-agent-assets-link" to="/drama/assets">
              <Library size={16} strokeWidth={1.75} aria-hidden />
              外部资产库
            </Link>
          </div>
        </header>

        <div className="drama-agent-tips" role="note">
          <Sparkles size={15} strokeWidth={1.75} aria-hidden />
          <span>
            建议写明 <strong>故事设定</strong>、<strong>人物特征</strong>、<strong>剧情脉络</strong> 与结局走向，生成更稳。
          </span>
        </div>

        <section className="drama-agent-panel" aria-label="创作入口">
          <div className="drama-agent-panel-head">
            <div className="drama-agent-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'ai'}
                className={tab === 'ai' ? 'active' : ''}
                onClick={() => handleTabClick('ai')}
              >
                <PenLine size={15} strokeWidth={1.75} aria-hidden />
                AI 生剧本
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={false}
                disabled={canvasBusy}
                onClick={() => handleTabClick('canvas')}
              >
                <LayoutGrid size={15} strokeWidth={1.75} aria-hidden />
                {canvasBusy ? '创建中…' : '自由画布'}
              </button>
            </div>
          </div>

          {tab === 'ai' ? (
            <div className="drama-agent-ai">
              <label className="drama-agent-ai-label" htmlFor="drama-agent-story">
                故事创意
              </label>
              <div className="drama-agent-ai-field">
                <textarea
                  id="drama-agent-story"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  disabled={busy}
                  placeholder="在此输入你构想的故事内容。可以尝试输入这些要素：故事设定、主角特征、剧情脉络、最终结局等等"
                  rows={6}
                />
                <span
                  className={`drama-agent-char-count${storyLen >= CREATIVE_MIN_LENGTH ? ' is-ok' : ''}`}
                  aria-live="polite"
                >
                  {storyLen}/{CREATIVE_MIN_LENGTH}
                </span>
              </div>
              <div className="drama-agent-ai-footer">
                <div className="drama-agent-ai-options">
                  <DramaImageStyleModal
                    value={imageStyleId}
                    onChange={setImageStyleId}
                    disabled={busy}
                  />
                  <span className="drama-agent-opt-divider" aria-hidden />
                  <DramaEpisodeCountPopover
                    value={episodeCount}
                    onChange={setEpisodeCount}
                    disabled={busy}
                  />
                </div>
                <button
                  type="button"
                  className="drama-btn-primary drama-agent-generate-btn"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  <Sparkles size={16} strokeWidth={1.75} aria-hidden />
                  {busy ? '创建中…' : '立即生成'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {error ? <p className="drama-error drama-agent-error">{error}</p> : null}

        <section className="drama-project-section">
          <header className="drama-project-section-head">
            <div className="drama-project-section-title">
              <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
              <h2>我的项目</h2>
              {!loading && items.length > 0 ? (
                <span className="drama-project-section-count">{items.length}</span>
              ) : null}
            </div>
            {!loading && items.length > 0 ? (
              <p className="drama-project-section-sub">
                共 <strong>{items.length}</strong> 部 · 已写剧本{' '}
                <strong>{withScript}</strong>
              </p>
            ) : null}
          </header>

          {loading ? (
            <div className="drama-project-list" aria-busy="true" aria-label="加载项目">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="drama-project-row drama-project-row-skeleton" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="drama-project-empty">
              <Clapperboard size={40} strokeWidth={1.25} aria-hidden />
              <p>暂无项目，先用上方面板生成一部吧</p>
              <button
                type="button"
                className="drama-btn-ghost"
                onClick={() => document.getElementById('drama-agent-story')?.focus()}
              >
                去写故事创意
              </button>
            </div>
          ) : (
            <div className="drama-project-list">
              {items.map((item) => {
                const isSelected = selected.has(item.id)
                return (
                  <article
                    key={item.id}
                    className={`drama-project-row${isSelected ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="drama-project-row-poster"
                      onClick={() => openProject(item)}
                      aria-label={`打开 ${item.title}`}
                    >
                      <div className="drama-project-row-poster-fallback">
                        <span className="drama-project-row-poster-vertical">
                          {verticalTitleLabel(item.title)}
                        </span>
                      </div>
                      <label
                        className={`drama-project-row-check${isSelected || selectionMode ? ' is-visible' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </label>
                      <span className="drama-project-row-ep-badge">
                        {item.episode_count || 0} 集
                      </span>
                    </button>

                    <button
                      type="button"
                      className="drama-project-row-body"
                      onClick={() => openProject(item)}
                    >
                      <strong className="drama-project-row-title">{item.title}</strong>
                      <div className="drama-project-row-meta">
                        <span>
                          <Clapperboard size={14} strokeWidth={1.75} aria-hidden />
                          {item.asset_count || 0} 资产
                        </span>
                        {item.has_script ? (
                          <span className="drama-project-row-tag is-script">已有剧本</span>
                        ) : (
                          <span className="drama-project-row-tag">待写剧本</span>
                        )}
                        <span className="drama-project-row-time">
                          {formatUpdatedAt(item.updated_at || item.created_at)}
                        </span>
                      </div>
                    </button>

                    <details className="drama-project-row-more" onClick={(e) => e.stopPropagation()}>
                      <summary aria-label="更多操作">
                        <MoreHorizontal size={16} strokeWidth={1.8} />
                      </summary>
                      <div className="drama-project-row-menu">
                        <button type="button" onClick={() => void handleRename(item)}>
                          重命名
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => void handleDeleteOne(item)}
                        >
                          删除
                        </button>
                      </div>
                    </details>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {selected.size > 0 ? (
          <div className="drama-project-selection-bar">
            <div className="drama-project-selection-inner">
              <span>已选择 {selected.size} 个项目</span>
              <button
                type="button"
                className="drama-project-selection-cancel"
                disabled={deleting}
                onClick={() => setSelected(new Set())}
              >
                取消选择
              </button>
              <button
                type="button"
                className="drama-project-selection-delete"
                disabled={deleting}
                onClick={() => void handleDeleteSelected()}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                {deleting ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
