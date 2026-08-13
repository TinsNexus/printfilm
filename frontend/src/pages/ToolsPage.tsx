import AppShell from '../components/layout/AppShell'
import ComingSoon from '../components/ui/ComingSoon'
import { Link } from 'react-router-dom'

const TOOLS: { id: string; title: string; desc: string; icon: string; soon?: boolean }[] = [
  { id: 't2i', title: '文生图', desc: '用文字描述生成高质量画面', icon: '🖼', soon: true },
  { id: 'i2i', title: '图生图', desc: '上传参考图，生成风格一致的变体', icon: '✨', soon: true },
  { id: 'i2p', title: '图生产品', desc: '一键生成白底图与场景商品图', icon: '🛍', soon: true },
  { id: 't2v', title: '文生视频', desc: '从脚本生成短视频片段', icon: '▶', soon: true },
  { id: 'v2v', title: '视频生视频', desc: '对已有视频做风格与运动变换', icon: '🎬', soon: true },
  { id: 'ecom', title: '电商工具', desc: '主图拼接、详情排版等小工具合集', icon: '🛒', soon: true },
]

export default function ToolsPage() {
  return (
    <AppShell active="tools">
      <div className="pf-page-head">
        <div>
          <h1>AI 创作工具</h1>
          <p className="pf-muted">独立工具中心布局已就绪，能力陆续开放。</p>
        </div>
      </div>
      <div className="pf-tools-grid pf-tools-grid-lg">
        {TOOLS.map((t) => (
          <article key={t.id} className={`pf-tools-card pf-tools-card-lg${t.soon ? ' is-soon' : ''}`}>
            <div className="pf-tools-card-top">
              <span className="pf-ws-tool-icon" aria-hidden>
                {t.icon}
              </span>
              <span className="pf-tools-arrow" aria-hidden>
                →
              </span>
            </div>
            <h3>
              {t.title}
              {t.soon ? <ComingSoon /> : null}
            </h3>
            <p>{t.desc}</p>
          </article>
        ))}
      </div>
      <section className="pf-ws-products" style={{ marginTop: '2.5rem' }}>
        <Link to="/drama" className="pf-ws-product pf-ws-product-drama">
          <span className="pf-ws-product-icon" aria-hidden>
            🎬
          </span>
          <span className="pf-ws-product-body">
            <strong>去漫剧创作</strong>
            <span>剧本 · 分集 · 成片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            →
          </span>
        </Link>
        <Link to="/studio/new" className="pf-ws-product pf-ws-product-kepu">
          <span className="pf-ws-product-icon" aria-hidden>
            📹
          </span>
          <span className="pf-ws-product-body">
            <strong>去科普创作</strong>
            <span>分镜流水线出片</span>
          </span>
          <span className="pf-ws-product-go" aria-hidden>
            →
          </span>
        </Link>
      </section>
    </AppShell>
  )
}
