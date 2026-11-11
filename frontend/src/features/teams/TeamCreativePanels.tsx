import { points } from '../../lib/points'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Check, FolderOpen, Image, Plus, Search, ShieldCheck, Trash2, Users, Wallet } from 'lucide-react'
import Button from '../../components/ui/Button'
import { ProjectCard, ProjectGrid } from '../../components/projects/ProjectCard'
import { AssetBanner, AssetCard, AssetEmpty, AssetGrid, AssetSearch, AssetTypeFilter } from '../../components/assets/AssetLibrary'
import { AssetDetailDialog } from '../../components/assets/AssetDetailDialog'
import { teamsApi } from '../../api/teams'
import { dramaApi, resolveDramaMediaUrl } from '../../api/drama'
import { useTeamPreview } from './useTeamPreview'
import { useTeamPage } from './useTeamPage'
import { TeamPagination } from './TeamPagination'
import type { TeamAsset, TeamProject, Team, TeamProjectStatus, TeamRole, TeamTab } from './types'
import { dialog } from '../../lib/dialog'
import './team-creative.css'
import { tr } from '../../i18n/translate.ts'

/** 创作面板共享当前真实团队与导航操作。 */
type CreativePanelProps = { team: Team; role: TeamRole; onTabChange: (tab: TeamTab) => void; onCreateProject: () => void }
const statusLabels: Record<TeamProjectStatus, string> = { draft: tr('teamCreativePanels.planning'), producing: tr('teamCreativePanels.production'), completed: tr('teamCreativePanels.done') }
const assetLabels: Record<TeamAsset['type'], string> = { character: tr('teamCreativePanels.character'), scene: tr('teamCreativePanels.scene'), prop: tr('teamCreativePanels.prop'), voice: tr('teamCreativePanels.voice') }
/** 金额显示为元。 */
const money = points
/** 日期为空时保持可读。 */
function dateLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
/** 展示真实参与者，未出现在首屏成员中的使用成员标识。 */
function Collaborators({ team, ids }: { team: Team; ids: string[] }) { return <span className="pf-team-project-people">{ids.slice(0, 3).map((id) => { const member = team.members.find((item) => item.id === id); return <span key={id} className="pf-team-avatar" title={member?.name || tr('teamCreativePanels.member', { id })} style={{ background: member?.color || '#e8eddf' }}>{(member?.name || tr('teamCreativePanels.member2')).slice(0, 1)}</span> })}{ids.length > 3 && <span className="pf-team-project-people-more">+{ids.length - 3}</span>}</span> }
/** 项目卡片直接进入真实漫剧工作台，不构造假的分集与占用信息。 */
function TeamProjectCard({ project, team }: { project: TeamProject; team: Team }) {
  const navigate = useNavigate()
  const { loadTeam } = useTeamPreview()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 删除真实团队项目，历史账单仍由服务端保留。 */
  async function remove() {
    if (team.myRole === 'member' || busy) return
    if (!await dialog.confirm({ title: tr('teamCreativePanels.deleteTeamProject'), message: tr('teamCreativePanels.deleteItsEpisodesAssetsCannot', { title: project.title }), confirmText: tr('teamCreativePanels.deleteProject'), tone: 'danger' })) return
    setBusy(true); setError('')
    try { await dramaApi.deleteProject(Number(project.id)); await loadTeam(team.id) } catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamCreativePanels.deleteFailed')) } finally { setBusy(false) }
  }
  return <ProjectCard
    title={project.title}
    coverUrl={project.cover ? resolveDramaMediaUrl(project.cover) : undefined}
    kind="drama"
    category={tr('teamCreativePanels.episodes', { genre: project.genre, episodes: project.episodes })}
    status={{ label: statusLabels[project.status], tone: project.status }}
    description={project.description || tr('teamCreativePanels.waitingStorySNextChapter')}
    progress={{ label: tr('teamCreativePanels.episodeProgress'), value: project.completedEpisodes, total: project.episodes }}
    footer={<><Collaborators team={team} ids={project.collaborators} /><span>{dateLabel(project.updatedAt)} {tr('teamCreativePanels.updated')}</span></>}
    actions={team.myRole !== 'member' || error ? <>{team.myRole !== 'member' && <Button variant="text" size="sm" disabled={busy} onClick={remove}><Trash2 size={13} />{busy ? tr('teamCreativePanels.deleting') : tr('teamCreativePanels.deleteProject2')}</Button>}{error && <p className="pf-team-alert" role="alert">{error}</p>}</> : undefined}
    onOpen={() => navigate(`/drama/projects/${project.id}`)}
  />
}

