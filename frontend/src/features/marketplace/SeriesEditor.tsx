import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import AssetPicker from './AssetPicker'
import { request, type Handoff } from './api'
import { FormSection, PageHeading, PublishGuide } from './ui'
import Button from '../../components/ui/Button'
import { useCategories } from './useCategories'
import { dialog } from '../../lib/dialog'
import AuthorizationPanel from './AuthorizationPanel'
import DramaPublishModal from './DramaPublishModal'
import { handoffLabel, isHandoffActive, latestEpisodeHandoffs, mergeSyncedCover, mergeSyncedEpisodes } from './dramaPublishing'
import { isFreeEpisode, previewStatusLabel } from './playbackPolicy'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'

type EpisodeDraft = { id?: number; version?: number; episode_no: number; title: string; description?: string; asset_id: number | null; cover_asset_id: number | null; copyright_price_fen: number; unlock_price_fen: number; share_bps?: number | null; source?: 'printfilm' | 'external' | 'original' | 'ai' | 'authorized'; preview_status?: string; preview_error?: string }
type SeriesDraft = { id: number; version: number; title: string; description: string; category: string; tags: string[]; cover_asset_id?: number | null; sale_type: 'free' | 'copyright_contact' | 'platform_unlock'; copyright_price_fen: number; free_episode_count?: number; audit_status?: string; listed?: boolean; episodes: EpisodeDraft[]; authorization_ready?: boolean; sync_in_progress?: boolean; pending_handoffs?: Handoff[] }
type ImportSource = { id: number; title: string; episodes: { id: number; name: string; ready: boolean }[] }

