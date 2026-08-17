import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import {
  HELP_CATS,
  HELP_FAQ_ITEMS,
  HELP_GUIDE_STEPS,
  filterHelpFaq,
} from '../lib/helpContent'

/** 帮助中心整页：分类入口、上手步骤、可搜索 FAQ */
export default function HelpPage() {
  /*
   * q 搜索关键词
   * openFaq 当前展开的 FAQ 下标
   */
  const [q, setQ] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const faqFiltered = useMemo(() => filterHelpFaq(HELP_FAQ_ITEMS, q), [q])

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
              placeholder="搜索：下载、工具、充值、漫剧…"
            />
          </label>
        </header>

        <div className="pf-help-cats pf-help-cats-lg">
          {HELP_CATS.map((c) => (
            <Link key={c.id} to={c.href} className="pf-help-cat">
              <strong>{c.title}</strong>
              <span>{c.desc}</span>
            </Link>
          ))}
        </div>

        <section className="pf-help-guide-block" aria-labelledby="pf-help-guide-title">
          <h2 id="pf-help-guide-title">上手四步</h2>
          <ol className="pf-help-steps pf-help-steps-page">
            {HELP_GUIDE_STEPS.map((s) => (
              <li key={s.n}>
                <span className="pf-help-step-n" aria-hidden>
                  {s.n}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

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
                    <span className="pf-help-faq-chev" aria-hidden />
                  </button>
                  {expanded ? <p className="pf-help-faq-a">{item.a}</p> : null}
                </div>
              )
            })}
            {faqFiltered.length === 0 ? <p className="pf-muted">没有匹配的问题，试试「下载」「工具」「充值」</p> : null}
          </div>
        </section>

        <section className="pf-help-more">
          <p className="pf-muted">
            更多操作可在{' '}
            <Link to="/settings">个人中心</Link> 查看项目与创作记录，或前往{' '}
            <Link to="/pricing">定价</Link> 充值后继续创作。也可查阅{' '}
            <Link to="/terms">用户协议</Link>、<Link to="/privacy">隐私政策</Link>，或{' '}
            <Link to="/contact">联系我们</Link>。
          </p>
        </section>
      </div>
    </AppShell>
  )
}
