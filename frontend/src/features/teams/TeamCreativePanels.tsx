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
import { tv } from '../../i18n/tv'

/** 创作面板共享当前真实团队与导航操作。 */
type CreativePanelProps = { team: Team; role: TeamRole; onTabChange: (tab: TeamTab) => void; onCreateProject: () => void }
const statusLabels: Record<TeamProjectStatus, string> = { draft: tv('构思中', 'Đang lên ý tưởng'), producing: tv('制作中', 'Đang sản xuất'), completed: tv('已完成', 'Đã hoàn tất') }
const assetLabels: Record<TeamAsset['type'], string> = { character: tv('角色', 'Nhân vật'), scene: tv('场景', 'Bối cảnh'), prop: tv('道具', 'Đạo cụ'), voice: tv('音色', 'Giọng nói') }
/** 金额显示为元。 */
function money(amount: number): string { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount / 100) }
/** 日期为空时保持可读。 */
function dateLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
/** 展示真实参与者，未出现在首屏成员中的使用成员标识。 */
function Collaborators({ team, ids }: { team: Team; ids: string[] }) { return <span className="pf-team-project-people">{ids.slice(0, 3).map((id) => { const member = team.members.find((item) => item.id === id); return <span key={id} className="pf-team-avatar" title={member?.name || tv(`成员 ${id}`, `Thành viên ${id}`)} style={{ background: member?.color || '#e8eddf' }}>{(member?.name || tv('成员', 'Thành viên')).slice(0, 1)}</span> })}{ids.length > 3 && <span className="pf-team-project-people-more">+{ids.length - 3}</span>}</span> }
/** 项目卡片直接进入真实漫剧工作台，不构造假的分集与占用信息。 */
function TeamProjectCard({ project, team }: { project: TeamProject; team: Team }) {
  const navigate = useNavigate()
  const { loadTeam } = useTeamPreview()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 删除真实团队项目，历史账单仍由服务端保留。 */
  async function remove() {
    if (team.myRole === 'member' || busy) return
    if (!await dialog.confirm({ title: tv('删除团队项目', 'Xóa dự án nhóm'), message: tv(`确定删除「${project.title}」及其分集和资产？此操作无法恢复，历史账单仍然保留。`, `Xác nhận xóa “${project.title}” cùng các tập và tài sản? Thao tác này không thể khôi phục, hóa đơn lịch sử vẫn được giữ.`), confirmText: tv('确认删除项目', 'Xác nhận xóa dự án'), tone: 'danger' })) return
    setBusy(true); setError('')
    try { await dramaApi.deleteProject(Number(project.id)); await loadTeam(team.id) } catch (cause) { setError(cause instanceof Error ? cause.message : tv('删除失败', 'Xóa thất bại')) } finally { setBusy(false) }
  }
  return <ProjectCard
    title={project.title}
    coverUrl={project.cover ? resolveDramaMediaUrl(project.cover) : undefined}
    kind="drama"
    category={tv(`${project.genre} · ${project.episodes} 集`, `${project.genre} · ${project.episodes} tập`)}
    status={{ label: statusLabels[project.status], tone: project.status }}
    description={project.description || tv('等待写下故事的下一章。', 'Đang chờ viết chương tiếp theo của câu chuyện.')}
    progress={{ label: tv('分集进度', 'Tiến độ các tập'), value: project.completedEpisodes, total: project.episodes }}
    footer={<><Collaborators team={team} ids={project.collaborators} /><span>{dateLabel(project.updatedAt)} {tv("更新", "Cập nhật")}</span></>}
    actions={team.myRole !== 'member' || error ? <>{team.myRole !== 'member' && <Button variant="text" size="sm" disabled={busy} onClick={remove}><Trash2 size={13} />{busy ? tv('正在删除…', 'Đang xóa…') : tv('删除项目', 'Xóa dự án')}</Button>}{error && <p className="pf-team-alert" role="alert">{error}</p>}</> : undefined}
    onOpen={() => navigate(`/drama/projects/${project.id}`)}
  />
}

