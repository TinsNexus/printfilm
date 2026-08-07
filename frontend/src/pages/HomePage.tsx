import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template, Work } from '../api'
import AppShell from '../components/layout/AppShell'
import PillTabs from '../components/ui/PillTabs'
import { CATEGORY_ORDER, HOME_CATEGORY_LABELS } from '../lib/categories'

export default function HomePage() {
  const nav = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [works, setWorks] = useState<Work[]>([])
  const [error, setError] = useState('')
  const [category, setCategory] = useState('全部')
  const [showAllWorks, setShowAllWorks] = useState(false)
  const [preview, setPreview] = useState<Work | null>(null)
  const loggedIn = Boolean(localStorage.getItem('token'))

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(String(e.message || e)))
    api.works().then(setWorks).catch(() => undefined)
  }, [])

  const categoryKeys = useMemo(() => {
    const found = new Set<string>()
    for (const t of templates) {
      for (const c of t.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return ['全部', ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  const categoryLabels = categoryKeys.map((k) => HOME_CATEGORY_LABELS[k] || k)
  const labelToKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of categoryKeys) m.set(HOME_CATEGORY_LABELS[k] || k, k)
    return m
  }, [categoryKeys])

  const filtered = useMemo(() => {
    if (category === '全部') return templates.slice(0, 6)
    return templates.filter((t) => (t.category || []).includes(category)).slice(0, 6)
  }, [templates, category])

  function openTemplate(t: Template) {
    if (!loggedIn) {
      nav('/auth')
      return
    }
    nav(`/studio/new?template=${t.id}`)
  }

  function goCreate() {
    nav(loggedIn ? '/studio/new' : '/auth')
  }

  const heroCover =
    templates[0]?.preview_cover
      ? api.assetUrl(templates[0].preview_cover)
      : '/hero.jpg?v=light'

  return (
    <AppShell active="home">
      <section className="pf-home-hero">
        <div>
          <h1>
            把知识拍成片
            <br />
            让每个想法，都被看见
          </h1>
          <p className="lede">
            PRINTFILM 是你的 AI 知识视频创作伙伴。从主题输入到成片发布，只需 3 步，轻松完成短片创作。
          </p>
          <div className="pf-home-steps">
            <div className="pf-home-step">
              <strong>1 输入主题</strong>
              <span>输入主题或粘贴文案，快速开始</span>
            </div>
            <div className="pf-home-step">
              <strong>2 智能生成</strong>
              <span>生成大纲、分镜与画面</span>
            </div>
            <div className="pf-home-step">
              <strong>3 预览发布</strong>
              <span>预览调整后导出成片</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="pf-btn pf-btn-lime" onClick={goCreate}>
              开始创作
            </button>
            <a className="pf-btn pf-btn-ghost" href="#templates">
              探索模板
            </a>
          </div>
        </div>
        <div className="pf-hero-visual">
          <div className="pf-hero-player">
            <img src={heroCover} alt="" />
            <span className="pf-hero-badge">AI 生成短片</span>
          </div>
          <aside className="pf-hero-float">
            <ul>
              <li>
                <span className="pf-check">✓</span> 主题解析
              </li>
              <li>
                <span className="pf-check">✓</span> 分镜生成
              </li>
              <li>
                <span className="pf-check">✓</span> 配音配乐
              </li>
              <li>
                <span className="pf-check">✓</span> 输出成片
              </li>
            </ul>
          </aside>
        </div>
      </section>

      {error ? <p className="pf-error">{error}</p> : null}

      <section id="templates">
        <div className="pf-section-head">
          <div>
            <h2>从模板开始</h2>
            <p>选择合适的模板，快速开启你的创作</p>
          </div>
          <Link to="/templates" className="pf-link">
            查看全部模板 →
          </Link>
        </div>
        <PillTabs
          items={categoryLabels}
          value={HOME_CATEGORY_LABELS[category] || category}
          onChange={(label) => setCategory(labelToKey.get(label) || '全部')}
          ariaLabel="模板分类"
        />
        <div className="pf-template-grid" style={{ marginTop: '1rem' }}>
          {filtered.map((t) => (
            <button key={t.id} type="button" className="pf-template-card" onClick={() => openTemplate(t)}>
              <img src={api.assetUrl(t.preview_cover)} alt="" />
              <div className="body">
                <h3>{t.name}</h3>
                <p>{t.description}</p>
                <div className="pf-tags">
                  {t.category.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="works" style={{ marginTop: '3rem' }}>
        <div className="pf-section-head">
          <div>
            <h2>精选公开作品</h2>
            <p>来自创作者社区的优质作品</p>
          </div>
          {works.length > 4 ? (
            <button
              type="button"
              className="pf-link"
              onClick={() => setShowAllWorks((v) => !v)}
            >
              {showAllWorks ? '收起 ↑' : '查看全部作品 →'}
            </button>
          ) : null}
        </div>
        {works.length === 0 ? (
          <p className="pf-muted">还没有发布作品，去创作一条吧。</p>
        ) : (
          <div className="pf-works-grid">
            {(showAllWorks ? works : works.slice(0, 4)).map((w) => (
              <button
                key={w.id}
                type="button"
                className="pf-work-card"
                onClick={() => setPreview(w)}
              >
                <span className="pf-work-thumb">
                  <img src={api.assetUrl(w.cover_url) || api.assetUrl(w.video_url)} alt="" />
                  <span className="pf-work-play" aria-hidden>
                    ▶
                  </span>
                </span>
                <h3>{w.title}</h3>
                <p className="pf-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  公开作品 · 点击播放
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="pf-cta-band">
        <div>
          <h2>准备好创作你的短片了吗？</h2>
          <p>加入 PRINTFILM，开启你的 AI 创作之旅</p>
        </div>
        <button type="button" className="pf-btn pf-btn-lime" onClick={goCreate}>
          立即开始创作 →
        </button>
      </section>

      {preview ? (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>{preview.title}</h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            <video
              className="preview-media"
              src={api.assetUrl(preview.video_url)}
              poster={preview.cover_url ? api.assetUrl(preview.cover_url) : undefined}
              controls
              autoPlay
              playsInline
            />
            <p className="pf-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              发布于 {new Date(preview.published_at).toLocaleString()}
            </p>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