/** 真实工作台概要，统计使用后端汇总而非分页条数。 */
export function TeamOverviewPanel({ team, role, onTabChange, onCreateProject }: CreativePanelProps) {
  return <div className="pf-team-overview">
    <section className="pf-team-overview-welcome"><div><span className="pf-team-overview-eyebrow">{tr('teamCreativePanels.oneTeamMoreGreatStories')}</span><h2>{tr('teamCreativePanels.whereIdeasComeTogether')}<span>。</span></h2><p>{tr('teamCreativePanels.firstPageScriptFinalShot')}</p></div><Button variant="dark" onClick={onCreateProject}><Plus size={17} />{tr('teamCreativePanels.newTeamProject')}</Button><span className="pf-team-overview-welcome-mark" aria-hidden="true">PF<br /><i>TOGETHER.</i></span></section>
    <div className="pf-team-overview-stats">{[{ label: tr('teamCreativePanels.teamProjects'), value: team.projectCount, note: tr('teamCreativePanels.visibleAllMembers'), icon: FolderOpen, tab: 'projects' as const }, { label: tr('teamCreativePanels.collaborators'), value: team.memberCount, note: tr('teamCreativePanels.bringEveryoneSStrengthsTogether'), icon: Users, tab: 'members' as const }, { label: tr('teamCreativePanels.sharedAssets'), value: team.assetCount, note: tr('teamCreativePanels.buildUpIdeasNextShot'), icon: Image, tab: 'assets' as const }, { label: role === 'owner' ? tr('teamCreativePanels.teamSpendingMonth') : tr('teamCreativePanels.mySpendingMonth'), value: team.usage ? money(team.usage.spent_fen) : '—', note: team.usage?.period || tr('teamCreativePanels.spending'), icon: Wallet, tab: 'billing' as const }].map((item) => <button type="button" className="pf-team-overview-stat" key={item.label} onClick={() => onTabChange(item.tab)}><span>{item.label}<item.icon size={18} /></span><strong>{item.value}</strong><small>{item.note}<ArrowUpRight size={14} /></small></button>)}</div>
    <section className="pf-team-panel"><div className="pf-team-section-head"><div><h3>{tr('teamCreativePanels.recentWork')}</h3><p className="pf-team-muted">{tr('teamCreativePanels.pickUpStoryWhereLeft')}</p></div><Button variant="text" size="sm" onClick={() => onTabChange('projects')}>{tr('teamCreativePanels.allProjects')}<ArrowRight size={15} /></Button></div>{team.projects.length ? <ProjectGrid>{team.projects.map((project) => <TeamProjectCard key={project.id} project={project} team={team} />)}</ProjectGrid> : <div className="pf-team-empty"><FolderOpen size={28} /><strong>{tr('teamCreativePanels.everyStoryStartsNewProject')}</strong><p>{tr('teamCreativePanels.createTeamSFirstProject')}</p><Button variant="lime" onClick={onCreateProject}>{tr('teamCreativePanels.newTeamProject')}</Button></div>}</section>
    <div className="pf-team-overview-bottom"><section className="pf-team-panel"><div className="pf-team-section-head"><h3>{tr('teamCreativePanels.teamActivity')}</h3></div><div className="pf-team-overview-activities">{team.activities.map((activity) => { const member = team.members.find((item) => item.id === activity.memberId); return <div className="pf-team-overview-activity" key={activity.id}><span className="pf-team-avatar" style={{ background: member?.color || '#edf0e8' }}>{(member?.name || tr('teamCreativePanels.member2')).slice(0, 1)}</span><div><p><strong>{member?.name || activity.memberName || tr('teamCreativePanels.teamMembers')}</strong> {activity.action}</p><span>{activity.subject}</span></div><time>{dateLabel(activity.createdAt)}</time></div> })}{!team.activities.length && <p className="pf-team-empty">{tr('teamCreativePanels.noTeamActivityYet')}</p>}</div></section><section className="pf-team-overview-rules"><span className="pf-team-overview-eyebrow"><ShieldCheck size={16} />{tr('teamCreativePanels.howWeWork')}</span><h3>{tr('teamCreativePanels.createTogether')}<br />{tr('teamCreativePanels.whileKeepingOwnRhythm')}</h3><p>{tr('teamCreativePanels.differentEpisodesAssetsCanMove')}</p><ul><li><Check size={15} />{tr('teamCreativePanels.teamProjectsVisibleAllMembers')}</li><li><Check size={15} />{tr('teamCreativePanels.reusedAssetsCopiedIntoCurrent')}</li><li><Check size={15} />{tr('teamCreativePanels.onlyOwnerManagesTeamFinances')}</li></ul></section></div>
  </div>
}

