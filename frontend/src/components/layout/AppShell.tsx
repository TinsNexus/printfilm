import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import SiteNav, { type NavActive } from './SiteNav'

type Props = {
  children: ReactNode
  active?: NavActive
  wide?: boolean
  flush?: boolean
  /** 隐藏页脚（全屏工作台） */
  hideFooter?: boolean
}

export default function AppShell({ children, active, wide, flush, hideFooter }: Props) {
  return (
    <div className="pf-shell">
      <SiteNav active={active} />
      <main className={['pf-shell-main', wide ? 'wide' : '', flush ? 'flush' : ''].filter(Boolean).join(' ')}>
        {children}
      </main>
      {!hideFooter && !flush ? (
        <footer className="pf-shell-footer">
          <nav className="pf-shell-footer-links" aria-label="页脚链接">
            <Link to="/terms">用户协议</Link>
            <Link to="/privacy">隐私政策</Link>
            <Link to="/contact">联系我们</Link>
            <Link to="/help">帮助中心</Link>
          </nav>
          <p>© {new Date().getFullYear()} PRINTFILM. All rights reserved.</p>
        </footer>
      ) : null}
    </div>
  )
}
