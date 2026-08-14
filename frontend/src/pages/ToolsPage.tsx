import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import ComingSoon from '../components/ui/ComingSoon'
import { PRODUCT_ICONS, TOOL_DEFS } from '../lib/toolsCatalog'

export default function ToolsPage() {
  const DramaIcon = PRODUCT_ICONS.drama
  const KepuIcon = PRODUCT_ICONS.kepu

  return (
    <AppShell active="tools">
      <div className="pf-page-head">
        <div>
          <h1>AI 创作工具</h1>
          <p className="pf-muted">进入工具工作台，生成图片与短视频。</p>
        </div>
      </div>
      <div className="pf-tools-grid pf-tools-grid-lg">
        {TOOL_DEFS.map((t) => {
          const Icon = t.icon
          return (
            <Link
              key={t.id}
              to={`/tools/${t.id}`}
              className={`pf-tools-card pf-tools-card-lg${t.soon ? ' is-soon' : ''}`}
            >
              <div className="pf-tools-card-top">
                <span className="pf-ws-tool-icon" aria-hidden>
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <span className="pf-tools-arrow" aria-hidden>
                  <ArrowRight size={14} strokeWidth={2} />
                </span>
              </div>
              <h3>
                {t.title}
                {t.soon ? <ComingSoon /> : null}
              </h3>
              <p>{t.desc}</p>
            </Link>
          )
        })}
      </div>
      <section className="pf-ws-products" style={{ marginTop: '2.5rem' }}>
        <Link to="/drama" className="pf-ws-product pf-ws-product-drama">
          <span className="pf-ws-product-icon" aria-hidden>
            <DramaIcon size={26} strokeWidth={1.6} />
          </span>
          <span className="pf-ws-product-body">
            <strong>去漫剧创作</strong>
            <span>剧本 · 分集 · 成片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </Link>
        <Link to="/history" className="pf-ws-product pf-ws-product-kepu">
          <span className="pf-ws-product-icon" aria-hidden>
            <KepuIcon size={26} strokeWidth={1.6} />
          </span>
          <span className="pf-ws-product-body">
            <strong>去科普历史</strong>
            <span>分镜流水线出片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            <ArrowRight size={16} strokeWidth={2} />
          </span>
        </Link>
      </section>
    </AppShell>
  )
}
