import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, ChevronRight, FolderInput, FolderKanban, Images, LayoutDashboard, Plus, Settings2, UsersRound, Wallet } from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import Button from '../../components/ui/Button'
import TeamDirectory from './TeamDirectory'
import { useTeamPreview } from './useTeamPreview'
import { TeamOverviewPanel, TeamProjectsPanel, TeamAssetsPanel } from './TeamCreativePanels'
import TeamMembersPanel from './TeamMembersPanel'
import TeamBillingPanel from './TeamBillingPanel'
import TeamSettingsPanel from './TeamSettingsPanel'
import { CreateTeamProjectModal } from './TeamForms'
import TransferProjectModal from './TransferProjectModal'
import { TEAM_ROLE_LABELS, viewerRole, type TeamTab } from './types'
import './teams.css'
import { tr } from '../../i18n/translate.ts'

/** 团队侧栏导航和页面标题共用一个配置，避免路由与展示不一致。 */
const TABS = [
  { id: 'overview', label: tr('teamPage.teamOverview'), description: tr('teamPage.gatherIdeasCreateRelay'), icon: LayoutDashboard },
  { id: 'projects', label: tr('teamPage.teamProjects'), description: tr('teamPage.helpEveryGoodStorySteadily'), icon: FolderKanban },
  { id: 'assets', label: tr('teamPage.sharedAssets'), description: tr('teamPage.turnSharedImaginationIntoStarting'), icon: Images },
  { id: 'members', label: tr('teamPage.members'), description: tr('teamPage.findEachOtherSStrengths'), icon: UsersRound },
  { id: 'billing', label: tr('teamPage.spendingLimits'), description: tr('teamPage.everyCreativeSpendClearlyVisible'), icon: Wallet },
  { id: 'settings', label: tr('teamPage.teamSettings'), description: tr('teamPage.manageTeamDetailsHowCollaborate'), icon: Settings2 },
] satisfies { id: TeamTab; label: string; description: string; icon: typeof LayoutDashboard }[]

