import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import { api, type User, type Wallet } from '../api'
import { dramaApi, type DramaProjectListItem } from '../api/drama'
import MonthlyUsageCard from '../components/billing/MonthlyUsageCard'
import ComingSoon from '../components/ui/ComingSoon'
import { dramaProjectEntryPath, formatDramaCardMeta } from '../lib/dramaWorkflow'
import { STATUS_CN } from '../lib/status'
import SettingsToolRunsPanel from './SettingsToolRunsPanel'

type SettingsTab =
  | 'account'
  | 'projects'
  | 'kepu'
  | 'tools'
  | 'assets'
  | 'subscription'
  | 'team'
  | 'api'
  | 'notify'
  | 'security'

type KepuItem = {
  id: number
  title: string
  status: string
  updated_at?: string
  created_at: string
}

/*
 * SIDE_ITEMS 侧栏导航项
 * TAB_IDS 合法 tab 集合（用于 URL 校验）
 */
const SIDE_ITEMS: { id: SettingsTab; label: string; soon?: boolean; group?: 'work' | 'account' }[] = [
  { id: 'account', label: '账号信息', group: 'account' },
  { id: 'projects', label: '漫剧项目', group: 'work' },
  { id: 'kepu', label: '科普历史', group: 'work' },
  { id: 'tools', label: '工具创作', group: 'work' },
  { id: 'assets', label: '资产管理', group: 'work' },
  { id: 'subscription', label: '订阅与余额', group: 'account' },
  { id: 'team', label: '团队管理', soon: true, group: 'account' },
  { id: 'api', label: 'API', soon: true, group: 'account' },
  { id: 'notify', label: '通知偏好', soon: true, group: 'account' },
  { id: 'security', label: '安全', group: 'account' },
]

const TAB_IDS = new Set(SIDE_ITEMS.map((i) => i.id))

// 解析 URL tab，非法时回落到账号信息
function parseTab(raw: string | null): SettingsTab {
  if (raw && TAB_IDS.has(raw as SettingsTab)) return raw as SettingsTab
  return 'account'
}

