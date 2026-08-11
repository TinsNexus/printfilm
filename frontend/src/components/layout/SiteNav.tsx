import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { User } from '../../api'
import BrandMark from '../BrandMark'
import HelpCenter from '../ui/HelpCenter'
import { IconBell, IconGift, IconHelp } from '../ui/Icons'

type Props = {
  active?: 'home' | 'templates' | 'studio' | 'history' | 'pricing' | 'drama'
}

export default function SiteNav({ active }: Props) {
  const nav = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api.me().then(setUser).catch(() => localStorage.removeItem('token'))
  }, [])

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
    nav('/')
  }

  function goCreate() {
    nav(user ? '/studio/new' : '/auth')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined)

  return (
    <header className="pf-nav">
      <div className="pf-nav-left">
        <BrandMark />
      </div>
      <nav className="pf-nav-center" aria-label="主导航">
        <NavLink to="/" end className={active === 'home' ? () => 'active' : linkClass}>
          首页
        </NavLink>
        <NavLink to="/templates" className={active === 'templates' ? () => 'active' : linkClass}>
          模板
        </NavLink>
        <NavLink
          to="/studio/new"
          className={() =>
            active === 'studio' || location.pathname.startsWith('/studio') ? 'active' : undefined
          }
        >
          创作台
        </NavLink>
        <NavLink to="/history" className={active === 'history' ? () => 'active' : linkClass}>
          历史
        </NavLink>
        <NavLink to="/pricing" className={active === 'pricing' ? () => 'active' : linkClass}>
          定价
        </NavLink>
      </nav>
      <div className="pf-nav-right">
        <button type="button" className="pf-icon-btn" title="福利（即将推出）" disabled>
          <IconGift size={18} />
        </button>
        <button
          type="button"
          className="pf-icon-btn"
          title="帮助中心"
          aria-label="打开帮助中心"
          onClick={() => setHelpOpen(true)}
        >
          <IconHelp size={18} />
        </button>
        <button type="button" className="pf-icon-btn" title="通知（即将推出）" disabled>
          <IconBell size={18} />
          <span className="dot" />
        </button>
        {user ? (
          <>
            <button type="button" className="pf-avatar" title={`${user.nickname} · 点击退出`} onClick={logout}>
              {user.nickname.slice(0, 1).toUpperCase()}
            </button>
            <button type="button" className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon" onClick={goCreate}>
              开始创作
            </button>
          </>
        ) : (
          <>
            <Link to="/auth" className="pf-link">
              登录
            </Link>
            <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={goCreate}>
              开始创作
            </button>
          </>
        )}
      </div>
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  )
}
