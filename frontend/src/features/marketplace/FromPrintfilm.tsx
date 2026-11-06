import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { request, type Handoff } from './api'
import { internalReturn, PageHeading, withReturn } from './ui'
import Button from '../../components/ui/Button'
import DramaPublishModal from './DramaPublishModal'
import { tv } from '../../i18n/tv'

type ProjectSource = { id: number; title: string; updated_at: string; has_cover: boolean; status: string }
type DramaSource = { id: number; title: string; episodes: { id: number; name: string; ready: boolean }[] }
type SeriesOption = { id: number; title: string }
type SeriesStep = { id: number; mode: 'pick' | 'existing' }

// 选了短剧之后，再决定新建一部，或加入已有短剧。
function SeriesStepPanel({ series, busy, mode, onCreate, onExisting, onJoin }: {
  series: SeriesOption[]
  busy: boolean
  mode: 'pick' | 'existing'
  onCreate: () => void
  onExisting: () => void
  onJoin: (id: number) => void
}) {
  const [existingId, setExistingId] = useState('')
  return <div className="pf-market-series-step">
    <p>{tv("这部成片会作为短剧的一集，不改已经发布过的旧版本。", "Phim này sẽ là một tập của phim ngắn, không thay đổi phiên bản cũ đã đăng.")}</p>
    {mode === 'pick' ? <div>
      <Button type="button" variant="lime" disabled={busy} onClick={onCreate}>{tv("新建短剧", "Tạo phim ngắn mới")}</Button>
      <button type="button" disabled={busy} onClick={onExisting}>{tv("加入已有短剧", "Thêm vào phim ngắn có sẵn")}</button>
    </div> : series.length === 0 ? <div>
      <p>{tv("还没有短剧，请新建。", "Chưa có phim ngắn, vui lòng tạo mới.")}</p>
      <Button type="button" variant="lime" disabled={busy} onClick={onCreate}>{tv("新建短剧", "Tạo phim ngắn mới")}</Button>
    </div> : <div>
      <label>{tv("已有短剧", "Phim ngắn có sẵn")}<select value={existingId} onChange={event => setExistingId(event.target.value)} disabled={busy}><option value="">{tv("请选择短剧", "Vui lòng chọn phim ngắn")}</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <button type="button" disabled={busy || !existingId} onClick={() => onJoin(Number(existingId))}>{tv("添加到这部短剧", "Thêm vào phim ngắn này")}</button>
    </div>}
  </div>
}

