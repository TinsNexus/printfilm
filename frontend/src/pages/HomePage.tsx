import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import ComingSoon from '../components/ui/ComingSoon'

const TOOL_ITEMS: { id: string; label: string; soon?: boolean }[] = [
  { id: 't2i', label: '文生图', soon: true },
  { id: 'i2i', label: '图生图', soon: true },
  { id: 'i2p', label: '图生产品', soon: true },
  { id: 't2v', label: '文生视频', soon: true },
  { id: 'v2v', label: '视频生视频', soon: true },
  { id: 'ecom', label: '电商工具', soon: true },
]

const TOOL_ICONS: Record<string, string> = {
  t2i: '🖼',
  i2i: '✨',
  i2p: '🛍',
  t2v: '▶',
  v2v: '🎬',
  ecom: '🛒',
}

export default function HomePage() {
  const nav = useNavigate()
  const loggedIn = Boolean(localStorage.getItem('token'))

  function goCreate() {
    nav(loggedIn ? '/drama' : '/auth')
  }

  function goAuthOr(path: string) {
    nav(loggedIn ? path : '/auth')
  }

  return (
    <AppShell active="home">
      <section className="pf-ws-hero">
        <div className="pf-ws-hero-glow" aria-hidden />
        <p className="pf-ws-brand">PRINTFILM</p>
        <h1 className="pf-ws-title">
          用 AI 创造 <em>漫剧</em> 与 <em>科普视频</em>
        </h1>
        <p className="pf-ws-lede">从灵感到成片的一站式创作平台，让想象力被高效看见。</p>
        <div className="pf-ws-cta">
          <button type="button" className="pf-btn pf-btn-lime pf-btn-icon" onClick={goCreate}>
            开始创作 <span aria-hidden>→</span>
          </button>
          <Link className="pf-btn pf-btn-ghost pf-btn-icon" to="/tools">
            浏览工具 <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <section className="pf-ws-products" id="products" aria-label="主产品">
        <button type="button" className="pf-ws-product pf-ws-product-drama" onClick={() => goAuthOr('/drama')}>
          <span className="pf-ws-product-icon" aria-hidden>
            🎬
          </span>
          <span className="pf-ws-product-body">
            <strong>AI 漫剧</strong>
            <span>剧本 · 分集 · 成片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            →
          </span>
        </button>
        <button type="button" className="pf-ws-product pf-ws-product-kepu" onClick={() => goAuthOr('/studio/new')}>
          <span className="pf-ws-product-icon" aria-hidden>
            📹
          </span>
          <span className="pf-ws-product-body">
            <strong>科普视频</strong>
            <span>分镜流水线出片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            →
          </span>
        </button>
      </section>

      <section className="pf-ws-tools" id="tools">
        <div className="pf-section-head">
          <div>
            <h2>AI 创作工具</h2>
          </div>
          <Link to="/tools" className="pf-link">
            全部工具 →
          </Link>
        </div>
        <div className="pf-ws-tool-grid">
          {TOOL_ITEMS.map((t) => (
            <Link
              key={t.id}
              to="/tools"
              className={`pf-ws-tool-card${t.soon ? ' is-soon' : ''}`}
            >
              <span className="pf-ws-tool-icon" aria-hidden>
                {TOOL_ICONS[t.id]}
              </span>
              <strong>{t.label}</strong>
              {t.soon ? <ComingSoon /> : null}
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