// 格式化相对时间展示
function formatWhen(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SettingsPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  /*
   * tab 当前侧栏分区
   * user 当前登录用户
   * wallet 钱包余额
   * dramaItems 最近漫剧项目
   * kepuItems 最近科普项目
   * listError 列表加载错误
   * listLoading 列表加载中
   */
  const [tab, setTab] = useState<SettingsTab>(() => parseTab(params.get('tab')))
  const [user, setUser] = useState<User | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [dramaItems, setDramaItems] = useState<DramaProjectListItem[]>([])
  const [kepuItems, setKepuItems] = useState<KepuItem[]>([])
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(false)

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

  useEffect(() => {
    const next = parseTab(params.get('tab'))
    setTab(next)
  }, [params])

  useEffect(() => {
    if (tab !== 'projects' && tab !== 'kepu') return
    let cancelled = false
    setListLoading(true)
    setListError('')
    const load = async () => {
      try {
        if (tab === 'projects') {
          const rows = await dramaApi.listProjects()
          if (!cancelled) setDramaItems(rows.slice(0, 8))
        } else {
          const res = await api.listProjects({ page: 1, page_size: 8 })
          if (!cancelled) setKepuItems(res.items)
        }
      } catch (e) {
        if (!cancelled) setListError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tab])

  // 切换侧栏并同步到 URL
  function selectTab(next: SettingsTab) {
    setTab(next)
    const sp = new URLSearchParams(params)
    if (next === 'account') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

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
              <p className="pf-muted">ID: {user?.id ?? '—'}</p>
              <span className="pf-settings-plan">{planLabel} 方案</span>
            </div>
          </div>
          <nav className="pf-settings-nav" aria-label="设置导航">
            {SIDE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'active' : ''}
                onClick={() => selectTab(item.id)}
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
              <p className="pf-muted">管理你的资料与联系方式</p>
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

          {tab === 'projects' ? (
            <section className="pf-settings-card">
              <div className="pf-settings-card-head">
                <div>
                  <h1>漫剧项目</h1>
                  <p className="pf-muted">你的 AI 漫剧创作与分集进度</p>
                </div>
                <div className="pf-settings-actions">
                  <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/drama">
                    全部项目
                  </Link>
                  <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/drama">
                    新建漫剧
                  </Link>
                </div>
              </div>
              {listLoading ? <p className="pf-muted">加载中…</p> : null}
              {listError ? <p className="pf-error">{listError}</p> : null}
              {!listLoading && !listError && dramaItems.length === 0 ? (
                <div className="pf-settings-empty">
                  <p>还没有漫剧项目</p>
                  <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/drama">
                    去创建
                  </Link>
                </div>
              ) : null}
              {dramaItems.length > 0 ? (
                <ul className="pf-settings-list">
                  {dramaItems.map((item) => (
                    <li key={item.id}>
                      <Link to={dramaProjectEntryPath(item)} className="pf-settings-list-row">
                        <span className="pf-settings-list-main">
                          <strong>{item.title || `项目 #${item.id}`}</strong>
                          <em className="pf-muted">{formatDramaCardMeta(item)}</em>
                        </span>
                        <span className="pf-settings-list-meta pf-muted">{formatWhen(item.updated_at || item.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === 'kepu' ? (
            <section className="pf-settings-card">
              <div className="pf-settings-card-head">
                <div>
                  <h1>科普历史</h1>
                  <p className="pf-muted">科普视频项目与成片记录</p>
                </div>
                <div className="pf-settings-actions">
                  <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/history">
                    全部历史
                  </Link>
                  <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/studio/new">
                    新建科普
                  </Link>
                </div>
              </div>
              {listLoading ? <p className="pf-muted">加载中…</p> : null}
              {listError ? <p className="pf-error">{listError}</p> : null}
              {!listLoading && !listError && kepuItems.length === 0 ? (
                <div className="pf-settings-empty">
                  <p>还没有科普项目</p>
                  <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/studio/new">
                    去创建
                  </Link>
                </div>
              ) : null}
              {kepuItems.length > 0 ? (
                <ul className="pf-settings-list">
                  {kepuItems.map((item) => (
                    <li key={item.id}>
                      <Link to={`/studio/${item.id}`} className="pf-settings-list-row">
                        <span className="pf-settings-list-main">
                          <strong>{item.title || `项目 #${item.id}`}</strong>
                          <em className="pf-muted">{STATUS_CN[item.status] || item.status}</em>
                        </span>
                        <span className="pf-settings-list-meta pf-muted">
                          {formatWhen(item.updated_at || item.created_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === 'tools' ? <SettingsToolRunsPanel /> : null}

          {tab === 'assets' ? (
            <section className="pf-settings-card">
              <h1>资产管理</h1>
              <p className="pf-muted">角色、场景、道具与成片素材统一存放在资产库</p>
              <div className="pf-settings-actions">
                <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/assets">
                  打开资产库
                </Link>
                <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/drama">
                  漫剧项目
                </Link>
                <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/history">
                  科普历史
                </Link>
              </div>
            </section>
          ) : null}

          {tab === 'subscription' ? (
            <section className="pf-settings-card">
              <h1>订阅与余额</h1>
              <p className="pf-muted">按量充值，余额永久有效</p>
              <div className="pf-settings-balance">
                <div>
                  <span className="pf-muted">可用余额</span>
                  <strong>¥{(wallet?.balance_yuan ?? 0).toFixed(2)}</strong>
                </div>
                <div>
                  <span className="pf-muted">冻结中</span>
                  <em>¥{(wallet?.frozen_yuan ?? 0).toFixed(2)}</em>
                </div>
                <div>
                  <span className="pf-muted">当前方案</span>
                  <em>{planLabel}</em>
                </div>
              </div>
              <MonthlyUsageCard variant="compact" showTopup={false} />
              <div className="pf-settings-actions">
                <Link className="pf-btn pf-btn-lime pf-btn-sm" to="/pricing">
                  去充值
                </Link>
              </div>
            </section>
          ) : null}

          {tab === 'security' ? (
            <section className="pf-settings-card">
              <h1>安全</h1>
              <p className="pf-muted">登录与账号安全设置</p>
              <div className="pf-settings-fields">
                <label>
                  <span>登录邮箱</span>
                  <input value={user?.email || ''} readOnly />
                </label>
              </div>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                修改密码 <ComingSoon />
              </button>
            </section>
          ) : null}

          {tab === 'team' || tab === 'api' || tab === 'notify' ? (
            <section className="pf-settings-card">
              <h1>{SIDE_ITEMS.find((s) => s.id === tab)?.label}</h1>
              <p className="pf-muted">该模块即将上线，敬请期待。</p>
              <ComingSoon />
            </section>
          ) : null}
        </main>
      </div>
    </AppShell>
  )
}
