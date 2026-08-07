import type { ReactNode } from 'react'
import SiteNav from './SiteNav'

type Props = {
  children: ReactNode
  active?: 'home' | 'templates' | 'studio' | 'history' | 'pricing'
  wide?: boolean
  flush?: boolean
}

export default function AppShell({ children, active, wide, flush }: Props) {
  return (
    <div className="pf-shell">
      <SiteNav active={active} />
      <main className={['pf-shell-main', wide ? 'wide' : '', flush ? 'flush' : ''].filter(Boolean).join(' ')}>
        {children}
      </main>
    </div>
  )
}
