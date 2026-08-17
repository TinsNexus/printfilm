import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import { LEGAL_DOCS, type LegalDoc } from '../lib/legalContent'

/** 渲染单份法律文档正文 */
function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <article className="pf-legal-doc">
      <header className="pf-legal-hero">
        <p className="pf-legal-crumb">
          <Link to="/">首页</Link>
          <span aria-hidden> / </span>
          <span>{doc.title}</span>
        </p>
        <h1>{doc.title}</h1>
        <p className="pf-legal-meta">更新日期：{doc.updatedAt}</p>
        <p className="pf-legal-intro">{doc.intro}</p>
      </header>

      <div className="pf-legal-sections">
        {doc.sections.map((sec) => (
          <section key={sec.title} className="pf-legal-section">
            <h2>{sec.title}</h2>
            {sec.paragraphs?.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
            {sec.bullets?.length ? (
              <ul>
                {sec.bullets.map((b) => (
                  <li key={b.slice(0, 32)}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <nav className="pf-legal-foot-nav" aria-label="相关页面">
        <Link to="/terms">用户协议</Link>
        <Link to="/privacy">隐私政策</Link>
        <Link to="/contact">联系我们</Link>
        <Link to="/help">帮助中心</Link>
      </nav>
    </article>
  )
}

/** 用户协议页 */
export function TermsPage() {
  return (
    <AppShell>
      <div className="pf-legal-page">
        <LegalBody doc={LEGAL_DOCS.terms} />
      </div>
    </AppShell>
  )
}

/** 隐私政策页 */
export function PrivacyPage() {
  return (
    <AppShell>
      <div className="pf-legal-page">
        <LegalBody doc={LEGAL_DOCS.privacy} />
      </div>
    </AppShell>
  )
}
