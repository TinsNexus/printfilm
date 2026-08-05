import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template, User, Work } from '../api'

export default function HomePage() {
  const nav = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [works, setWorks] = useState<Work[]>([])
  const [error, setError] = useState('')

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

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand-mark">
          纸戏 <span>FrameCut</span>
        </Link>
        <nav>
          <Link to="/studio">创作</Link>
          {user ? <Link to="/history">历史</Link> : null}
          {user ? (
            <>
              <span className="quota">额度不限</span>
              <button type="button" className="linkish" onClick={logout}>
                {user.nickname} · 退出
              </button>
            </>
          ) : (
            <Link to="/auth">登录</Link>
          )}
        </nav>
      </header>

      <section className="hero-band">
        <p className="eyebrow">模板驱动 · 全链路字节模型</p>
        <h1 className="brand-hero">纸戏</h1>
        <p className="lede">选风格模板，输入主题，生成分镜到成片。</p>
        <div className="cta-row">
          <button
            className="btn primary"
            type="button"
            onClick={() => nav(user ? '/studio' : '/auth')}
          >
            开始创作
          </button>
          <a className="btn ghost" href="#templates">
            浏览模板
          </a>
        </div>
      </section>

      {error && <p className="error pad">{error}</p>}

      <section id="templates" className="section">
        <h2>风格模板</h2>
        <p className="lede">同一条流水线，不同视觉语言。</p>
        <div className="template-grid">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-card"
              onClick={() => {
                if (!user) {
                  nav('/auth')
                  return
                }
                nav(
                  `/studio?template=${t.id}${
                    t.id === 'portrait_story' || t.id === 'ink_guofeng' ? '&mode=image_text' : ''
                  }`,
                )
              }}
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
      </section>

      <section className="section">
        <h2>公开作品</h2>
        {works.length === 0 ? (
          <p className="muted">还没有发布作品，去创作一条吧。</p>
        ) : (
          <div className="works-row">
            {works.map((w) => (
              <article key={w.id} className="work-item">
                <img src={api.assetUrl(w.cover_url)} alt="" />
                <h3>{w.title}</h3>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
