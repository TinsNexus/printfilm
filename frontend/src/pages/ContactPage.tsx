import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { HelpCircle, Mail, Building2 } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import { CONTACT_CHANNELS, CONTACT_TOPICS } from '../lib/legalContent'

const CHANNEL_ICONS = [Mail, HelpCircle, Building2] as const

/** 联系我们：渠道说明 + 本地反馈表单（引导发邮件） */
export default function ContactPage() {
  /*
   * topic 反馈主题
   * email 联系邮箱
   * message 问题描述
   * sent 是否已生成邮件草稿提示
   */
  const [topic, setTopic] = useState<string>(CONTACT_TOPICS[0])
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const body = [
      `主题：${topic}`,
      `联系邮箱：${email.trim() || '（未填写）'}`,
      '',
      message.trim() || '（无详细描述）',
    ].join('\n')
    const href = `mailto:support@printfilm.com?subject=${encodeURIComponent(
      `[PRINTFILM] ${topic}`,
    )}&body=${encodeURIComponent(body)}`
    window.location.href = href
    setSent(true)
  }

  return (
    <AppShell>
      <div className="pf-legal-page pf-contact-page">
        <header className="pf-legal-hero">
          <p className="pf-legal-crumb">
            <Link to="/">首页</Link>
            <span aria-hidden> / </span>
            <span>联系我们</span>
          </p>
          <h1>联系我们</h1>
          <p className="pf-legal-intro">
            充值、账号、创作任务或合作咨询，欢迎通过以下方式联系。提交前也可先查看{' '}
            <Link to="/help">帮助中心</Link>。
          </p>
        </header>

        <div className="pf-contact-channels">
          {CONTACT_CHANNELS.map((ch, i) => {
            const Icon = CHANNEL_ICONS[i] || Mail
            const isExternal = ch.href?.startsWith('mailto:')
            return (
              <article key={ch.title} className="pf-contact-card">
                <span className="pf-contact-card-icon" aria-hidden>
                  <Icon size={22} strokeWidth={1.8} />
                </span>
                <h2>{ch.title}</h2>
                <p>{ch.desc}</p>
                {ch.href ? (
                  isExternal ? (
                    <a className="pf-contact-card-link" href={ch.href}>
                      {ch.actionLabel || '联系'}
                    </a>
                  ) : (
                    <Link className="pf-contact-card-link" to={ch.href}>
                      {ch.actionLabel || '前往'}
                    </Link>
                  )
                ) : null}
              </article>
            )
          })}
        </div>

        <section className="pf-contact-form-block" aria-labelledby="pf-contact-form-title">
          <h2 id="pf-contact-form-title">留言反馈</h2>
          <p className="pf-muted">
            填写后将打开您的邮件客户端，预填发往 support@printfilm.com 的草稿，请确认后发送。
          </p>

          <form className="pf-contact-form" onSubmit={onSubmit}>
            <label>
              <span>问题类型</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                {CONTACT_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>联系邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="便于我们回复"
                autoComplete="email"
              />
            </label>
            <label>
              <span>问题描述</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="请尽量说明账号邮箱、订单号、发生时间与报错信息"
                required
              />
            </label>
            <button type="submit" className="pf-btn pf-btn-lime">
              打开邮件草稿
            </button>
            {sent ? (
              <p className="pf-contact-sent pf-muted">
                若未自动打开邮件客户端，请直接发送至{' '}
                <a href="mailto:support@printfilm.com">support@printfilm.com</a>
              </p>
            ) : null}
          </form>
        </section>

        <nav className="pf-legal-foot-nav" aria-label="相关页面">
          <Link to="/terms">用户协议</Link>
          <Link to="/privacy">隐私政策</Link>
          <Link to="/help">帮助中心</Link>
          <Link to="/pricing">定价充值</Link>
        </nav>
      </div>
    </AppShell>
  )
}