// 从 PrintFilm 已生成成片发起转存。页面只提交编号，不提交视频地址。
export default function FromPrintfilm() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const focusProject = Number(search.get('project') || 0)
  const focusDrama = Number(search.get('drama') || 0)
  const focusEpisode = Number(search.get('episode') || 0)
  const origin = internalReturn(search.get('from'))
  const [projects, setProjects] = useState<ProjectSource[]>([])
  const [dramas, setDramas] = useState<DramaSource[]>([])
  const [series, setSeries] = useState<SeriesOption[]>([])
  const [dramaId, setDramaId] = useState(focusDrama ? String(focusDrama) : '')
  const [dramaPublishOpen, setDramaPublishOpen] = useState(Boolean(focusDrama))
  const [seriesStep, setSeriesStep] = useState<SeriesStep | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stop = false
    Promise.all([
      request<{ projects: ProjectSource[]; dramas: DramaSource[] }>('/printfilm/sources'),
      request<{ items: SeriesOption[] }>('/mine/series?page_size=100'),
    ]).then(([sources, mine]) => {
      if (stop) return
      setProjects(sources.projects)
      setDramas(sources.dramas)
      setSeries(mine.items)
      setDramaId(current => current || (sources.dramas[0] ? String(sources.dramas[0].id) : ''))
    }).catch(err => { if (!stop) setError((err as Error).message) }).finally(() => { if (!stop) setLoading(false) })
    return () => { stop = true }
  }, [])

  const drama = dramas.find(item => String(item.id) === dramaId)
  const focused = useMemo(() => projects.find(item => item.id === focusProject), [projects, focusProject])

  async function publishWork(project: ProjectSource) {
    setBusy(true); setError('')
    try {
      const handoff = await request<Handoff>('/works/from-printfilm', 'POST', {
        project_id: project.id,
        idempotency_key: `kepu-${project.id}-${project.updated_at}`,
      })
      navigate(withReturn(`/marketplace/works/${handoff.work_id}/edit?handoff=${handoff.id}`, origin))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  async function addProject(project: ProjectSource, target: 'new' | number) {
    setBusy(true); setError('')
    try {
      const seriesTarget = target === 'new' ? (await request<SeriesOption>('/series', 'POST', {
        title: project.title || tv('未命名短剧', 'Phim ngắn chưa đặt tên'), category: tv('其他', 'Khác'), sale_type: 'copyright_contact', copyright_price_fen: 0, description: '',
      })).id : target
      const result = await request<{ handoffs: Handoff[] }>(`/series/${seriesTarget}/episodes/import-printfilm`, 'POST', {
        project_id: project.id,
        idempotency_key: `kepu-${project.id}-${project.updated_at}`,
      })
      const handoff = result.handoffs[0]
      navigate(withReturn(`/marketplace/series/${seriesTarget}/edit${handoff ? `?handoff=${handoff.id}` : ''}`, origin))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (loading) return <p role="status">{tv("正在读取已生成的成片…", "Đang đọc phim đã tạo…")}</p>
  const heading = <PageHeading title={tv("发布到数字资产市场", "Đăng lên chợ tài sản số")} description={focusProject ? tv('这部成片可以发布为单视频，或作为一集加入短剧。同步后补充资料并提交审核。', 'Phim này có thể đăng thành video đơn, hoặc thêm vào phim ngắn như một tập. Sau khi đồng bộ bổ sung thông tin và gửi duyệt.') : tv('选择 PrintFilm 已生成的成片，同步到市场后补充资料并提交审核。已签署有效授权函的账号会自动关联，未签署的请在提交前完成一次签署。', 'Chọn phim PrintFilm đã tạo, đồng bộ lên chợ rồi bổ sung thông tin và gửi duyệt. Tài khoản đã ký thư ủy quyền còn hiệu lực sẽ tự động liên kết, chưa ký thì vui lòng ký một lần trước khi gửi.')} back="/marketplace/works/new" backLabel={tv("返回发布作品", "Quay lại đăng tác phẩm")} />
  if (focusProject) return <>
    {heading}
    {error && <p role="alert">{error}</p>}
    <section className="pf-market-form">
      <h2>{focused?.title || tv('当前成片', 'Phim hiện tại')}</h2>
      {focused ? <>
        <p className="pf-market-notice">{tv("先选择发布成一条视频，或作为一集放进短剧。", "Trước tiên chọn đăng thành một video, hoặc đặt vào phim ngắn như một tập.")}</p>
        <div className="pf-market-publish-actions">
          <Button variant="lime" type="button" disabled={busy} onClick={() => void publishWork(focused)}>{tv("发布为单视频", "Đăng thành video đơn")}</Button>
          <button type="button" disabled={busy} onClick={() => setSeriesStep({ id: focused.id, mode: 'pick' })}>{tv("发布为短剧", "Đăng thành phim ngắn")}</button>
        </div>
        {seriesStep?.id === focused.id && <SeriesStepPanel series={series} busy={busy} mode={seriesStep.mode} onCreate={() => void addProject(focused, 'new')} onExisting={() => setSeriesStep({ id: focused.id, mode: 'existing' })} onJoin={id => void addProject(focused, id)} />}
      </> : <p role="status">{tv("这部成片还没有生成完成，暂时不能发布。", "Phim này chưa tạo xong, tạm thời chưa đăng được.")}</p>}
    </section>
  </>
  return <>
    {heading}
    {error && <p role="alert">{error}</p>}
    <section className="pf-market-form">
      <h2>{tv("科普成片", "Phim khoa học")}</h2>
      <p className="pf-market-notice">{tv("每部成片先选择发布为单视频或短剧。选短剧后，再决定新建或加入已有短剧。", "Mỗi phim trước tiên chọn đăng thành video đơn hay phim ngắn. Chọn phim ngắn thì quyết định tạo mới hay thêm vào phim ngắn có sẵn.")}</p>
      {projects.length === 0 ? <p>{tv("还没有可发布的科普成片。", "Chưa có phim khoa học nào có thể đăng.")}</p> : projects.map(project => <article key={project.id} className="pf-market-handoff">
        <strong>{project.title}</strong>
        <div className="pf-market-publish-actions">
          <Button variant="lime" type="button" disabled={busy} onClick={() => void publishWork(project)}>{tv("发布为单视频", "Đăng thành video đơn")}</Button>
          <button type="button" disabled={busy} onClick={() => setSeriesStep({ id: project.id, mode: 'pick' })}>{tv("发布为短剧", "Đăng thành phim ngắn")}</button>
        </div>
        {seriesStep?.id === project.id && <SeriesStepPanel series={series} busy={busy} mode={seriesStep.mode} onCreate={() => void addProject(project, 'new')} onExisting={() => setSeriesStep({ id: project.id, mode: 'existing' })} onJoin={id => void addProject(project, id)} />}
      </article>)}
    </section>
    <section className="pf-market-form">
      <h2>{tv("漫剧分集", "Tập phim truyện")}</h2>
      <p className="pf-market-notice">{tv("只同步勾选的完整分集。完成后，在短剧编辑页补充封面、价格和作品介绍，再提交审核；有效账号授权函会自动关联。", "Chỉ đồng bộ các tập hoàn chỉnh được tích chọn. Xong thì bổ sung ảnh bìa, giá và giới thiệu tác phẩm ở trang chỉnh sửa phim ngắn rồi gửi duyệt; thư ủy quyền tài khoản còn hiệu lực sẽ tự động liên kết.")}</p>
      {dramas.length === 0 ? <p>{tv("还没有可导入的漫剧分集。", "Chưa có tập phim truyện nào có thể nhập.")}</p> : <>
        <label>{tv("漫剧项目", "Dự án phim truyện")}<select value={dramaId} onChange={event => setDramaId(event.target.value)}>{dramas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button type="button" disabled={busy || !drama} onClick={() => setDramaPublishOpen(true)}>{tv("选择完整分集并发布", "Chọn các tập hoàn chỉnh và đăng")}</button>
      </>}
    </section>
    {dramaPublishOpen && drama && <DramaPublishModal projectId={drama.id} initialEpisodeId={focusEpisode || undefined} onClose={() => setDramaPublishOpen(false)} />}
  </>
}
