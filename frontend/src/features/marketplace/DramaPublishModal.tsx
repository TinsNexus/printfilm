import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CheckCircle2, Film, Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { request } from './api'
import { internalReturn, withReturn } from './ui'
import { publishSelection, sourceRelation, type DramaPublishContext, type DramaPublishResult } from './dramaPublishing'
import './dramaPublishing.css'
import { tv } from '../../i18n/tv'

/** HTTP 页面没有 randomUUID，改用随机字节拼一个不少于 8 位的幂等键。 */
function publishKey() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === 'function') return Array.from(crypto.getRandomValues(new Uint32Array(4)), part => part.toString(16).padStart(8, '0')).join('')
  return `pf${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
}

type Props = {
  projectId: number; initialEpisodeId?: number; targetSeriesId?: number; selectReady?: boolean
  onClose: () => void; onPublished?: (result: DramaPublishResult) => void
}

// 漫剧卡片、分集预览和市场编辑页共用同一发布流程，只提交服务端校验过的编号与版本。
export default function DramaPublishModal({ projectId, initialEpisodeId, targetSeriesId, selectReady = false, onClose, onPublished }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [context, setContext] = useState<DramaPublishContext | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [updates, setUpdates] = useState<number[]>([])
  const [targetId, setTargetId] = useState(targetSeriesId ? String(targetSeriesId) : 'new')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const requestKey = useRef({ signature: '', key: '' })
  const submitting = useRef(false)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    request<DramaPublishContext>(`/printfilm/dramas/${projectId}/publish-context`).then(value => {
      if (!active) return
      setContext(value)
      setTitle(current => current || value.project.title)
      setSelected(current => {
        const readyIds = value.episodes.filter(item => item.ready).map(item => item.id)
        if (current.length) return current.filter(id => readyIds.includes(id))
        if (initialEpisodeId && readyIds.includes(initialEpisodeId)) return [initialEpisodeId]
        return selectReady ? readyIds : []
      })
      setUpdates([])
    }).catch(err => { if (active) setError((err as Error).message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, initialEpisodeId, selectReady, reload])
  const target = context?.series.find(item => String(item.id) === targetId)
  const changed = context?.episodes.filter(item => selected.includes(item.id) && sourceRelation(item, target).changed) || []
  const missingUpdates = changed.some(item => !updates.includes(item.id))
  const storageReady = context?.storage_configured === true
  async function publish() {
    if (!context || !storageReady || submitting.current || !selected.length) return
    submitting.current = true; setBusy(true); setError('')
    try {
      if (targetId !== 'new' && !target) throw new Error(tv('目标系列已变化，请刷新后重新选择', 'Series mục tiêu đã thay đổi, vui lòng làm mới rồi chọn lại'))
      const episodes = publishSelection(context, selected, updates, target)
      const payload = { episodes, series_id: target?.id ?? null, ...(target ? { series_version: target.version } : { title: title.trim() || context.project.title }) }
      const signature = JSON.stringify(payload)
      // 网络超时后保留同一个幂等键；只有用户改变发布内容才创建新批次。
      if (requestKey.current.signature !== signature) requestKey.current = { signature, key: publishKey() }
      const result = await request<DramaPublishResult>(`/printfilm/dramas/${projectId}/publish`, 'POST', { ...payload, idempotency_key: requestKey.current.key })
      if (onPublished) onPublished(result)
      else navigate(withReturn(`/marketplace/series/${result.series_id}/edit`, internalReturn(`${location.pathname}${location.search}`)))
      onClose()
    } catch (err) { setError((err as Error).message) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <Modal open title={tv("发布到数字资产市场", "Đăng lên chợ tài sản số")} size="lg" className="pf-drama-publish" onClose={onClose} dismissible={!busy} footer={<>
    <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{tv("取消", "Hủy")}</Button>
    <Button type="button" variant="lime" disabled={loading || busy || !storageReady || !selected.length || missingUpdates || (targetId !== 'new' && !target)} onClick={() => void publish()}>{busy ? <><Loader2 size={16} className="pf-drama-publish-spin" />{tv("正在创建同步任务…", "Đang tạo tác vụ đồng bộ…")}</> : tv('同步并继续编辑', 'Đồng bộ và tiếp tục chỉnh sửa')}</Button>
  </>}>
    <p className="pf-drama-publish-intro">{tv("选中的完整分集会同步到市场独立保存。随后补充封面和价格，确认版权信息后一并提交审核；有效账号授权函会自动关联。", "Các tập hoàn chỉnh đã chọn sẽ được đồng bộ và lưu riêng ở chợ. Sau đó bổ sung ảnh bìa và giá, xác nhận thông tin bản quyền rồi gửi duyệt cùng lúc; thư ủy quyền tài khoản còn hiệu lực sẽ tự động liên kết.")}</p>
    {loading ? <p role="status">{tv("正在检查分集和市场状态…", "Đang kiểm tra các tập và trạng thái chợ…")}</p> : context ? <>
      {!storageReady && <p className="pf-drama-publish-warning" role="alert">{tv("文件服务暂未配置，暂时无法同步视频。请联系管理员完成文件服务配置后重试。", "Dịch vụ tệp chưa được cấu hình, tạm thời không đồng bộ được video. Vui lòng liên hệ quản trị viên hoàn tất cấu hình dịch vụ tệp rồi thử lại.")}</p>}
      <div className="pf-drama-publish-project"><Film size={20} /><div><strong>{context.project.title}</strong><span>{context.episodes.length} {tv("集 · 仅完整生成的分集可发布", "tập · Chỉ các tập đã tạo hoàn chỉnh mới đăng được")}</span></div></div>
      <div className="pf-drama-publish-episodes" aria-label={tv("选择发布分集", "Chọn các tập để đăng")}>{context.episodes.map(episode => {
        const relation = sourceRelation(episode, target)
        return <div key={episode.id} className={`pf-drama-publish-episode${!episode.ready ? ' is-disabled' : ''}`}>
          <label><input type="checkbox" disabled={busy || !episode.ready || !storageReady} checked={selected.includes(episode.id)} onChange={event => { setSelected(value => event.target.checked ? [...value, episode.id] : value.filter(id => id !== episode.id)); setUpdates(value => value.filter(id => id !== episode.id)) }} /><span><strong>{tv("第", "Tập")} {episode.episode_number} {tv("集 ·", "·")} {episode.name}</strong><small>{episode.completed_count}/{episode.fragment_count} {tv("镜已完成", "cảnh đã hoàn tất")}{!episode.ready ? ` · ${episode.reason || tv('成片未就绪', 'Phim chưa sẵn sàng')}` : relation.existing ? relation.changed ? tv(' · 发现新版本', ' · Phát hiện phiên bản mới') : tv(' · 已同步，此版本将直接复用', ' · Đã đồng bộ, phiên bản này sẽ được dùng lại trực tiếp') : ''}</small></span></label>
          {relation.changed && selected.includes(episode.id) && <label className="pf-drama-publish-update"><input type="checkbox" disabled={busy} checked={updates.includes(episode.id)} onChange={event => setUpdates(value => event.target.checked ? [...value, episode.id] : value.filter(id => id !== episode.id))} />{tv("确认更新为新的完整分集", "Xác nhận cập nhật thành tập hoàn chỉnh mới")}</label>}
        </div>
      })}{context.episodes.length === 0 && <p>{tv("这个项目还没有分集。", "Dự án này chưa có tập nào.")}</p>}</div>
      <label className="pf-drama-publish-field">{tv("发布到", "Đăng lên")}<select disabled={busy || Boolean(targetSeriesId)} value={targetId} onChange={event => { setTargetId(event.target.value); setUpdates([]) }}><option value="new">{tv("新建市场短剧", "Tạo phim ngắn mới trên chợ")}</option>{context.series.map(item => <option key={item.id} value={item.id}>{item.title}{item.listed ? tv('（已上架）', '(đã đăng)') : ''}</option>)}</select></label>
      {targetId === 'new' ? <label className="pf-drama-publish-field">{tv("市场短剧名称", "Tên phim ngắn trên chợ")}<input value={title} disabled={busy} maxLength={200} onChange={event => setTitle(event.target.value)} placeholder={context.project.title} /></label> : <p className="pf-drama-publish-hint">{tv("保留已有系列的介绍、封面和收益设置；新分集接续目标系列集号。", "Giữ nguyên giới thiệu, ảnh bìa và cài đặt doanh thu của series đã có; tập mới nối tiếp số tập của series mục tiêu.")}</p>}
      {(changed.length > 0 || (target && (target.listed || target.audit_status === 'approved' || target.audit_status === 'pending'))) && <p className="pf-drama-publish-warning">{tv("同步更新或追加分集后，系列将退回草稿并暂停公开销售，需要重新提交审核。历史买家仍可播放已购买版本。", "Sau khi đồng bộ cập nhật hoặc thêm tập, series sẽ quay về bản nháp và tạm ngừng bán công khai, cần gửi duyệt lại. Người mua cũ vẫn phát được phiên bản đã mua.")}</p>}
      <p className="pf-drama-publish-hint"><CheckCircle2 size={15} />{context.authorization_ready ? tv('当前授权函有效，同步后自动关联，无需逐集签署。', 'Thư ủy quyền hiện tại còn hiệu lực, sau đồng bộ tự động liên kết, không cần ký từng tập.') : tv('可先同步并保存草稿，提交系列审核前统一签署一次 PrintFilm 授权函。', 'Có thể đồng bộ và lưu bản nháp trước, thống nhất ký một lần thư ủy quyền PrintFilm trước khi gửi duyệt series.')}</p>
    </> : null}
    {error && <div className="pf-drama-publish-error" role="alert"><p>{error}</p><button type="button" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>{tv("刷新分集状态", "Làm mới trạng thái các tập")}</button></div>}
  </Modal>
}
