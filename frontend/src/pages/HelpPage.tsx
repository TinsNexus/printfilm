import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'

const FAQ_ITEMS = [
  {
    q: '第一次使用从哪开始？',
    a: '打开工作台，选择「AI 漫剧」或「科普视频」。漫剧适合分集叙事，科普适合短视频流水线。',
  },
  {
    q: '「AI 视频」和「静图成片」有什么区别？',
    a: 'AI 视频动态更强、成本更高；静图成片更快更稳，适合图文科普。',
  },
  {
    q: '生成中可以离开页面吗？',
    a: '可以。任务在后台继续，回到资产或对应项目即可查看进度。',
  },
  {
    q: '成片在哪里下载？',
    a: '项目完成后，在「我的项目」或资产相关入口可下载成片。',
  },
  {
    q: '如何充值？',
    a: '打开「定价」页选择充值档位，支持支付宝与微信支付。',
  },
]

const CATS = [
  { id: 'start', title: '快速开始', desc: '四步上手创作', href: '#faq' },
  { id: 'flow', title: '创作流程', desc: '漫剧与科普怎么走', href: '/drama' },
  { id: 'tools', title: '工具说明', desc: '文生图等即将开放', href: '/tools' },
]

export default function HelpPage() {
  const [q, setQ] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const faqFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return FAQ_ITEMS
    return FAQ_ITEMS.filter(
      (item) => item.q.toLowerCase().includes(needle) || item.a.toLowerCase().includes(needle),
    )
  }, [q])

  return (
    <AppShell>
      <div className="pf-help-page">
        <header className="pf-help-page-hero">
          <h1>帮助中心</h1>
          <p className="pf-muted">搜索你遇到的问题，或从下方分类快速进入</p>
          <label className="pf-help-search pf-help-search-lg">
            <span className="sr-only">搜索帮助</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索您遇到的问题"
            />
          </label>
        </header>

        <div className="pf-help-cats pf-help-cats-lg">
          {CATS.map((c) => (
            <Link key={c.id} to={c.href} className="pf-help-cat">
              <strong>{c.title}</strong>
              <span>{c.desc}</span>
            </Link>
          ))}
        </div>

        <section id="faq" className="pf-help-faq-block">
          <h2>常见问题</h2>
          <div className="pf-help-faq">
            {faqFiltered.map((item, i) => {
              const expanded = openFaq === i
              return (
                <div key={item.q} className={`pf-help-faq-item${expanded ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="pf-help-faq-q"
                    aria-expanded={expanded}
                    onClick={() => setOpenFaq(expanded ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="pf-help-faq-chev" aria-hidden>
                      {expanded ? '−' : '∨'}
                    </span>
                  </button>
                  {expanded ? <p className="pf-help-faq-a">{item.a}</p> : null}
                </div>
              )
            })}
            {faqFiltered.length === 0 ? <p className="pf-muted">没有匹配的问题</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
