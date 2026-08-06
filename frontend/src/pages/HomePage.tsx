import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template, User, Work } from '../api'
import BrandMark from '../components/BrandMark'

/** Primary filter chips; 科普 first for PRINTFILM. */
const CATEGORY_ORDER = [
  '科普',
  '纪录片',
  '写实感',
  '真人感',
  '电影感',
  '儿童',
  '动漫',
  '国风',
  '科幻',
  '奇幻',
  '悬疑',
  '商业',
  '复古',
  '图文',
]

export default function HomePage() {
  const nav = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [works, setWorks] = useState<Work[]>([])
  const [error, setError] = useState('')
  const [category, setCategory] = useState('全部')

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(String(e.message || e)))
    api.works().then(setWorks).catch(() => undefined)
    if (localStorage.getItem('token')) {
      api.me().then(setUser).catch(() => localStorage.removeItem('token'))
    }
  }, [])

  const categories = useMemo(() => {
    const found = new Set<string>()
    for (const t of templates) {
      for (const c of t.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return ['全部', ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  const filtered = useMemo(() => {
    if (category === '全部') return templates
    return templates.filter((t) => (t.category || []).includes(category))
  }, [templates, category])

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  function openTemplate(t: Template) {
    if (!user) {
      nav('/auth')
      return
    }
    const mode = t.seedream_config?.pipeline_mode
    const q =
      mode === 'image_text' || (!mode && t.default_ratio === '9:16')
        ? '&mode=image_text'
        : ''
    nav(`/studio?template=${t.id}${q}`)
  }

  return (
    <div className="site">
      <header className="site-nav">
        <BrandMark />
        <nav>
          <a href="#how">流程</a>
          <a href="#templates">风格</a>
          <Link to="/studio">创作</Link>
          {user ? <Link to="/history">历史</Link> : null}
          {user ? (
            <button type="button" className="linkish" onClick={logout}>
              {user.nickname} · 退出
            </button>
          ) : (
            <Link to="/auth" className="nav-cta">
              登录
            </Link>
          )}
        </nav>
      </header>

      <section className="site-hero" aria-label="PRINTFILM">
        <div className="site-hero-media" aria-hidden="true">
          <img src="/hero.jpg?v=light" alt="" className="site-hero-img" />
          <div className="site-hero-shade" />
        </div>
        <div className="site-hero-copy">
          <img src="/logo.svg" alt="" className="site-hero-logo" width={56} height={56} />
          <h1 className="site-brand">PRINTFILM</h1>
          <p className="site-headline">把知识拍成片</p>
          <p className="site-support">
            科普视频平台：输入主题与风格，自动生成分镜、画面、旁白与成片。
          </p>
          <div className="cta-row">
            <button
              className="btn primary accent"
              type="button"
              onClick={() => nav(user ? '/studio' : '/auth')}
            >
              开始创作
            </button>
            <a className="btn ghost" href="#templates">
              浏览风格
            </a>
          </div>
        </div>
      </section>

      <section id="how" className="site-section site-how">
        <h2>三步成片</h2>
        <p className="lede">从主题到成片，一条链路完成科普短视频。</p>
        <ol className="how-steps">
          <li>
            <span className="how-num">01</span>
            <strong>选定风格</strong>
            <span>科普、纪录、写实等模板锁定画面气质</span>
          </li>
          <li>
            <span className="how-num">02</span>
            <strong>写下主题</strong>
            <span>一句话讲清你要普及的知识点</span>
          </li>
          <li>
            <span className="how-num">03</span>
            <strong>生成成片</strong>
            <span>分镜、配图、旁白与剪辑自动完成</span>
          </li>
        </ol>
      </section>

      {error && <p className="error pad site-section">{error}</p>}

      <section id="templates" className="site-section">
        <h2>风格模板</h2>
        <p className="lede">为科普内容挑选合适的画面语言。</p>
        <div className="category-filters" role="tablist" aria-label="模板分类">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              className={category === c ? 'cat-chip active' : 'cat-chip'}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="template-grid">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-card"
              onClick={() => openTemplate(t)}
            >
              <img src={api.assetUrl(t.preview_cover)} alt="" />
              <div>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
                <div className="tags">
                  {t.category.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            该分类暂无模板。
          </p>
        ) : null}
      </section>

      {works.length > 0 ? (
        <section className="site-section">
          <h2>公开作品</h2>
          <p className="lede">社区里已经发布的科普短片。</p>
          <div className="works-row">
            {works.map((w) => (
              <article key={w.id} className="work-item">
                <img src={api.assetUrl(w.cover_url)} alt="" />
                <h3>{w.title}</h3>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="site-cta-band">
        <h2>下一支科普短片，从这里开始</h2>
        <p>主题进，成片出。PRINTFILM 帮你把知识印进每一帧。</p>
        <button
          className="btn primary accent"
          type="button"
          onClick={() => nav(user ? '/studio' : '/auth')}
        >
          免费开始
        </button>
      </section>

      <footer className="site-footer">
        <BrandMark />
        <p>PRINTFILM · 科普视频平台</p>
      </footer>
    </div>
  )
}
