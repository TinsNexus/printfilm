import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { User } from '../../api'
import BrandMark from '../BrandMark'
import { IconHelp } from '../ui/Icons'

export type NavActive = 'home' | 'drama' | 'kepu' | 'tools' | 'assets' | 'pricing' | 'templates' | 'studio' | 'history'

type Props = {
  active?: NavActive
}

// 将旧 active 别名归一到新 IA
function normalizeActive(active: NavActive | undefined, pathname: string): NavActive | undefined {
  if (active === 'studio' || active === 'templates') return 'kepu'
  if (active === 'history') return undefined
  if (active) return active
  if (pathname.startsWith('/drama/assets') || pathname.startsWith('/assets')) return 'assets'
  if (pathname.startsWith('/drama')) return 'drama'
  if (pathname.startsWith('/studio') || pathname.startsWith('/templates')) return 'kepu'
  if (pathname.startsWith('/tools')) return 'tools'
  if (pathname.startsWith('/pricing')) return 'pricing'
  if (pathname === '/') return 'home'
  return undefined
}

export default function SiteNav({ active }: Props) {
  const nav = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const current = normalizeActive(active, location.pathname)

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api.me().then(setUser).catch(() => localStorage.removeItem('token'))
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  function goCreate() {
    nav(user ? '/drama' : '/auth')
  }

  const isActive = (key: NavActive) => (current === key ? 'active' : undefined)

  const centerLinks = (
    <>
      <NavLink to="/" end className={() => isActive('home')}>
        工作台
      </NavLink>
      <NavLink to="/drama" className={() => isActive('drama')}>
        漫剧
      </NavLink>
      <NavLink to="/studio/new" className={() => isActive('kepu')}>
        科普
      </NavLink>
      <NavLink to="/tools" className={() => isActive('tools')}>
        工具
      </NavLink>
      <NavLink to="/assets" className={() => isActive('assets')}>
        资产
      </NavLink>
      <NavLink to="/pricing" className={() => isActive('pricing')}>
        定价
      </NavLink>
    </>
  )

  return (
    <header className="pf-nav">
      <div className="pf-nav-left">
        <BrandMark />
      </div>
      <nav className="pf-nav-center" aria-label="主导航">
        {centerLinks}
      </nav>
      <div className="pf-nav-right">
        <button type="button" className="pf-nav-help-btn" title="帮助中心" onClick={() => nav('/help')}>
          <IconHelp size={18} className="pf-nav-help-icon" />
          <span>帮助</span>
        </button>
        {user ? (
          <button
            type="button"
            className="pf-avatar"
            title={`${user.nickname} · 个人中心`}
            onClick={() => nav('/settings')}
          >
            {user.nickname.slice(0, 1).toUpperCase()}
          </button>
        ) : (
          <Link to="/auth" className="pf-link pf-nav-login">
            登录
          </Link>
        )}
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon" onClick={goCreate}>
          开始创作
        </button>
        <button
          type="button"
          className="pf-nav-burger"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      {menuOpen ? (
        <div className="pf-nav-drawer" role="dialog" aria-label="移动导航">
          <nav className="pf-nav-drawer-links">{centerLinks}</nav>
        </div>
      ) : null}
    </header>
  )
}
