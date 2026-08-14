/** PRINTFILM 官网首页：产品主张、漫剧/科普入口、成片流程与工具 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import ComingSoon from '../components/ui/ComingSoon'
import CreateChoiceModal from '../components/ui/CreateChoiceModal'
import { getDramaImageStylePreviewUrl } from '../lib/dramaImageStylePreviews'
import {
  HOME_AUDIENCES,
  HOME_CAPABILITIES,
  HOME_DRAMA_STEPS,
  HOME_KEPU_STEPS,
  HOME_PIPELINE,
} from '../lib/homeLanding'
import { PRODUCT_ICONS, TOOL_DEFS } from '../lib/toolsCatalog'

export default function HomePage() {
  const nav = useNavigate()
  const loggedIn = Boolean(localStorage.getItem('token'))
  const [createOpen, setCreateOpen] = useState(false)
  const DramaIcon = PRODUCT_ICONS.drama
  const KepuIcon = PRODUCT_ICONS.kepu

  // 未登录去登录；已登录弹出产品选择
  function goCreate() {
    if (!loggedIn) {
      nav('/auth?next=/')
      return
    }
    setCreateOpen(true)
  }

  // 产品入口：未登录带 next 回跳
  function goAuthOr(path: string) {
    nav(loggedIn ? path : `/auth?next=${encodeURIComponent(path)}`)
  }

  return (
    <AppShell active="home" hideFooter>
      <section className="pf-land-hero">
        <div className="pf-land-hero-copy">
          <p className="pf-land-kicker">PRINTFILM</p>
          <h1>
            把故事做成
            <br />
            <em>能播的片子</em>
          </h1>
          <p className="pf-land-lede">
            AI 漫剧从剧本到分集成片，科普视频从分镜到配音合成。一套工作台，两种出片方式。
          </p>
          <div className="pf-land-cta">
            <Button variant="lime" size="lg" icon onClick={goCreate}>
              开始创作
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Button>
            <Button variant="ghost" size="lg" icon to="/tools">
              浏览工具
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
        <div className="pf-land-frames" aria-hidden>
          <figure className="pf-land-frame is-drama">
            <img src={getDramaImageStylePreviewUrl('ancient-chinese-mythology')} alt="" />
            <figcaption>AI 漫剧</figcaption>
          </figure>
          <figure className="pf-land-frame is-kepu">
            <img src={getDramaImageStylePreviewUrl('neon-cyberpunk-film')} alt="" />
            <figcaption>科普视频</figcaption>
          </figure>
        </div>
      </section>

      <section className="pf-land-products" id="products" aria-label="主产品">
        <button type="button" className="pf-land-product is-drama" onClick={() => goAuthOr('/drama')}>
          <span className="pf-land-product-icon" aria-hidden>
            <DramaIcon size={26} strokeWidth={1.6} />
          </span>
          <span className="pf-land-product-body">
            <strong>AI 漫剧</strong>
            <em>给短剧创作者</em>
            <span>从一句话生成剧本，沉淀角色与场景，再按集分镜成片。</span>
            <span className="pf-land-chips">
              {HOME_DRAMA_STEPS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </span>
          </span>
          <span className="pf-land-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </button>
        <button type="button" className="pf-land-product is-kepu" onClick={() => goAuthOr('/studio/new')}>
          <span className="pf-land-product-icon" aria-hidden>
            <KepuIcon size={26} strokeWidth={1.6} />
          </span>
          <span className="pf-land-product-body">
            <strong>科普视频</strong>
            <em>给知识创作者</em>
            <span>选定画面风格，写好分镜旁白，沿流水线出讲解短片。</span>
            <span className="pf-land-chips">
              {HOME_KEPU_STEPS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </span>
          </span>
          <span className="pf-land-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </button>
      </section>

      <section className="pf-land-pipeline" aria-labelledby="pf-land-pipeline-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">How it works</p>
          <h2 id="pf-land-pipeline-title">三步出片</h2>
        </header>
        <ol className="pf-land-pipeline-list">
          {HOME_PIPELINE.map((item) => (
            <li key={item.step}>
              <span className="pf-land-step-no">{item.step}</span>
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pf-land-caps" aria-labelledby="pf-land-caps-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">Capabilities</p>
          <h2 id="pf-land-caps-title">工作台里真正能用的</h2>
        </header>
        <div className="pf-land-cap-grid">
          {HOME_CAPABILITIES.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-land-tools" id="tools">
        <header className="pf-land-section-head is-row">
          <div>
            <p className="pf-land-kicker">Tools</p>
            <h2>单点创作工具</h2>
          </div>
          <Link to="/tools" className="pf-link">
            全部工具 →
          </Link>
        </header>
        <div className="pf-land-tool-grid">
          {TOOL_DEFS.map((t) => {
            const Icon = t.icon
            return (
              <Link
                key={t.id}
                to={`/tools/${t.id}`}
                className={`pf-land-tool-card${t.soon ? ' is-soon' : ''}`}
              >
                <span className="pf-land-tool-icon" aria-hidden>
                  <Icon size={20} strokeWidth={1.7} />
                </span>
                <strong>{t.title}</strong>
                <span>{t.desc}</span>
                {t.soon ? <ComingSoon /> : null}
              </Link>
            )
          })}
        </div>
      </section>

      <section className="pf-land-who" aria-labelledby="pf-land-who-title">
        <header className="pf-land-section-head">
          <p className="pf-land-kicker">For</p>
          <h2 id="pf-land-who-title">适合谁用</h2>
        </header>
        <div className="pf-land-who-grid">
          {HOME_AUDIENCES.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-land-close">
        <div>
          <h2>从一条创意开始</h2>
          <p>登录后选择漫剧或科普，进入对应工作台。</p>
        </div>
        <div className="pf-land-cta">
          <Button variant="lime" size="lg" icon onClick={goCreate}>
            开始创作
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Button>
          <Button variant="ghost" size="lg" to="/pricing">
            查看定价
          </Button>
        </div>
      </section>

      <footer className="pf-land-foot">
        <div className="pf-land-foot-brand">
          <strong>PRINTFILM</strong>
          <p>AI 漫剧与科普视频创作平台</p>
        </div>
        <nav className="pf-land-foot-nav" aria-label="页脚导航">
          <Link to="/drama">漫剧</Link>
          <Link to="/history">科普</Link>
          <Link to="/tools">工具</Link>
          <Link to="/pricing">定价</Link>
          <Link to="/help">帮助</Link>
        </nav>
        <p className="pf-land-copy">© {new Date().getFullYear()} PRINTFILM. All rights reserved.</p>
      </footer>

      <CreateChoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  )
}
