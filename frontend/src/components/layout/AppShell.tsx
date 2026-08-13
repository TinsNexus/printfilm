import type { ReactNode } from 'react'
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
          <p>© {new Date().getFullYear()} PRINTFILM. All rights reserved.</p>
        </footer>
      ) : null}
    </div>
  )
}
