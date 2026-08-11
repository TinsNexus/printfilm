/** 漫剧 Agent 首页：AI 生剧本 / 自由画布 + 我的项目 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../../components/layout/AppShell'
import { dramaApi, type DramaProjectListItem } from '../../api/drama'
import {
  EPISODE_COUNT_PRESETS,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../lib/dramaImageStyles'
import RequireAuth from './RequireAuth'
import './drama.css'

const CREATIVE_MIN_LENGTH = 20
const CANVAS_PLACEHOLDER =
  '自由画布创作项目，稍后在画布中完善故事与资产。'

type AgentTab = 'ai' | 'canvas'

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
   */
  const [tab, setTab] = useState<AgentTab>('ai')
  const [storyText, setStoryText] = useState('')
  const [episodeCount, setEpisodeCount] = useState(12)
  const [imageStyleId, setImageStyleId] = useState<ImageStyleId | ''>('')
  const [items, setItems] = useState<DramaProjectListItem[]>([])
  const [busy, setBusy] = useState(false)
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [error, setError] = useState('')

  // 加载项目列表
  async function loadProjects() {
    const rows = await dramaApi.listProjects()
    setItems(rows)
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

  const canGenerate = storyText.trim().length >= CREATIVE_MIN_LENGTH && !busy

  return (
    <AppShell active="drama">
      <div className="drama-page drama-agent-page">
        <header className="drama-agent-hero">
          <h1>漫剧 Agent</h1>
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
                  <label>
                    风格
                    <select
                      value={imageStyleId}
                      onChange={(e) => setImageStyleId((e.target.value || '') as ImageStyleId | '')}
                      disabled={busy}
                    >
                      <option value="">风格库</option>
                      {IMAGE_STYLE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    集数
                    <select
                      value={episodeCount}
                      onChange={(e) => setEpisodeCount(Number(e.target.value) || 12)}
                      disabled={busy}
                    >
                      {EPISODE_COUNT_PRESETS.map((n) => (
                        <option key={n} value={n}>
                          {n} 集
                        </option>
                      ))}
                    </select>
                  </label>
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
          {items.length === 0 ? <p className="drama-muted">暂无项目，先用上方面板生成一部吧</p> : null}
          <div className="drama-project-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="drama-project-card"
                onClick={() => navigate(`/drama/projects/${item.id}`)}
              >
                <div className="drama-project-card-cover" aria-hidden>
                  <span className="drama-project-card-icon">▶</span>
                </div>
                <div className="drama-project-card-body">
                  <strong>{item.title}</strong>
                  <span className="drama-badge">{item.episode_count || 0} 集</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