function EpisodePanel({ episode, count, free, open, saleType, seriesId, busy, videoLabel, videoLocked, lockVideoUntilPreview, toggle, update, remove, goRights }: {
  episode: EpisodeDraft; count: number; free: boolean; open: boolean; saleType: SeriesDraft['sale_type']; seriesId?: string; busy: boolean; videoLabel: string; videoLocked: boolean; lockVideoUntilPreview: boolean
  toggle: () => void; update: (patch: Partial<EpisodeDraft>) => void; remove: () => void; goRights: () => void
}) {
  return <article className={`pf-episode-fold${open ? ' is-open' : ''}`}>
    <button type="button" className="pf-episode-fold-head" aria-expanded={open} onClick={toggle}>
      <span>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{tv("第", "Tập")} {episode.episode_no} {tv("集 ·", "·")} {episode.title || tv('未命名', 'Chưa đặt tên')}</span>
      <em>{free ? tv('免费', 'Miễn phí') : tv('收费', 'Thu phí')} · {videoLabel}</em>
    </button>
    {open && <div className="pf-episode-fold-body">
      <p role="status">{tv("试看：", "Xem thử:")}{previewStatusLabel(episode.preview_status, free)}</p>
      {!free && episode.preview_error && <p role="alert">{explainMarketplaceError(episode.preview_error)}</p>}
      <label>{tv("集标题", "Tiêu đề tập")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><input required value={episode.title} onChange={event => update({ title: event.target.value })} /></label>
      <label>{tv("分集简介", "Giới thiệu tập")}<textarea value={episode.description || ''} maxLength={5000} onChange={event => update({ description: event.target.value })} placeholder={tv("介绍这一集的内容", "Giới thiệu nội dung của tập này")} /></label>
      <label>{tv("内容来源", "Nguồn nội dung")}<select disabled={videoLocked} value={episode.source || 'external'} onChange={event => update({ source: event.target.value as EpisodeDraft['source'] })}><option value="printfilm">{tv("PrintFilm 生成", "Do PrintFilm tạo")}</option><option value="external">{tv("其他平台生成", "Do nền tảng khác tạo")}</option></select></label>
      <AssetPicker kind="video" value={episode.asset_id} onChange={asset_id => update({ asset_id })} title={tv("分集视频", "Video tập")} required locked={videoLocked} lockUntilPreview={lockVideoUntilPreview} />
      <AssetPicker kind="image" required value={episode.cover_asset_id} onChange={cover_asset_id => update({ cover_asset_id })} title={tv("分集封面（可使用系列封面）", "Ảnh bìa tập (có thể dùng ảnh bìa series)")} />
      {saleType !== 'free' && <label>{tv("本集参考价（元）", "Giá tham khảo của tập này (tệ)")}<input type="number" min="0" step="0.01" value={(episode.copyright_price_fen / 100) || ''} onChange={event => update({ copyright_price_fen: Math.round(Number(event.target.value || 0) * 100) })} /></label>}
      {episode.source === 'printfilm' ? <p className="pf-market-notice">{tv("PrintFilm 生成：本系列统一引用账号授权函，无需逐集签署或上传证书。", "Do PrintFilm tạo: series này dùng chung thư ủy quyền tài khoản, không cần ký từng tập hay tải chứng chỉ.")}</p> : episode.asset_id && (seriesId ? <button type="button" disabled={busy} onClick={goRights}>{tv("填写第", "Điền tài liệu quyền sở hữu tập")} {episode.episode_no} {tv("集权属材料", "")}</button> : <p>{tv("请先保存草稿，再填写这一集的权属材料。保存后会回到这个页面。", "Vui lòng lưu bản nháp trước, rồi điền tài liệu quyền sở hữu của tập này. Sau khi lưu sẽ quay lại trang này.")}</p>)}
      {saleType === 'platform_unlock' && <><label>{tv("本集观众解锁价（元）", "Giá mở khóa cho khán giả của tập này (tệ)")}<input type="number" min="0.01" step="0.01" value={(episode.unlock_price_fen / 100) || ''} onChange={event => update({ unlock_price_fen: Math.round(Number(event.target.value || 0) * 100) })} /></label><label>{tv("本集平台抽成比例（万分比，可留空使用平台默认）", "Tỷ lệ chiết khấu nền tảng của tập này (phần vạn, có thể để trống để dùng mặc định của nền tảng)")}<input type="number" min="0" max="10000" step="1" value={episode.share_bps ?? ''} onChange={event => update({ share_bps: event.target.value === '' ? null : Number(event.target.value) })} placeholder={tv("例如 2000，表示平台20%、创作者80%", "Ví dụ 2000, nghĩa là nền tảng 20%, nhà sáng tạo 80%")} /><small>{tv("10000 表示 100%；本集未设置时使用平台默认比例。", "10000 nghĩa là 100%; tập này chưa đặt thì dùng tỷ lệ mặc định của nền tảng.")}</small></label></>}
      {count > 1 && <button type="button" disabled={busy} onClick={remove}>{tv("删除本集", "Xóa tập này")}</button>}
    </div>}
  </article>
}

export default function SeriesEditor() {
  const { id } = useParams(); const navigate = useNavigate()
  const { names: categories, error: categoryError } = useCategories()
  const [series, setSeries] = useState<SeriesDraft | null>(null)
  const [saleType, setSaleType] = useState<'free' | 'copyright_contact' | 'platform_unlock'>('copyright_contact')
  const [freeEpisodeCount, setFreeEpisodeCount] = useState(0)
  const [category, setCategory] = useState('')
  const [coverId, setCoverId] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeDraft[]>([])
  const [removedEpisodeIds, setRemovedEpisodeIds] = useState<number[]>([])
  const [sources, setSources] = useState<ImportSource[]>([]); const [sourceId, setSourceId] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [handoffsLoaded, setHandoffsLoaded] = useState(!id)
  const [handoffError, setHandoffError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [previewPollError, setPreviewPollError] = useState('')
  const savedEpisodes = useRef<EpisodeDraft[]>([])
  const savedCoverId = useRef<number | null>(null)
  const coverEdited = useRef(false)
  const [poll, setPoll] = useState(0)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  const episodeHandoffs = latestEpisodeHandoffs(handoffs)
  const hasSyncFailure = episodeHandoffs.some(item => item.status === 'failed')
  const syncing = Boolean(series?.sync_in_progress) || episodeHandoffs.some(isHandoffActive)
  const syncBlocked = syncing || Boolean(id && !handoffsLoaded)
  const previewActive = Boolean(series?.episodes.some(episode => !isFreeEpisode(series, episode.episode_no) && (episode.preview_status === 'pending' || episode.preview_status === 'running')))
  const previewFailed = Boolean(series?.episodes.some(episode => !isFreeEpisode(series, episode.episode_no) && episode.preview_status === 'failed'))
  function acceptSaved(value: SeriesDraft) {
    setSeries(value); setSaleType(value.sale_type); setFreeEpisodeCount(value.free_episode_count || 0); setCategory(value.category || tv('其他', 'Khác')); setCoverId(value.cover_asset_id ?? null)
    savedCoverId.current = value.cover_asset_id ?? null; coverEdited.current = false
    const normalized = value.episodes.map(item => ({ ...item, asset_id: item.asset_id ?? null, cover_asset_id: item.cover_asset_id ?? null }))
    setEpisodes(normalized); savedEpisodes.current = normalized; setRemovedEpisodeIds([]); setDirty(false)
    if (value.pending_handoffs) setHandoffs(current => [...value.pending_handoffs!, ...current.filter(item => !value.pending_handoffs!.some(pending => pending.id === item.id))])
  }
  // 同步封面以已加载的远端值为基线，避免保存草稿时把后台刚回填的封面清空。
  function acceptSyncedCover(value: SeriesDraft) {
    const previous = savedCoverId.current, remote = value.cover_asset_id ?? null, edited = coverEdited.current
    setCoverId(current => mergeSyncedCover(current, remote, previous, edited))
    savedCoverId.current = remote
  }
  useEffect(() => {
    if (!id) { setEpisodes([{ episode_no: 1, title: tv('第1集', 'Tập 1'), asset_id: null, cover_asset_id: null, copyright_price_fen: 0, unlock_price_fen: 0 }]); return }
    let active = true
    setHandoffsLoaded(false)
    request<SeriesDraft>(`/series/${id}`).then(value => { if (active) acceptSaved(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [id])
  useEffect(() => { if (id) request<{ items: ImportSource[] }>('/series/import-sources').then(value => setSources(value.items)).catch(() => {}) }, [id])
  useEffect(() => {
    if (!id || (series?.audit_status !== 'processing' && !previewActive)) return
    let active = true
    const timer = window.setInterval(() => {
      request<SeriesDraft>(`/series/${id}`).then(fresh => {
        if (!active) return
        setPreviewPollError('')
        setSeries(current => current ? { ...current, audit_status: fresh.audit_status, listed: fresh.listed, episodes: fresh.episodes } : fresh)
        setEpisodes(current => current.map(episode => {
          const remote = fresh.episodes.find(item => item.id === episode.id && item.version === episode.version && item.asset_id === episode.asset_id)
          return remote ? { ...episode, preview_status: remote.preview_status, preview_error: remote.preview_error } : episode
        }))
      }).catch(() => { if (active) setPreviewPollError(tv('短试看进度暂时无法读取，正在重试。当前填写内容会保留。', 'Tạm thời không đọc được tiến độ xem thử ngắn, đang thử lại. Nội dung đang nhập sẽ được giữ.')) })
    }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [id, series?.audit_status, previewActive])
  useEffect(() => {
    if (!id) return
    let stop = false
    let timer = 0
    async function tick() {
      try {
        const value = await request<{ items: Handoff[] }>(`/handoffs?series_id=${id}`)
        if (stop) return
        const items = value.items
        let activeSync = latestEpisodeHandoffs(items).some(isHandoffActive)
        setHandoffs(items)
        setHandoffsLoaded(true); setHandoffError('')
        if (items.length) {
          const fresh = await request<SeriesDraft>(`/series/${id}`)
          if (stop) return
          activeSync = activeSync || Boolean(fresh.sync_in_progress)
          if (fresh.pending_handoffs?.length) setHandoffs([...fresh.pending_handoffs, ...items.filter(item => !fresh.pending_handoffs!.some(pending => pending.id === item.id))])
          const previous = savedEpisodes.current
          setEpisodes(current => mergeSyncedEpisodes(current, fresh.episodes, previous))
          savedEpisodes.current = fresh.episodes
          acceptSyncedCover(fresh)
          // Worker 也会推进父系列版本和封面；表单仍保留用户正在填写的内容。
          setSeries(current => current ? { ...current, cover_asset_id: fresh.cover_asset_id, version: fresh.version, audit_status: fresh.audit_status, listed: fresh.listed, authorization_ready: fresh.authorization_ready, sync_in_progress: fresh.sync_in_progress } : fresh)
        }
        if (activeSync) timer = window.setTimeout(() => setPoll(value => value + 1), 3000)
      } catch { if (!stop) { setHandoffError(tv('同步进度暂时无法读取，正在重试。当前填写的内容已保留。', 'Tạm thời không đọc được tiến độ đồng bộ, đang thử lại. Nội dung đang nhập đã được giữ.')); timer = window.setTimeout(() => setPoll(value => value + 1), 5000) } }
    }
    void tick()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [id, poll])
  const syncingEpisodes = episodeHandoffs.filter(isHandoffActive).map(item => item.episode_id).join(',')
  const episodeIdList = episodes.map(item => item.id ?? 0).join(',')
  useEffect(() => {
    if (!syncingEpisodes) return
    const syncing = new Set(syncingEpisodes.split(',').map(Number))
    const indexes = episodeIdList.split(',').flatMap((value, index) => syncing.has(Number(value)) ? [index] : [])
    if (indexes.length) setExpanded(new Set(indexes))
  }, [syncingEpisodes, episodeIdList])
  useEffect(() => { if (!id && !category && categories.length) setCategory(categories.includes('其他') ? tv('其他', 'Khác') : categories[0]) }, [id, category, categories])
  function update(index: number, patch: Partial<EpisodeDraft>) { setDirty(true); setEpisodes(value => value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)) }
  function episodeBody(episode: EpisodeDraft) {
    return { episode_no: episode.episode_no, title: episode.title, description: episode.description || '', asset_id: episode.asset_id, cover_asset_id: episode.cover_asset_id, copyright_price_fen: episode.copyright_price_fen || 0, unlock_price_fen: episode.unlock_price_fen || 0, share_bps: episode.share_bps ?? null, source: episode.source || 'external' }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); if (syncBlocked || hasSyncFailure) { setBusy(false); setError(tv('请等待同步完成或重试失败任务后再保存，当前输入会保留', 'Vui lòng chờ đồng bộ xong hoặc thử lại tác vụ thất bại rồi mới lưu, nội dung đang nhập sẽ được giữ')); return } const missing = episodes.findIndex(item => !item.title.trim()); if (missing >= 0) { setExpanded(new Set([missing])); setBusy(false); setError(tv(`第 ${missing + 1} 集标题未填写`, `Chưa nhập tiêu đề tập ${missing + 1}`)); return } const form = new FormData(event.currentTarget)
    try {
      const payload = { title: form.get('title'), description: form.get('description'), category: category || tv('其他', 'Khác'), tags: String(form.get('tags') || '').split(/[,，]/).map(value => value.trim()).filter(Boolean), sale_type: saleType, copyright_price_fen: Math.round(Number(form.get('copyright_price') || 0) * 100), free_episode_count: freeEpisodeCount, cover_asset_id: coverId, ...(id ? { version: series?.version } : {}) }
      const saved = await request<SeriesDraft>(id ? `/series/${id}` : '/series', id ? 'PATCH' : 'POST', payload)
      if (!id) for (const episode of episodes) await request(`/series/${saved.id}/episodes`, 'POST', episodeBody(episode))
      else {
        // 先删除再改编号，避免同一系列的集数唯一约束冲突。只提交可编辑字段。
        for (const episodeId of removedEpisodeIds) await request(`/series/${id}/episodes/${episodeId}`, 'DELETE')
        for (const episode of episodes) {
          if (episode.id) await request(`/series/${id}/episodes/${episode.id}`, 'PATCH', { ...episodeBody(episode), version: saved.episodes.find(remote => remote.id === episode.id)?.version ?? episode.version })
          else await request(`/series/${id}/episodes`, 'POST', episodeBody(episode))
        }
      }
      if (!id) navigate(`/marketplace/series/${saved.id}/edit`)
      else { acceptSaved(await request<SeriesDraft>(`/series/${saved.id}`)); setMessage(tv('系列草稿已保存。', 'Đã lưu bản nháp series.')) }
    } catch (err) {
      setError((err as Error).message)
      // 分集逐条保存失败时，刷新已推进的版本，但保留未保存输入供用户重试。
      if (id) try {
        const fresh = await request<SeriesDraft>(`/series/${id}`)
        setSeries(current => current ? { ...current, version: fresh.version, audit_status: fresh.audit_status, listed: fresh.listed } : fresh)
        setEpisodes(current => current.map(episode => ({ ...episode, version: fresh.episodes.find(remote => remote.id === episode.id)?.version ?? episode.version })))
      } catch { /* 保留原始保存错误 */ }
    } finally { setBusy(false) }
  }
  async function retryHandoff(handoff: Handoff) {
    setBusy(true); setError('')
    try {
      const next = await request<Handoff>(`/handoffs/${handoff.id}/retry`, 'POST')
      setHandoffs(value => value.map(row => row.id === next.id ? next : row)); setPoll(value => value + 1)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function submit() {
    if (!id || !series) return
    if (syncBlocked || dirty || episodeHandoffs.some(item => item.status === 'failed')) { setError(tv('请等待同步完成、处理失败任务并保存修改后，再提交审核', 'Vui lòng chờ đồng bộ xong, xử lý tác vụ thất bại và lưu thay đổi rồi mới gửi duyệt')); return }
    setBusy(true); setError('')
    try { const updated = await request<SeriesDraft>(`/series/${id}/submit`, 'POST', { version: series.version }); acceptSaved(updated); setMessage(updated.audit_status === 'processing' ? tv('正在准备短试看，完成后自动进入待审核。', 'Đang chuẩn bị bản xem thử ngắn, xong sẽ tự động vào trạng thái chờ duyệt.') : tv('短剧与版权材料已提交，等待管理员统一审核。', 'Phim ngắn và tài liệu bản quyền đã được gửi, chờ quản trị viên duyệt thống nhất.')) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function removeSeries() {
    if (!id) return
    const ok = await dialog.confirm({ title: tv('删除短剧', 'Xóa phim ngắn'), message: tv('删除后整部短剧会从我的作品和作品广场撤下。分集和审核记录会保留，但不能再展示。', 'Sau khi xóa, cả phim ngắn sẽ bị gỡ khỏi tác phẩm của tôi và quảng trường tác phẩm. Các tập và bản ghi duyệt được giữ lại nhưng không thể hiển thị nữa.'), confirmText: tv('删除', 'Xóa'), tone: 'danger' })
    if (!ok) return
    setBusy(true); setError('')
    try { await request(`/series/${id}`, 'DELETE'); navigate('/marketplace/mine') } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function retryPreviews() {
    if (!id || !series || busy || dirty || previewActive) return
    setBusy(true); setError(''); setMessage('')
    try {
      acceptSaved(await request<SeriesDraft>(`/series/${id}/preview/retry`, 'POST', { version: series.version }))
      setMessage(tv('已重新排队生成短试看，可在各分集查看处理进度。', 'Đã xếp hàng lại để tạo bản xem thử ngắn, có thể xem tiến độ xử lý ở từng tập.'))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function toggleListing() {
    if (!id || !series || series.audit_status !== 'approved') return
    setBusy(true); setError('')
    try {
      const updated = await request<SeriesDraft>(`/series/${id}/listing?listed=${!series.listed}`, 'POST', { version: series.version })
      setSeries(updated); setEpisodes(updated.episodes); setMessage(updated.listed ? tv('系列已上架到作品广场。', 'Series đã được đăng lên quảng trường tác phẩm.') : tv('系列已下架，历史审核记录仍保留。', 'Series đã được gỡ xuống, bản ghi duyệt lịch sử vẫn được giữ.'))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const current = series
  if (id && !series && !error) return <p role="status">{tv("正在加载系列…", "Đang tải series…")}</p>
  return <><PageHeading title={id ? tv('编辑短剧', 'Chỉnh sửa phim ngắn') : tv('发布短剧', 'Đăng phim ngắn')} description={tv("短剧和单条视频一样出现在作品广场。在这一页添加分集，版权规则与单视频相同。", "Phim ngắn cũng xuất hiện ở quảng trường tác phẩm như video đơn. Thêm tập ở trang này, quy tắc bản quyền giống video đơn.")} back="/marketplace" /><div className="pf-market-editor-layout"><form className="pf-market-editor-main pf-market-form" onSubmit={save} onChangeCapture={event => { if (!(event.target as HTMLElement).closest('.pf-market-authorization, [data-market-transient]')) setDirty(true) }}>
    <FormSection step="01" title={tv("系列信息", "Thông tin series")} description={tv("先建立系列，再逐集上传或导入成片。", "Trước tiên tạo series, rồi lần lượt tải lên hoặc nhập phim cho từng tập.")}><label>{tv("系列标题", "Tiêu đề series")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><input name="title" required maxLength={200} placeholder={tv("例如：城市里的光", "Ví dụ: Ánh sáng trong thành phố")} defaultValue={current?.title} /></label><label>{tv("简介", "Giới thiệu")}<textarea name="description" maxLength={5000} defaultValue={current?.description} placeholder={tv("介绍整部短剧的主题和内容", "Giới thiệu chủ đề và nội dung của cả phim ngắn")} /></label><div className="pf-market-field-row"><label>{tv("分类", "Danh mục")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><select name="category" required value={category || current?.category || ''} onChange={event => setCategory(event.target.value)} disabled={!categories.length}><option value="" disabled>{tv("请选择系列分类", "Vui lòng chọn danh mục series")}</option>{current?.category && !categories.includes(current.category) && <option value={current.category}>{current.category}{tv("（历史分类）", "(danh mục lịch sử)")}</option>}{categories.map(name => <option key={name} value={name}>{name}</option>)}</select>{categoryError && <span role="alert">{categoryError}</span>}</label><label>{tv("标签", "Nhãn")}<input name="tags" defaultValue={current?.tags?.join('，')} placeholder={tv("都市，短剧", "Đô thị, phim ngắn")} /></label></div><AssetPicker kind="image" value={coverId} onChange={value => { coverEdited.current = true; setCoverId(value); setDirty(true) }} title={tv("系列封面（与分集封面至少上传一处）", "Ảnh bìa series (tải lên ít nhất một nơi, series hoặc tập)")} /></FormSection>
    <FormSection step="02" title={tv("收益方式", "Cách chia doanh thu")} description={tv("免费公开供完整观看；版权出售通过客服洽谈；平台投放按集解锁并分成。", "Công khai miễn phí để xem trọn vẹn; bán bản quyền thương lượng qua CSKH; quảng bá nền tảng mở khóa theo tập và chia sẻ doanh thu.")}><select value={saleType} onChange={event => setSaleType(event.target.value as typeof saleType)}><option value="free">{tv("免费公开", "Công khai miễn phí")}</option><option value="copyright_contact">{tv("版权出售收益", "Doanh thu bán bản quyền")}</option><option value="platform_unlock">{tv("平台投放收益", "Doanh thu quảng bá nền tảng")}</option></select><label>{tv("参考价（元）", "Giá tham khảo (tệ)")}<input name="copyright_price" type="number" min="0" step="0.01" defaultValue={current?.copyright_price_fen ? current.copyright_price_fen / 100 : ''} /></label><label>{tv("免费集数", "Số tập miễn phí")}<span className="pf-req-mark">{tv("前几集免费", "Mấy tập đầu miễn phí")}</span><input type="number" min="0" max="10000" step="1" value={freeEpisodeCount} onChange={event => setFreeEpisodeCount(Math.max(0, Number(event.target.value) || 0))} /></label><p className="pf-market-notice">{tv("选择“免费公开”时全部分集播放原片，无需试看；其他收益方式可将前几集设为免费，其余分集提供最长15秒且不超过原片30%的无水印短试看。版权合作参考价不代表已包含版权转让手续等额外费用，具体事项请与客服确认。平台投放按集定价，观众解锁仅获得永久在线播放权益，不包含版权转让；需在平台启用分成后才能提交审核。修改收益方式或免费集数后，将重新检查播放准备状态。", "Khi chọn “Công khai miễn phí”, tất cả các tập phát bản gốc, không cần xem thử; các cách chia doanh thu khác có thể đặt mấy tập đầu miễn phí, các tập còn lại cung cấp bản xem thử ngắn không watermark dài tối đa 15 giây và không quá 30% bản gốc. Giá tham khảo hợp tác bản quyền không bao gồm các chi phí phát sinh như thủ tục chuyển nhượng bản quyền, vui lòng xác nhận cụ thể với CSKH. Quảng bá nền tảng định giá theo tập, khán giả mở khóa chỉ nhận quyền phát trực tuyến vĩnh viễn, không bao gồm chuyển nhượng bản quyền; cần nền tảng bật chia sẻ doanh thu mới gửi duyệt được. Sau khi sửa cách chia doanh thu hoặc số tập miễn phí sẽ kiểm tra lại trạng thái sẵn sàng phát.")}</p></FormSection>
    <FormSection step="03" title={tv("分集内容", "Nội dung các tập")} description={tv("每集一个完整视频和封面。同步期间可以填写信息，完成后再保存。", "Mỗi tập một video hoàn chỉnh và một ảnh bìa. Trong lúc đồng bộ vẫn có thể điền thông tin, xong rồi mới lưu.")}>
      <div className="pf-episode-tools"><button type="button" onClick={() => setExpanded(new Set(episodes.map((_, index) => index)))}>{tv("展开全部", "Mở rộng tất cả")}</button><button type="button" onClick={() => setExpanded(new Set())}>{tv("收起全部", "Thu gọn tất cả")}</button><span>{tv("共", "Tổng")} {episodes.length} {tv("集", "tập")}</span></div>
      {syncBlocked && <p className="pf-market-notice" role="status">{syncing ? tv('成片正在后台同步，可先填写标题与价格。同步完成后即可保存和提交；关闭页面不影响任务。', 'Phim đang đồng bộ ở nền, có thể điền tiêu đề và giá trước. Đồng bộ xong là lưu và gửi được; đóng trang không ảnh hưởng tác vụ.') : tv('正在确认同步状态…', 'Đang xác nhận trạng thái đồng bộ…')}</p>}
      {hasSyncFailure && <p className="pf-market-notice" role="alert">{tv("部分成片同步失败。当前输入已保留，请先重试同步或重新选择源版本，完成后再保存。", "Một số phim đồng bộ thất bại. Nội dung đang nhập đã được giữ, vui lòng thử lại đồng bộ hoặc chọn lại phiên bản nguồn, xong rồi mới lưu.")}</p>}
      {handoffError && <p role="alert">{handoffError}</p>}
      <div className="pf-market-episodes">{episodes.map((episode, index) => {
        const handoff = episodeHandoffs.find(item => item.episode_id === episode.id)
        const syncingVideo = Boolean(handoff && isHandoffActive(handoff))
        const fromPrintfilm = episode.source === 'printfilm'
        const videoLabel = handoff ? handoffLabel(handoff) : episode.asset_id ? tv('视频已就绪', 'Video đã sẵn sàng') : tv('缺视频', 'Thiếu video')
        return <div key={episode.id ?? `new-${index}`}>
          <EpisodePanel episode={episode} count={episodes.length} free={isFreeEpisode({ sale_type: saleType, free_episode_count: freeEpisodeCount }, episode.episode_no)} open={expanded.has(index)} saleType={saleType} seriesId={id} busy={busy || syncBlocked || hasSyncFailure} videoLabel={videoLabel} videoLocked={syncingVideo || (fromPrintfilm && !episode.asset_id)} lockVideoUntilPreview={fromPrintfilm}
            toggle={() => setExpanded(value => { const next = new Set(value); if (next.has(index)) next.delete(index); else next.add(index); return next })}
            update={patch => update(index, patch)}
            remove={() => { setDirty(true); if (episode.id) setRemovedEpisodeIds(value => [...value, episode.id as number]); setEpisodes(value => value.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, episode_no: itemIndex + 1 }))); setExpanded(new Set([Math.max(0, index - 1)])) }}
            goRights={() => { if (dirty) { setError(tv('请先保存草稿，再填写外部作品的权属材料', 'Vui lòng lưu bản nháp trước, rồi điền tài liệu quyền sở hữu của tác phẩm bên ngoài')); return } navigate(`/marketplace/assets/${episode.asset_id}/rights?source=${episode.source || 'external'}&return=${encodeURIComponent(`/marketplace/series/${id}/edit`)}`) }} />
          {handoff && handoff.status !== 'ready' && <p className="pf-market-notice" role={handoff.status === 'failed' ? 'alert' : 'status'}>{tv("第", "Tập")} {episode.episode_no} {tv("集 ·", "·")} {handoffLabel(handoff)}{handoff.error ? `：${explainMarketplaceError(handoff.error)}` : ''}
            {handoff.status === 'failed' && handoff.retryable !== false && <button type="button" disabled={busy} onClick={() => void retryHandoff(handoff)}>{tv("重新同步", "Đồng bộ lại")}</button>}
            {handoff.status === 'failed' && handoff.retryable === false && <span>{tv("请在下方重新选择漫剧分集，确认最新源版本后同步。", "Vui lòng chọn lại tập phim truyện bên dưới, xác nhận phiên bản nguồn mới nhất rồi đồng bộ.")}</span>}
          </p>}
        </div>
      })}</div>
      <button type="button" disabled={busy || syncBlocked || hasSyncFailure} onClick={() => { setDirty(true); setEpisodes(value => [...value, { episode_no: value.length + 1, title: tv(`第${value.length + 1}集`, `Tập ${value.length + 1}`), asset_id: null, cover_asset_id: null, copyright_price_fen: 0, unlock_price_fen: 0, source: 'external' }]); setExpanded(new Set([episodes.length])) }}>{tv("+ 添加下一集", "+ Thêm tập tiếp theo")}</button>
    </FormSection>
    {id && <FormSection step="04" title={tv("从我的 PrintFilm 漫剧导入", "Nhập từ phim truyện PrintFilm của tôi")} description={tv("选择项目后，在同一个发布弹窗里选择完整分集；新源版本必须明确确认后才能更新。", "Sau khi chọn dự án, chọn các tập hoàn chỉnh trong cùng một cửa sổ đăng; phiên bản nguồn mới phải được xác nhận rõ ràng mới cập nhật được.")}>
      <select data-market-transient value={sourceId} disabled={busy || syncBlocked} onChange={event => setSourceId(event.target.value)}><option value="">{tv("选择漫剧项目", "Chọn dự án phim truyện")}</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select>
      <button type="button" disabled={busy || syncBlocked || !sourceId || (dirty && !hasSyncFailure)} onClick={() => setImportOpen(true)}>{tv("选择分集并同步到此系列", "Chọn tập và đồng bộ vào series này")}</button>
      {dirty && !hasSyncFailure && <p className="pf-market-notice">{tv("请先保存当前修改，再导入分集。", "Vui lòng lưu các thay đổi hiện tại trước, rồi nhập tập.")}</p>}
    </FormSection>}
    {episodes.some(item => item.source === 'printfilm') && <FormSection step="05" title={tv("PrintFilm 授权确认", "Xác nhận ủy quyền PrintFilm")} description={tv("同一账号按当前条款签署一次，提交系列审核时自动关联全部 PrintFilm 分集。", "Cùng một tài khoản ký một lần theo điều khoản hiện hành, khi gửi duyệt series sẽ tự động liên kết toàn bộ các tập PrintFilm.")}>
      <AuthorizationPanel onSigned={() => { setSeries(value => value ? { ...value, authorization_ready: true } : value); setMessage(tv('授权函已签署，提交审核时将自动关联本系列的 PrintFilm 分集。', 'Đã ký thư ủy quyền, khi gửi duyệt sẽ tự động liên kết các tập PrintFilm của series này.')) }} />
    </FormSection>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {previewPollError && (series?.audit_status === 'processing' || previewActive) && <p role="status">{previewPollError}</p>}
    <div className="pf-market-form-actions">
      <Button variant="lime" type="submit" disabled={busy || syncBlocked || hasSyncFailure || !categories.length || !category}>{busy ? tv('处理中…', 'Đang xử lý…') : tv('保存系列草稿', 'Lưu bản nháp series')}</Button>
      {id && (series?.audit_status === 'draft' || series?.audit_status === 'rejected' || series?.audit_status === 'preview_failed') && <button type="button" disabled={busy || syncBlocked || dirty || episodeHandoffs.some(item => item.status === 'failed') || (episodes.some(item => item.source === 'printfilm') && series.authorization_ready === false)} onClick={() => void submit()}>{series?.audit_status === 'preview_failed' ? tv('重试生成短试看并提交', 'Thử lại tạo bản xem thử ngắn và gửi') : tv('提交系列审核', 'Gửi duyệt series')}</button>}
      {id && dirty && <p role="status">{tv("有未保存修改，请先保存草稿再提交审核。", "Có thay đổi chưa lưu, vui lòng lưu bản nháp trước rồi gửi duyệt.")}</p>}
      {id && series?.audit_status === 'processing' && <p role="status">{tv("正在生成短试看，完成后自动进入待审核。", "Đang tạo bản xem thử ngắn, xong sẽ tự động vào trạng thái chờ duyệt.")}</p>}
      {id && series?.audit_status === 'approved' && <button type="button" disabled={busy || syncBlocked || dirty} onClick={() => void toggleListing()}>{series.listed ? tv('下架系列', 'Gỡ series') : tv('上架到作品广场', 'Đăng lên quảng trường tác phẩm')}</button>}
      {id && series?.audit_status === 'approved' && (previewFailed || previewActive) && <button type="button" disabled={busy || syncBlocked || dirty || previewActive} onClick={() => void retryPreviews()}>{previewActive ? tv('正在生成短试看…', 'Đang tạo bản xem thử ngắn…') : tv('重试生成短试看', 'Thử lại tạo bản xem thử ngắn')}</button>}
      {id && <button type="button" disabled={busy || syncBlocked} onClick={() => void removeSeries()}>{tv("删除短剧", "Xóa phim ngắn")}</button>}
    </div>
  </form><PublishGuide saleType={saleType} /></div>
  {importOpen && id && sourceId && <DramaPublishModal projectId={Number(sourceId)} targetSeriesId={Number(id)} onClose={() => setImportOpen(false)} onPublished={() => {
    setBusy(true)
    request<SeriesDraft>(`/series/${id}`).then(fresh => {
      const previous = savedEpisodes.current
      setEpisodes(current => [...mergeSyncedEpisodes(current, fresh.episodes, previous), ...fresh.episodes.filter(item => !current.some(local => local.id === item.id))])
      savedEpisodes.current = fresh.episodes
      acceptSyncedCover(fresh)
      setSeries(current => current ? { ...current, cover_asset_id: fresh.cover_asset_id, version: fresh.version, audit_status: fresh.audit_status, listed: fresh.listed, authorization_ready: fresh.authorization_ready, sync_in_progress: fresh.sync_in_progress } : fresh)
      setPoll(value => value + 1); setExpanded(new Set(fresh.episodes.map((_, index) => index))); setMessage(tv('同步任务已创建，完成后会自动填入完整视频。当前填写的内容已保留。', 'Đã tạo tác vụ đồng bộ, xong sẽ tự động điền video hoàn chỉnh. Nội dung đang nhập đã được giữ.'))
    }).catch(err => setError((err as Error).message)).finally(() => setBusy(false))
  }} />}
  </>
}