/** 真实工作台概要，统计使用后端汇总而非分页条数。 */
export function TeamOverviewPanel({ team, role, onTabChange, onCreateProject }: CreativePanelProps) {
  return <div className="pf-team-overview">
    <section className="pf-team-overview-welcome"><div><span className="pf-team-overview-eyebrow">{tv("一个团队，更多好故事", "Một nhóm, nhiều câu chuyện hay hơn")}</span><h2>{tv("让灵感在这里汇合", "Để cảm hứng hội tụ ở đây")}<span>。</span></h2><p>{tv("从第一段剧本到最后一个镜头，与创作伙伴一起推进每个故事。", "Từ trang kịch bản đầu tiên đến cảnh quay cuối cùng, cùng các cộng sự thúc đẩy từng câu chuyện.")}</p></div><Button variant="dark" onClick={onCreateProject}><Plus size={17} />{tv("新建团队项目", "Tạo dự án nhóm mới")}</Button><span className="pf-team-overview-welcome-mark" aria-hidden="true">PF<br /><i>TOGETHER.</i></span></section>
    <div className="pf-team-overview-stats">{[{ label: tv('团队项目', 'Dự án nhóm'), value: team.projectCount, note: tv('所有成员共享可见', 'Mọi thành viên đều thấy'), icon: FolderOpen, tab: 'projects' as const }, { label: tv('创作伙伴', 'Cộng sự sáng tạo'), value: team.memberCount, note: tv('连接各自的擅长', 'Kết nối thế mạnh của mỗi người'), icon: Users, tab: 'members' as const }, { label: tv('共享资产', 'Tài sản chung'), value: team.assetCount, note: tv('为下一个镜头积累灵感', 'Tích lũy cảm hứng cho cảnh quay tiếp theo'), icon: Image, tab: 'assets' as const }, { label: role === 'owner' ? tv('本月团队消费', 'Chi tiêu nhóm tháng này') : tv('本月本人消费', 'Chi tiêu của tôi tháng này'), value: team.usage ? money(team.usage.spent_fen) : '—', note: team.usage?.period || tv('消费统计', 'Thống kê chi tiêu'), icon: Wallet, tab: 'billing' as const }].map((item) => <button type="button" className="pf-team-overview-stat" key={item.label} onClick={() => onTabChange(item.tab)}><span>{item.label}<item.icon size={18} /></span><strong>{item.value}</strong><small>{item.note}<ArrowUpRight size={14} /></small></button>)}</div>
    <section className="pf-team-panel"><div className="pf-team-section-head"><div><h3>{tv("最近创作", "Sáng tạo gần đây")}</h3><p className="pf-team-muted">{tv("继续那个还没讲完的故事", "Tiếp tục câu chuyện chưa kể xong")}</p></div><Button variant="text" size="sm" onClick={() => onTabChange('projects')}>{tv("全部项目", "Tất cả dự án")}<ArrowRight size={15} /></Button></div>{team.projects.length ? <ProjectGrid>{team.projects.map((project) => <TeamProjectCard key={project.id} project={project} team={team} />)}</ProjectGrid> : <div className="pf-team-empty"><FolderOpen size={28} /><strong>{tv("故事从一个新项目开始", "Câu chuyện bắt đầu từ một dự án mới")}</strong><p>{tv("建立团队的第一个创作空间。", "Tạo không gian sáng tạo đầu tiên của nhóm.")}</p><Button variant="lime" onClick={onCreateProject}>{tv("新建团队项目", "Tạo dự án nhóm mới")}</Button></div>}</section>
    <div className="pf-team-overview-bottom"><section className="pf-team-panel"><div className="pf-team-section-head"><h3>{tv("团队动态", "Hoạt động nhóm")}</h3></div><div className="pf-team-overview-activities">{team.activities.map((activity) => { const member = team.members.find((item) => item.id === activity.memberId); return <div className="pf-team-overview-activity" key={activity.id}><span className="pf-team-avatar" style={{ background: member?.color || '#edf0e8' }}>{(member?.name || tv('成员', 'Thành viên')).slice(0, 1)}</span><div><p><strong>{member?.name || activity.memberName || tv('团队成员', 'Thành viên nhóm')}</strong> {activity.action}</p><span>{activity.subject}</span></div><time>{dateLabel(activity.createdAt)}</time></div> })}{!team.activities.length && <p className="pf-team-empty">{tv("暂时没有团队动态。", "Tạm thời chưa có hoạt động nhóm.")}</p>}</div></section><section className="pf-team-overview-rules"><span className="pf-team-overview-eyebrow"><ShieldCheck size={16} />{tv("协作方式", "Cách cộng tác")}</span><h3>{tv("一起创作，", "Cùng sáng tạo,")}<br />{tv("也保留各自的节奏。", "vẫn giữ nhịp riêng của mỗi người.")}</h3><p>{tv("不同分集、不同资产可以同时推进；同一内容由一位成员编辑，减少互相覆盖。", "Các tập và tài sản khác nhau có thể tiến hành đồng thời; cùng một nội dung do một thành viên chỉnh sửa, giảm ghi đè lẫn nhau.")}</p><ul><li><Check size={15} />{tv("团队项目对所有成员可见", "Dự án nhóm hiển thị với mọi thành viên")}</li><li><Check size={15} />{tv("复用资产时复制到当前项目", "Khi dùng lại tài sản sẽ sao chép vào dự án hiện tại")}</li><li><Check size={15} />{tv("团队财务仅所有者可管理", "Tài chính nhóm chỉ chủ sở hữu mới quản lý được")}</li></ul></section></div>
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
  return <section className="pf-team-panel pf-team-project-panel"><div className="pf-team-section-head"><div><h2>{tv("团队项目", "Dự án nhóm")}</h2><p className="pf-team-muted">{tv("共同的创作空间，让每个故事向前一步。", "Không gian sáng tạo chung, để mỗi câu chuyện tiến thêm một bước.")}</p></div><Button variant="lime" onClick={onCreateProject}><Plus size={17} />{tv("新建项目", "Tạo dự án mới")}</Button></div><div className="pf-team-project-toolbar"><div className="pf-team-project-filters" role="group" aria-label={tv("按项目状态筛选", "Lọc theo trạng thái dự án")}>{(['all', 'producing', 'draft', 'completed'] as const).map((value) => <button type="button" className={`pf-team-pill${status === value ? ' is-active' : ''}`} aria-pressed={status === value} key={value} onClick={() => { setStatus(value); setPage(1) }}>{value === 'all' ? tv('全部项目', 'Tất cả dự án') : statusLabels[value]}</button>)}</div><label className="pf-team-project-search"><Search size={17} /><input aria-label={tv("搜索团队项目", "Tìm dự án nhóm")} placeholder={tv("搜索项目名称或题材", "Tìm tên dự án hoặc thể loại")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label></div>{listing.loading ? <p role="status">{tv("正在加载项目…", "Đang tải dự án…")}</p> : listing.error ? <div role="alert" className="pf-team-alert">{listing.error}<Button onClick={listing.retry}>{tv("重试", "Thử lại")}</Button></div> : listing.items.length ? <ProjectGrid>{listing.items.map((project) => <TeamProjectCard key={project.id} project={project} team={team} />)}</ProjectGrid> : <div className="pf-team-empty"><FolderOpen size={30} /><strong>{tv("暂无符合条件的团队项目", "Chưa có dự án nhóm phù hợp")}</strong><p>{tv("调整筛选条件，或开始一个新的故事。", "Điều chỉnh điều kiện lọc, hoặc bắt đầu một câu chuyện mới.")}</p></div>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} /></section>
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
  return <section className="pf-team-panel pf-team-asset-panel"><div className="pf-team-section-head"><div><h2>{tv("团队资产库", "Thư viện tài sản nhóm")}</h2><p className="pf-team-muted">{tv("角色、场景与道具，沉淀团队共同的想象力。", "Nhân vật, bối cảnh và đạo cụ, lắng đọng trí tưởng tượng chung của nhóm.")}</p></div><span className="pf-team-tag"><Image size={14} />{listing.meta.total} {tv("项资产", "tài sản")}</span></div><AssetBanner>{tv("在项目资产选择器中复制到目标项目，后续修改各自独立。", "Sao chép vào dự án đích trong bộ chọn tài sản của dự án, các chỉnh sửa sau đó độc lập với nhau.")}</AssetBanner>
    <div className="pf-library-toolbar"><AssetTypeFilter options={[{ value: 'all' as const, label: tv('全部资产', 'Tất cả tài sản') }, ...(['character', 'scene', 'prop', 'voice'] as const).map((value) => ({ value, label: assetLabels[value] }))]} value={type} onChange={(value) => { setType(value); setPage(1) }} /><AssetSearch value={query} onChange={(value) => { setQuery(value); setPage(1) }} /></div>{listing.loading ? <p role="status">{tv("正在加载资产…", "Đang tải tài sản…")}</p> : listing.error ? <div className="pf-team-alert" role="alert">{listing.error}<Button onClick={listing.retry}>{tv("重试", "Thử lại")}</Button></div> : listing.items.length ? <AssetGrid>{listing.items.map((asset) => <AssetCard key={asset.id} asset={asset} subtitle={tv(`项目 #${asset.projectId}`, `Dự án #${asset.projectId}`)} footer={tv("团队资产", "Tài sản nhóm")} updatedAt={asset.updatedAt} onOpen={() => { setSelected(asset) }} />)}</AssetGrid> : <AssetEmpty>{tv("项目中的角色、场景与道具将汇集在这里。", "Nhân vật, bối cảnh và đạo cụ trong dự án sẽ được tập hợp ở đây.")}</AssetEmpty>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} />
    {selected && <AssetDetailDialog asset={{ id: Number(selected.id), type: selected.type, asset_type: selected.assetType, name: selected.name, cover: selected.cover, url: selected.url, params: selected.params, references: selected.references, project_id: Number(selected.projectId), updated_at: selected.updatedAt }} description={selected.description} onClose={() => setSelected(null)} actions={<Button variant="dark" onClick={() => navigate(`/drama/projects/${selected.projectId}`, { state: { activeStep: 'assets' } })}>{tv("打开来源项目", "Mở dự án nguồn")}</Button>} />}
  </section>
}