/** 项目搜索、筛选与分页均在服务端执行。 */
export function TeamProjectsPanel({ team, onCreateProject }: CreativePanelProps) {
  /* query/status/page 是服务器查询条件；revision 管理操作后的刷新代次。 */
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | TeamProjectStatus>('all')
  const [page, setPage] = useState(1)
  const { revision } = useTeamPreview()
  const listing = useTeamPage(`${team.id}:projects:${query}:${status}:${page}`, (signal) => teamsApi.projects(team.id, { page, page_size: 12, q: query, status: status === 'all' ? undefined : status }, signal), revision)
  return <section className="pf-team-panel pf-team-project-panel"><div className="pf-team-section-head"><div><h2>{tr('teamCreativePanels.teamProjects')}</h2><p className="pf-team-muted">{tr('teamCreativePanels.sharedSpaceMovesEveryStory')}</p></div><Button variant="lime" onClick={onCreateProject}><Plus size={17} />{tr('teamCreativePanels.newProject')}</Button></div><div className="pf-team-project-toolbar"><div className="pf-team-project-filters" role="group" aria-label={tr('teamCreativePanels.filterProjectStatus')}>{(['all', 'producing', 'draft', 'completed'] as const).map((value) => <button type="button" className={`pf-team-pill${status === value ? ' is-active' : ''}`} aria-pressed={status === value} key={value} onClick={() => { setStatus(value); setPage(1) }}>{value === 'all' ? tr('teamCreativePanels.allProjects') : statusLabels[value]}</button>)}</div><label className="pf-team-project-search"><Search size={17} /><input aria-label={tr('teamCreativePanels.searchTeamProjects')} placeholder={tr('teamCreativePanels.searchProjectNamesGenres')} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label></div>{listing.loading ? <p role="status">{tr('teamCreativePanels.loadingProjects')}</p> : listing.error ? <div role="alert" className="pf-team-alert">{listing.error}<Button onClick={listing.retry}>{tr('teamCreativePanels.retry')}</Button></div> : listing.items.length ? <ProjectGrid>{listing.items.map((project) => <TeamProjectCard key={project.id} project={project} team={team} />)}</ProjectGrid> : <div className="pf-team-empty"><FolderOpen size={30} /><strong>{tr('teamCreativePanels.noMatchingTeamProjects')}</strong><p>{tr('teamCreativePanels.adjustFiltersStartNewStory')}</p></div>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} /></section>
}

/** 团队共享资产按页读取，详情使用真实媒体与来源项目。 */
export function TeamAssetsPanel({ team }: CreativePanelProps) {
  /* query/type/page 为服务器筛选；selected 为真实资产详情；copyStatus 是复制反馈。 */
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | TeamAsset['type']>('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<TeamAsset | null>(null)
  const { revision } = useTeamPreview()
  const navigate = useNavigate()
  const listing = useTeamPage(`${team.id}:assets:${query}:${type}:${page}`, (signal) => teamsApi.assets(team.id, { page, page_size: 12, q: query, type: type === 'all' ? undefined : type }, signal), revision)
  return <section className="pf-team-panel pf-team-asset-panel"><div className="pf-team-section-head"><div><h2>{tr('teamCreativePanels.teamAssetLibrary')}</h2><p className="pf-team-muted">{tr('teamCreativePanels.charactersScenesPropsCaptureTeam')}</p></div><span className="pf-team-tag"><Image size={14} />{listing.meta.total} {tr('teamCreativePanels.assets')}</span></div><AssetBanner>{tr('teamCreativePanels.copyAssetsIntoTargetProject')}</AssetBanner>
    <div className="pf-library-toolbar"><AssetTypeFilter options={[{ value: 'all' as const, label: tr('teamCreativePanels.allAssets') }, ...(['character', 'scene', 'prop', 'voice'] as const).map((value) => ({ value, label: assetLabels[value] }))]} value={type} onChange={(value) => { setType(value); setPage(1) }} /><AssetSearch value={query} onChange={(value) => { setQuery(value); setPage(1) }} /></div>{listing.loading ? <p role="status">{tr('teamCreativePanels.loadingAssets')}</p> : listing.error ? <div className="pf-team-alert" role="alert">{listing.error}<Button onClick={listing.retry}>{tr('teamCreativePanels.retry')}</Button></div> : listing.items.length ? <AssetGrid>{listing.items.map((asset) => <AssetCard key={asset.id} asset={asset} subtitle={tr('teamCreativePanels.project', { projectId: asset.projectId })} footer={tr('teamCreativePanels.teamAssets')} updatedAt={asset.updatedAt} onOpen={() => { setSelected(asset) }} />)}</AssetGrid> : <AssetEmpty>{tr('teamCreativePanels.charactersScenesPropsProjectsWill')}</AssetEmpty>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} />
    {selected && <AssetDetailDialog asset={{ id: Number(selected.id), type: selected.type, asset_type: selected.assetType, name: selected.name, cover: selected.cover, url: selected.url, params: selected.params, references: selected.references, project_id: Number(selected.projectId), updated_at: selected.updatedAt }} description={selected.description} onClose={() => setSelected(null)} actions={<Button variant="dark" onClick={() => navigate(`/drama/projects/${selected.projectId}`, { state: { activeStep: 'assets' } })}>{tr('teamCreativePanels.openSourceProject')}</Button>} />}
  </section>
}