/** 团队目录与团队内六个页面的统一入口，支持直接链接和浏览器前进后退。 */
export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const [params, setParams] = useSearchParams()
  const { teams, selectTeam, loadTeam } = useTeamPreview()
  const [loading, setLoading] = useState(Boolean(teamId))
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const team = teams.find((item) => item.id === teamId)
  const tab = TABS.find((item) => item.id === params.get('tab')) ?? TABS[0]
  const role = team ? viewerRole(team) : 'member'
  const createOpen = Boolean(team && params.get('create') === '1')
  const transferOpen = Boolean(team && params.get('transfer') === '1')

  useEffect(() => {
    if (!teamId) { setLoading(false); return }
    let active = true
    selectTeam(teamId); setLoading(true); setError('')
    void loadTeam(teamId).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : tr('teamPage.failedLoadTeam')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [teamId, selectTeam, loadTeam, retry])

  /** 只保留有效的团队面板参数，清理跨面板的临时创建状态。 */
  function changeTab(next: TeamTab) { setParams(next === 'overview' ? {} : { tab: next }) }
  /** 团队新建入口留在团队空间。 */
  function openCreateProject() { setParams({ tab: 'projects', create: '1' }) }
  /** 关闭后返回项目列表，并保持刚创建的团队项目可见。 */
  function closeCreateProject() { setParams({ tab: 'projects' }, { replace: true }) }

  return <AppShell active="team" wide>
    <div className="pf-team-page">
      {!teamId ? <TeamDirectory /> : loading ? <div className="pf-team-panel pf-team-empty" role="status">{tr('teamPage.loadingTeamSpace')}</div> : error || !team ? <div className="pf-team-panel pf-team-empty"><UsersRound size={36} /><h1>{tr('teamPage.cannotOpenTeam')}</h1><p>{error || tr('teamPage.teamDoesNotExistNo')}</p><Button onClick={() => setRetry((n) => n + 1)}>{tr('teamPage.reload')}</Button><Button to="/teams" variant="dark">{tr('teamPage.backTeams')}</Button></div> : <>
        <div className="pf-team-breadcrumb"><Link to="/teams">{tr('teamPage.myTeams')}</Link><ChevronRight size={12} /><span>{team.name}</span></div>
        <div className="pf-team-layout">
          <aside className="pf-team-sidebar"><div className="pf-team-sidebar-identity"><span className="pf-team-mark" style={{ background: team.color }}>{team.name.slice(0, 1)}</span><div><strong>{team.name}</strong><span>{team.memberCount} {tr('teamPage.members2')} {TEAM_ROLE_LABELS[role]}</span></div></div>
            <nav aria-label={tr('teamPage.teamNavigation')}><span className="pf-team-sidebar-caption">{tr('teamPage.workspace')}</span>{TABS.map((item, index) => <div key={item.id}>{index === 3 && <span className="pf-team-sidebar-caption">{tr('teamPage.teamManagement')}</span>}<button type="button" className={tab.id === item.id ? 'is-active' : ''} aria-current={tab.id === item.id ? 'page' : undefined} onClick={() => changeTab(item.id)}><item.icon size={17} /><span>{item.label}</span>{item.id === 'members' && <small>{team.memberCount}</small>}</button></div>)}</nav>
            <div className="pf-team-sidebar-foot"><div className="pf-team-avatar" style={{ background: '#dce9ce' }}>{(team.members.find((m) => m.id === team.viewerId)?.name || tr('teamPage.me')).slice(0, 1)}</div><div><strong>{team.members.find((m) => m.id === team.viewerId)?.name || tr('teamPage.currentMembers')}</strong><span>{TEAM_ROLE_LABELS[role]}</span></div></div>
            <Link to="/teams" className="pf-team-sidebar-back"><ArrowLeft size={14} />{tr('teamPage.allTeams')}</Link>
          </aside>
          <main className="pf-team-content"><header className="pf-team-content-header"><div><span className="pf-team-eyebrow">TEAM WORKSPACE</span><h1>{tab.label}</h1><p>{tab.description}</p></div>{tab.id === 'overview' && <Button variant="outline" onClick={() => changeTab('members')}><UsersRound size={16} />{role === 'member' ? tr('teamPage.viewCollaborators') : tr('teamPage.inviteCollaborators')}<ArrowUpRight size={14} /></Button>}{tab.id === 'projects' && <Button variant="outline" onClick={() => setParams({ tab: 'projects', transfer: '1' })}><FolderInput size={16} />{tr('teamPage.transferPersonalProject')}</Button>}{tab.id === 'assets' && <Button variant="outline" onClick={() => changeTab('projects')}><Plus size={16} />{tr('teamPage.collectAssetsProjects')}</Button>}</header>
            <div key={`${team.id}:${tab.id}`} className="pf-team-content-panel">
              {tab.id === 'overview' && <TeamOverviewPanel team={team} role={role} onTabChange={changeTab} onCreateProject={openCreateProject} />}
              {tab.id === 'projects' && <TeamProjectsPanel team={team} role={role} onTabChange={changeTab} onCreateProject={openCreateProject} />}
              {tab.id === 'assets' && <TeamAssetsPanel team={team} role={role} onTabChange={changeTab} onCreateProject={openCreateProject} />}
              {tab.id === 'members' && <TeamMembersPanel team={team} role={role} />}
              {tab.id === 'billing' && <TeamBillingPanel team={team} role={role} />}
              {tab.id === 'settings' && <TeamSettingsPanel team={team} role={role} />}
            </div>
            <div className="pf-team-page-foot"><span className="pf-team-preview-dot" />{tr('teamPage.teamModeGatherFirstThen')}<span>PRINTFILM / TOGETHER</span></div>
          </main>
        </div>
        <CreateTeamProjectModal open={createOpen} onClose={closeCreateProject} teamId={team.id} />
        <TransferProjectModal open={transferOpen} onClose={closeCreateProject} team={team} />
      </>}
    </div>
  </AppShell>
}
