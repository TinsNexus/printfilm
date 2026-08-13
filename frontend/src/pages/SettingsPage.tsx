import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import { api, type User, type Wallet } from '../api'
import ComingSoon from '../components/ui/ComingSoon'

type SettingsTab =
  | 'account'
  | 'assets'
  | 'subscription'
  | 'team'
  | 'api'
  | 'notify'
  | 'security'

const SIDE_ITEMS: { id: SettingsTab; label: string; soon?: boolean }[] = [
  { id: 'account', label: '账号信息' },
  { id: 'assets', label: '资产管理' },
  { id: 'subscription', label: '订阅与余额' },
  { id: 'team', label: '团队管理', soon: true },
  { id: 'api', label: 'API', soon: true },
  { id: 'notify', label: '通知偏好', soon: true },
  { id: 'security', label: '安全' },
]

export default function SettingsPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<SettingsTab>('account')
  const [user, setUser] = useState<User | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
        nav('/auth')
      })
    api.wallet().then(setWallet).catch(() => undefined)
  }, [nav])

  function logout() {
    localStorage.removeItem('token')
    nav('/')
  }

  const planLabel = wallet?.billing_unlimited
    ? 'Unlimited'
    : (wallet?.plan || 'free').toLowerCase() === 'pro'
      ? 'Pro'
      : 'Free'

  return (
    <AppShell>
      <div className="pf-settings">
        <aside className="pf-settings-side">
          <div className="pf-settings-profile">
            <div className="pf-settings-avatar" aria-hidden>
              {(user?.nickname || 'P').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{user?.nickname || '创作者'}</strong>
              <p className="pf-muted">ID · {user?.id ?? '—'}</p>
              <span className="pf-settings-plan">{planLabel} 方案</span>
            </div>
          </div>
          <nav className="pf-settings-nav" aria-label="设置导航">
            {SIDE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.soon ? <ComingSoon /> : null}
              </button>
            ))}
          </nav>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm pf-settings-logout" onClick={logout}>
            退出登录
          </button>
        </aside>

        <main className="pf-settings-main">
          {tab === 'account' ? (
            <section className="pf-settings-card">
              <h1>账号信息</h1>
              <p className="pf-muted">管理你的资料与联系方式（布局预览，保存能力后续接入）</p>
              <div className="pf-settings-fields">
                <label>
                  <span>用户名</span>
                  <input value={user?.nickname || ''} readOnly />
                </label>
                <label>
                  <span>邮箱</span>
                  <input value={user?.email || ''} readOnly />
                </label>
                <label>
                  <span>手机号</span>
                  <input value="" placeholder="未绑定" readOnly />
                </label>
              </div>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                申请注销 <ComingSoon />
              </button>
            </section>
          ) : null}

          {tab === 'assets' ? (
            <section className="pf-settings-card">
              <h1>资产管理</h1>
              <p className="pf-muted">跳转到素材与角色资产库</p>
              <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/assets">
                打开资产库
              </Link>
            </section>
          ) : null}

          {tab === 'subscription' ? (
            <section className="pf-settings-card">
              <h1>订阅与余额</h1>
              <ul className="pf-meta-list">
                <li>
                  <span>当前方案</span>
                  <span>{planLabel}</span>
                </li>
                <li>
                  <span>可用余额</span>
                  <span>¥{(wallet?.balance_yuan ?? 0).toFixed(2)}</span>
                </li>
                <li>
                  <span>冻结中</span>
                  <span>¥{(wallet?.frozen_yuan ?? 0).toFixed(2)}</span>
                </li>
              </ul>
              <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/pricing">
                去充值
              </Link>
            </section>
          ) : null}

          {tab === 'security' ? (
            <section className="pf-settings-card">
              <h1>安全</h1>
              <p className="pf-muted">修改密码与登录设备管理即将上线。</p>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                修改密码 <ComingSoon />
              </button>
            </section>
          ) : null}

          {tab === 'team' || tab === 'api' || tab === 'notify' ? (
            <section className="pf-settings-card">
              <h1>{SIDE_ITEMS.find((s) => s.id === tab)?.label}</h1>
              <p className="pf-muted">该模块布局已预留，功能即将上线。</p>
              <ComingSoon />
            </section>
          ) : null}
        </main>
      </div>
    </AppShell>
  )
}
