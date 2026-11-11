import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Plus, Settings2, UserRound, UsersRound } from 'lucide-react'
import { CreateTeamModal } from './TeamForms'
import { useTeamPreview } from './useTeamPreview'
import { TEAM_ROLE_LABELS, viewerRole } from './types'
import { tr } from '../../i18n/translate.ts'

/** 顶部入口同步真实个人/团队请求范围。 */
export default function WorkspaceSwitcher() {
  const { teams, selectTeam, activeTeamId, loading, error, reload } = useTeamPreview()
  const location = useLocation()
  const navigate = useNavigate()
  /* detailsRef 原生下拉容器；createOpen 创建团队弹窗；current 路由实际所属团队。 */
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const routeTeamId = location.pathname.match(/^\/teams\/([^/]+)$/)?.[1]
  const current = teams.find((team) => team.id === (routeTeamId || activeTeamId))

  useEffect(() => {
    /** 点击外部或 Escape 关闭空间列表，保留原生键盘操作。 */
    function closeOnOutside(event: PointerEvent) { if (!detailsRef.current?.contains(event.target as Node)) detailsRef.current?.removeAttribute('open') }
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape' && detailsRef.current?.open) { detailsRef.current.removeAttribute('open'); detailsRef.current.querySelector('summary')?.focus() } }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [])
  useEffect(() => { detailsRef.current?.removeAttribute('open') }, [location.pathname, location.search])

  /** 切回个人入口时清空团队请求范围。 */
  function switchTo(teamId: string | null) { selectTeam(teamId); detailsRef.current?.removeAttribute('open'); navigate(teamId ? `/teams/${teamId}` : '/drama') }

  return <>
    <details ref={detailsRef} className="pf-team-switcher">
      <summary aria-label={tr('workspaceSwitcher.switchBetweenPersonalTeamSpaces')}><span className="pf-team-switcher-icon" style={current ? { background: current.color, color: '#fff' } : undefined}>{current ? <UsersRound size={15} /> : <UserRound size={15} />}</span><span className="pf-team-switcher-label">{current?.name ?? tr('workspaceSwitcher.personalSpace')}</span><ChevronDown size={13} /></summary>
      <div className="pf-team-switcher-menu"><div className="pf-team-switcher-caption">{tr('workspaceSwitcher.switchSpace')}</div><button type="button" onClick={() => switchTo(null)}><UserRound size={17} /><span>{tr('workspaceSwitcher.personalSpace')}<small>{tr('workspaceSwitcher.personalWork')}</small></span>{!current && <Check size={15} />}</button>
        <div className="pf-team-switcher-caption">{tr('workspaceSwitcher.myTeams')}</div>{teams.map((team) => <button type="button" key={team.id} onClick={() => switchTo(team.id)}><span className="pf-team-switcher-icon" style={{ background: team.color, color: '#fff' }}>{team.name.slice(0, 1)}</span><span>{team.name}<small>{TEAM_ROLE_LABELS[viewerRole(team)]} · {team.memberCount} {tr('workspaceSwitcher.members')}</small></span>{current?.id === team.id && <Check size={15} />}</button>)}
        <div className="pf-team-switcher-bottom">{loading && <span>{tr('workspaceSwitcher.loading')}</span>}{error && <button type="button" onClick={() => void reload()}>{tr('workspaceSwitcher.failedLoadRetry')}</button>}<button type="button" onClick={() => { detailsRef.current?.removeAttribute('open'); if (!localStorage.getItem('token')) navigate('/auth?next=%2Fteams'); else setCreateOpen(true) }}><Plus size={17} />{tr('workspaceSwitcher.createTeam')}</button><Link to="/teams"><Settings2 size={17} />{tr('workspaceSwitcher.teamManagement')}</Link></div>
      </div>
    </details>
    <CreateTeamModal open={createOpen} onClose={() => setCreateOpen(false)} />
  </>
}
