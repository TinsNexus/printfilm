/** 漫剧 Agent 首页：AI 生剧本 / 自由画布 + 我的项目（多选删除） */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clapperboard, MoreHorizontal, Trash2 } from 'lucide-react'
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
    loadProjects().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
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

  const canGenerate = storyText.trim().length >= CREATIVE_MIN_LENGTH && !busy

  return (
    <AppShell active="drama">
      <div className="drama-page drama-agent-page">
        <header className="drama-agent-hero">
          <div className="drama-agent-hero-row">
            <h1>漫剧 Agent</h1>
            <Link className="pf-btn" to="/drama/assets">
              外部资产库
            </Link>
          </div>
        </header>

        <section className="drama-agent-panel">
          <div className="drama-agent-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ai'}
              className={tab === 'ai' ? 'active' : ''}
              onClick={() => handleTabClick('ai')}
            >
              AI 生剧本
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              className=""
              disabled={canvasBusy}
              onClick={() => handleTabClick('canvas')}
            >
              {canvasBusy ? '创建中…' : '自由画布'}
            </button>
          </div>

          {tab === 'ai' ? (
            <div className="drama-agent-ai">
              <textarea
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                disabled={busy}
                placeholder="在此输入你构想的故事内容。可以尝试输入这些要素：故事设定、主角特征、剧情脉络、最终结局等等"
                rows={6}
              />
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
                  className="drama-btn-primary"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  {busy ? '创建中…' : '立即生成'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {error ? <p className="drama-error drama-agent-error">{error}</p> : null}

        <section className="drama-project-section">
          <h2>我的项目</h2>
          {items.length === 0 ? (
            <p className="drama-muted drama-project-empty">暂无项目，先用上方面板生成一部吧</p>
          ) : (
            <div className="drama-project-grid">
              {items.map((item) => {
                const isSelected = selected.has(item.id)
                return (
                  <article
                    key={item.id}
                    className={`drama-project-card${isSelected ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="drama-project-card-cover"
                      onClick={() => openProject(item)}
                    >
                      <Clapperboard className="drama-project-card-clapper" size={40} strokeWidth={1.5} />
                      <label
                        className={`drama-project-card-check${isSelected || selectionMode ? ' is-visible' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </label>
                      <span className="drama-project-card-eps">{item.episode_count || 0} 集</span>
                    </button>
                    <div className="drama-project-card-body">
                      <button
                        type="button"
                        className="drama-project-card-meta"
                        onClick={() => openProject(item)}
                      >
                        <strong>{item.title}</strong>
                        <span>{formatUpdatedAt(item.updated_at || item.created_at)}</span>
                      </button>
                      <details className="drama-project-card-more" onClick={(e) => e.stopPropagation()}>
                        <summary aria-label="更多操作">
                          <MoreHorizontal size={16} strokeWidth={1.8} />
                        </summary>
                        <div className="drama-project-card-menu">
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
                    </div>
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
