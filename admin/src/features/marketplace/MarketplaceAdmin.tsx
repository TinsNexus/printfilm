import CategoryForm from './CategoryForm'
import { useEffect, useState, type FormEvent } from 'react'
import { request, assetFile, assetUrl, letterFile, useMarketplaceStatus, type Item, type Listing } from './api'
import { fieldStatusLabel, recordDetailsTitle, recordStatus, statusLabel, statusOptions } from './presentation'
import { PaginationBar } from '@/components/PaginationBar'
import { AdminModal } from '@/components/admin/AdminModal'
import { RefreshCw, Film, ShieldCheck, Users, Flag, CircleAlert, MessageCircle, Inbox } from 'lucide-react'
import './marketplace-admin.css'

// 独立下游运营工作台；不复用或改变原作品审核页。
const businessTabs = { works: 'Duyệt tác phẩm', series: 'Duyệt phim ngắn', recruits: 'Duyệt tuyển dụng', reports: 'Xử lý báo cáo', support: 'Cấu hình chăm sóc khách hàng', categories: 'Danh mục tác phẩm', revenue: 'Chia sẻ doanh thu nền tảng' }
const maintenanceTabs = { previews: 'Tác vụ xem thử tác phẩm', submissions: 'Bản ghi đóng góp lịch sử', jobs: 'Tác vụ phương tiện lịch sử', orders: 'Đơn hàng nền tảng', entitlements: 'Quyền phát vĩnh viễn', ledger: 'Sổ cái doanh thu', payouts: 'Chi trả thủ công', events: 'Nhật ký thao tác' }
const tabs = { ...businessTabs, ...maintenanceTabs }
const statusNames: Record<string, string> = { preview_failed: 'Tạo xem thử ngắn thất bại', original: 'Bản gốc miễn phí', missing: 'Chưa tạo', running: 'Đang xử lý', done: 'Đã hoàn tất', draft: 'Bản nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối', ready: 'Đã sẵn sàng', processing: 'Đang xử lý', failed: 'Thất bại', open: 'Đang thu thập', closed: 'Đã tắt', expired: 'Đã hết hạn', pending_materials: 'Chờ tài liệu', reviewing: 'Đang xác minh tài liệu', supplement: 'Chờ bổ sung', applying: 'Đang xử lý', certificated: 'Đã có chứng chỉ', cancelled: 'Đã hủy', to_review: 'Chờ xem', candidate: 'Ứng viên', not_selected: 'Không dùng', active: 'Quyền lợi hiệu lực', inactive: 'Đã tắt', printfilm: 'Do PrintFilm tạo', external: 'Do nền tảng khác tạo', existing: 'Đã có chứng chỉ', self_service: 'Tự thực hiện', assisted: 'CSKH hỗ trợ', free: 'Công khai miễn phí', copyright_contact: 'Doanh thu bán bản quyền', platform_unlock: 'Doanh thu quảng bá nền tảng', work: 'Tác phẩm video đơn', series: 'Phim ngắn', series_episode: 'Tập phim ngắn', recruit: 'Nhu cầu tuyển dụng', submission: 'Đóng góp lịch sử', manual: 'Tải lên thủ công', drama_import: 'Nhập từ phim truyện', alipay: 'Alipay', wxpay: 'WeChat Pay' }
const names: Record<string, string> = { preview_status: 'Trạng thái xem thử', preview_error: 'Lỗi xem thử', playback_status: 'Phiên bản phát', playback_error: 'Lỗi phát', work_id: 'Mã tác phẩm', id: 'Mã', owner_id: 'Mã người dùng', user_id: 'Mã người dùng mua', asset_id: 'Mã phương tiện', publication_id: 'Mã phiên bản phát hành', publication_version: 'Phiên bản phát hành', episode_id: 'Mã tập', order_id: 'Mã đơn hàng', content_type: 'Loại nội dung', content_id: 'Mã nội dung', publication_owner_id: 'Mã nhà sáng tạo', active: 'Quyền lợi hiệu lực', version: 'Phiên bản nội dung', title: 'Tiêu đề', description: 'Mô tả', price_fen: 'Giá tham khảo (tệ)', sale_type: 'Cách chia doanh thu', copyright_price_fen: 'Giá bản quyền tham khảo (tệ)', unlock_price_fen: 'Giá mở khóa (tệ)', free_episode_count: 'Số tập miễn phí đầu', episode_count: 'Số lượng tập', platform_share_bps: 'Tỷ lệ chiết khấu nền tảng (phần vạn)', share_bps: 'Chiết khấu nền tảng của tác phẩm này (phần vạn)', gross_fen: 'Số tiền đơn hàng (tệ)', platform_fen: 'Doanh thu nền tảng (tệ)', creator_fen: 'Doanh thu nhà sáng tạo (tệ)', amount_fen: 'Số tiền (tệ)', budget_fen: 'Ngân sách (tệ)', quote_fen: 'Báo giá (tệ)', category: 'Danh mục', source: 'Nguồn', source_type: 'Loại nguồn', source_snapshot: 'Ảnh chụp nguồn nhập', license_scope: 'Ý định cấp phép', audit_status: 'Duyệt nội dung', basic_status: 'Quyền sở hữu cơ bản', full_status: 'Quyền sở hữu đầy đủ', reason: 'Lý do duyệt', listed: 'Tác giả đăng', blocked: 'Khóa', author: 'Tác giả', holder: 'Chủ quyền', relationship: 'Quan hệ giữa người đăng và chủ quyền', acquisition: 'Cách có được quyền', scope: 'Phạm vi cấp phép', third_party: 'Cấp phép bên thứ ba', institution: 'Cơ quan đăng ký', certificate_number: 'Số chứng chỉ', ai_platform_license: 'Giấy phép nền tảng AI', ai_generation_record: 'Bản ghi tạo', human_contribution: 'Đóng góp của con người', official_reference: 'Mã đơn đăng ký', route: 'Cách xử lý', status: 'Trạng thái', settlement_status: 'Trạng thái quyết toán', out_trade_no: 'Số đơn hàng', trade_no: 'Mã giao dịch bên thứ ba', paid_at: 'Thời gian thanh toán', pay_type: 'Kênh thanh toán', operator_id: 'Mã người thao tác', note: 'Ghi chú', statement: 'Mô tả báo cáo', contact: 'Kênh liên hệ', resolution: 'Kết quả xử lý', target_type: 'Loại đối tượng', target_id: 'Mã đối tượng', requirements: 'Yêu cầu bàn giao', wanted_count: 'Số lượng thu thập', deadline_at: 'Hạn chót', valid_until: 'Hạn cấp phép', fingerprint: 'Dấu vân tay tệp', filename: 'Tên tệp', selection: 'Đánh dấu lọc', withdrawn: 'Thu hồi', action: 'Thao tác', actor_id: 'Người thao tác', attempts: 'Số lần thử', error: 'Mô tả lỗi', media_status: 'Trạng thái phương tiện', state: 'Trạng thái nghiệp vụ', tags: 'Nhãn', authorization_id: 'Số thư ủy quyền', authorization_version: 'Phiên bản điều khoản cấp phép', authorization_signer: 'Người ký', copyright_statement: 'Tuyên bố bản quyền', dispute_ack: 'Đã xác nhận tuyên bố bản quyền' }

// 按可读字段渲染审核材料，原片和证书另经鉴权打开。
function Summary({ item, kind }: { item: Item; kind: string }) {
  const details = typeof item.details === 'object' && item.details !== null ? item.details : {}
  return <dl className="market-ops-summary">
    {Object.entries(item).filter(([key, value]) => names[key] && !['basic_status', 'full_status', 'id', 'title', 'audit_status', 'status'].includes(key) && value !== null && value !== '').map(([key, value]) => <div key={key}><dt>{names[key]}</dt><dd>{typeof value === 'boolean' ? value ? 'Có' : 'Không' : ['price_fen', 'copyright_price_fen', 'unlock_price_fen', 'budget_fen', 'quote_fen', 'gross_fen', 'platform_fen', 'creator_fen', 'amount_fen'].includes(key) ? `¥${(Number(value) / 100).toFixed(2)}` : Array.isArray(value) ? value.join('、') || '—' : typeof value === 'object' ? JSON.stringify(value) : key === 'preview_status' && value === 'none' ? (isFreeItem(item) ? 'Không cần xem thử' : 'Chưa tạo') : key === 'status' ? statusLabel(kind, value) : fieldStatusLabel(key, value) || statusNames[String(value)] || String(value)}</dd></div>)}
    {Object.entries(details).filter(([key, value]) => names[key] && value !== '' && value !== null && value !== undefined).map(([key, value]) => <div key={key}><dt>{key === 'dispute_ack' ? 'Đã xác nhận tuyên bố bản quyền' : names[key] || key}</dt><dd>{typeof value === 'boolean' ? value ? 'Có' : 'Không' : fieldStatusLabel(key, value) || statusNames[String(value)] || String(value)}</dd></div>)}
  </dl>
}

// 直接从服务端签名，不将原始 OSS key 传到页面。
function FileLink({ id, label, purpose = 'original', video = false }: { id: number; label: string; purpose?: string; video?: boolean }) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<{ url: string; image: boolean; pdf: boolean } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  async function open() {
    try {
      if (video) { setUrl(await assetUrl(id, purpose)); setError(''); return }
      const blob = await assetFile(id, purpose)
      const type = blob.type
      setPreview(current => { if (current) URL.revokeObjectURL(current.url); return { url: URL.createObjectURL(blob), image: type.startsWith('image/'), pdf: type.includes('pdf') } })
      setError('')
    } catch (e) { setError((e as Error).message) }
  }
  return <div className="market-ops-file"><button type="button" onClick={() => { void open() }}>{label}</button>{url && video && <video src={url} controls className="my-3 max-h-[500px] w-full" />}{preview?.image && <img src={preview.url} alt={label} />}{preview?.pdf && <iframe className="market-ops-file-frame" src={preview.url} title={label} />}{preview && !preview.image && !preview.pdf && <p>Tệp này tạm thời chưa thể xem trước trong trang.</p>}{error && <p role="alert">{error}</p>}</div>
}

function WorkPreviewLink({ id }: { id: number }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState('')
  return <div className="market-ops-file"><button type="button" onClick={async () => { try { setUrl((await request<{ url: string }>(`/api/marketplace/media/work/${id}/preview`)).url); setError('') } catch (e) { setError((e as Error).message) } }}>Xem bản xem thử ngắn</button>{url && <video src={url} controls className="my-3 max-h-[500px] w-full" />}{error && <p role="alert">{error}</p>}</div>
}
function AuthorizationLink({ details }: { details: unknown }) {
  const id = details && typeof details === 'object' && 'authorization_id' in details ? Number(details.authorization_id) : 0
  const [preview, setPreview] = useState<{ url: string; image: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview?.url])
  if (!id) return null
  async function openLetter() {
    setLoading(true); setError('')
    try {
      const blob = await letterFile(id)
      const url = URL.createObjectURL(blob)
      setPreview(current => { if (current?.url) URL.revokeObjectURL(current.url); return { url, image: blob.type.startsWith('image/') } })
      setOpen(true)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  function downloadLetter() {
    if (!preview) return
    const link = document.createElement('a')
    link.href = preview.url
    link.download = preview.image ? 'Thư ủy quyền.png' : 'Thư ủy quyền.pdf'
    link.click()
  }
  return <div className="market-ops-file">
    <button type="button" onClick={() => void openLetter()} disabled={loading}>{loading ? 'Đang tải thư ủy quyền…' : 'Xem trước thư ủy quyền'}</button>
    {preview && <button type="button" onClick={downloadLetter}>Tải thư ủy quyền</button>}
    {error && <p role="alert">{error}</p>}
    <AdminModal open={open} onOpenChange={setOpen} title="Xem trước thư ủy quyền" subtitle="Dùng để đối chiếu tài liệu cấp phép và lưu trữ, sẽ không tự động tải tệp xuống." size="xl" className="market-ops-letter-modal" bodyClassName="market-ops-letter-modal-body">
      <div className="market-ops-letter-preview">
        <div className="market-ops-letter-preview-head"><strong>Thư ủy quyền tác phẩm PrintFilm</strong><span>{preview?.image ? 'Tệp hình ảnh' : 'Tệp PDF'} · Xem trực tuyến</span></div>
        <div className="market-ops-letter-preview-canvas">
          {preview ? (preview.image ? <img className="market-ops-letter-image" src={preview.url} alt="Đã ký thư ủy quyền" /> : <iframe className="market-ops-letter-frame" src={preview.url} title="Xem trước thư ủy quyền" />) : <p>Thư ủy quyền chưa được tải.</p>}
        </div>
      </div>
      {preview && <div className="market-ops-letter-modal-actions"><button type="button" onClick={downloadLetter}>Tải thư ủy quyền</button></div>}
    </AdminModal>
  </div>
}

function CoverImage({ id }: { id?: number }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!id) return
    let active = true
    assetUrl(id, 'cover').then(value => { if (active) setUrl(value) }).catch(() => {})
    return () => { active = false }
  }, [id])
  return url ? <img src={url} alt="" /> : <span><Film size={28} /></span>
}

function Playback({ assetId }: { assetId?: number }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!assetId) return
    let active = true
    assetUrl(assetId, 'original').then(value => { if (active) setUrl(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [assetId])
  if (!assetId) return <p>Không có bản gốc có thể phát</p>
  if (error) return <p role="alert">{error}</p>
  if (!url) return <p role="status">Đang tải bản gốc…</p>
  return <video src={url} controls />
}

function auditLabel(item: Item) {
  const name = statusNames[String(item.audit_status || 'draft')] || String(item.audit_status || 'Bản nháp')
  return item.listed ? `${name} · Đã đăng` : name
}

function isFreeItem(item: Item) {
  return item.sale_type === 'free'
}

function priceLabel(item: Item, series = false, recruit = false) {
  if (recruit) return `¥${(Number(item.budget_fen || 0) / 100).toFixed(2)}`
  if (isFreeItem(item)) return 'Miễn phí'
  if (series && item.sale_type === 'platform_unlock') return 'Mở khóa theo tập'
  const fen = series ? Number(item.copyright_price_fen ?? item.price_fen ?? 0) : Number(item.sale_type === 'platform_unlock' ? item.unlock_price_fen : item.price_fen)
  return `¥${(fen / 100).toFixed(2)}`
}

function ReviewGallery({ items, series, recruit = false, onOpen }: { items: Item[]; series: boolean; recruit?: boolean; onOpen: (item: Item) => void }) {
  if (!items.length) return null
  return <div className="market-ops-gallery">{items.map(item => <button type="button" className="market-ops-card" key={item.id} onClick={() => onOpen(item)}>
    <span className="market-ops-card-cover"><CoverImage id={typeof item.cover_asset_id === 'number' ? item.cover_asset_id : undefined} /><em className={`market-ops-badge status-${String(item.audit_status || 'draft')}`}>{auditLabel(item)}</em></span>
    <span className="market-ops-card-body">
      <em>{recruit ? 'Tuyển dụng' : series ? 'Phim ngắn' : String(item.category || 'Tác phẩm')}</em>
      <strong>{String(item.title || 'Tác phẩm chưa đặt tên')}</strong>
      <small><i>{String(item.author || 'Tạo').slice(0, 1)}</i>{String(item.author || `Người dùng #${item.owner_id || ''}`)}</small>
      <b>{priceLabel(item, series, recruit)}{recruit ? <span>/ ngân sách mỗi mục · thu thập {String(item.wanted_count || 0)} mục</span> : series ? <span>{Number(item.episode_count || (Array.isArray(item.episodes) ? item.episodes.length : 0))} tập{Number(item.free_episode_count) > 0 ? ` · ${item.free_episode_count} tập đầu miễn phí` : ''}</span> : !isFreeItem(item) && <span>{item.sale_type === 'platform_unlock' ? 'Giá mở khóa' : 'Giá tham khảo'}</span>}</b>
    </span>
  </button>)}</div>
}

function ReviewStage({ item, series, recruit = false, onBack, onReview }: { item: Item; series: boolean; recruit?: boolean; onBack: () => void; onReview: (event: FormEvent<HTMLFormElement>, item: Item) => void }) {
  const episodes = Array.isArray(item.episodes) ? item.episodes as Item[] : []
  const [episodeId, setEpisodeId] = useState<number | undefined>(typeof episodes[0]?.id === 'number' ? episodes[0].id : undefined)
  const episode = episodes.find(entry => entry.id === episodeId)
  const assetId = series ? (typeof episode?.asset_id === 'number' ? episode.asset_id : undefined) : (typeof item.asset_id === 'number' ? item.asset_id : undefined)
  const coverId = typeof item.cover_asset_id === 'number' ? item.cover_asset_id : undefined
  return <section className="market-ops-stage">
    <button type="button" className="market-ops-back" onClick={onBack}>Quay lại danh sách</button>
    <div className="market-ops-stage-layout">
      <div className="market-ops-stage-player">{recruit ? <CoverImage id={coverId} /> : <><p className="market-ops-original-note">Quản trị viên duyệt bản gốc hoàn chỉnh</p><Playback key={assetId || 'none'} assetId={assetId} /></>}</div>
      <aside>
        <span className={`market-ops-badge status-${String(item.audit_status || 'draft')}`}>{auditLabel(item)}</span>
        <h2>{String(item.title || 'Tác phẩm chưa đặt tên')}</h2>
        <p>{String(item.author || 'Nhà sáng tạo')} · {priceLabel(item, series, recruit)}{series ? ` · ${episodes.length} tập` : ''}{recruit ? ` · Thu thập ${String(item.wanted_count || 0)} mục` : ''}</p>
        <p>{String(item.description || 'Chưa có giới thiệu')}</p>
        {recruit && <p>Yêu cầu bàn giao:{String(item.requirements || 'Chưa nhập')}</p>}
        <p>Ý định cấp phép:{String(item.license_scope || 'Chưa nhập')}</p>
        {recruit && <p>Hạn chót:{String(item.deadline_at || 'Chưa nhập')}</p>}
        {series && <div className="market-ops-episode-picks">{episodes.map(episode => <button type="button" key={episode.id} aria-pressed={episode.id === episodeId} onClick={() => setEpisodeId(Number(episode.id))}>Tập {String(episode.episode_no)}</button>)}</div>}
        {!recruit && <AuthorizationLink details={series ? episodes.find(episode => episode.id === episodeId)?.details : item.details} />}
        {item.audit_status === 'pending' ? <form className="market-ops-review" onSubmit={event => onReview(event, item)}><h3>Xử lý duyệt</h3><p>{recruit ? 'Xem xong mô tả nhu cầu và ảnh tham chiếu, đưa ra kết luận duyệt lần này.' : 'Xem xong tệp phát và tài liệu bản quyền, đưa ra kết luận duyệt lần này.'}</p>{!recruit && <div className="grid gap-3"><section><h3>Kiểm tra nội dung</h3><label><input name="checks" value="content" type="checkbox" /> Đã kiểm tra video, ảnh bìa, tiêu đề và giới thiệu</label></section><section><h3>Kiểm tra bản quyền</h3><label><input name="checks" value="copyright" type="checkbox" /> Đã kiểm tra thư ủy quyền hoặc số chứng chỉ, tài liệu chứng minh và tuyên bố bản quyền</label></section></div>}<label className="block">Căn cứ và lý do duyệt<textarea name="reason" required maxLength={3000} className="block w-full rounded border bg-background p-2" /></label><div className="flex gap-3"><button type="submit" value="approved" className="market-ops-approve">Duyệt phiên bản này</button><button type="submit" value="rejected" className="market-ops-reject">Từ chối phiên bản này</button></div></form> : <p>Phiên bản này không ở trạng thái chờ duyệt.</p>}
      </aside>
    </div>
  </section>
}

function PayoutStatusForm({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [status, setStatus] = useState(String(item.status || 'pending'))
  const [note, setNote] = useState(String(item.note || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await request(`/api/admin/marketplace/payouts/${item.id}`, 'PATCH', { owner_id: Number(item.owner_id), amount_fen: Number(item.amount_fen), status, note })
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-inline-form" onSubmit={save}>
    <label>Trạng thái chi trả<select value={status} onChange={event => setStatus(event.target.value)} disabled={status === 'paid'}><option value="pending">Chờ chi trả</option><option value="paid">Đã chi trả</option><option value="failed">Chi trả thất bại</option></select></label>
    <label>Ghi chú<input value={note} maxLength={3000} onChange={event => setNote(event.target.value)} /></label>
    <button type="submit" disabled={busy || status === String(item.status || '')}>{busy ? 'Đang lưu…' : 'Cập nhật bản ghi chi trả'}</button>
    {error && <span role="alert">{error}</span>}
  </form>
}


// 独立工作台含分页、错误态、敏感材料检查和明确原因输入。
export default function MarketplaceAdmin() {
  const availability = useMarketplaceStatus()
  const enabled = availability.enabled
  const [kind, setKind] = useState<keyof typeof tabs>('works')
  const [listing, setListing] = useState<Listing | null>(null)
  const [overview, setOverview] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [selected, setSelected] = useState<Item | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [entitlementUserId, setEntitlementUserId] = useState('')
  const [entitlementOwnerId, setEntitlementOwnerId] = useState('')
  function navigateTab(next: keyof typeof tabs, nextStatus?: string) {
    if (next === 'jobs' || next === 'events' || next === 'previews' || next === 'submissions' || next === 'orders' || next === 'entitlements' || next === 'ledger' || next === 'payouts') setMaintenanceOpen(true)
    const fallback = next === 'works' || next === 'series' || next === 'recruits' ? 'pending' : ''
    setKind(next); setPage(1); setStatus(nextStatus === undefined ? fallback : nextStatus); setSelected(null); setListing(null); setError(''); setMessage('')
  }
  useEffect(() => {
    if (!enabled || kind === 'support' || kind === 'categories' || kind === 'revenue') return
    let active = true; setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), status })
    if (kind === 'entitlements') { if (entitlementUserId) params.set('user_id', entitlementUserId); if (entitlementOwnerId) params.set('owner_id', entitlementOwnerId) }
    request<Listing>(`/api/admin/marketplace/records/${kind}?${params}`).then(result => { if (active) setListing(result) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    request<Record<string, number>>('/api/admin/marketplace/overview').then(value => { if (active) setOverview(value) }).catch(() => {})
    return () => { active = false }
  }, [enabled, kind, page, status, refresh, entitlementUserId, entitlementOwnerId])
  // 统一提交审核意图，后端始终重新核对版本与状态。
  async function action(path: string, body: unknown) { setError(''); setMessage(''); try { await request(`/api/admin/marketplace${path}`, 'POST', body); setRefresh(v => v + 1); setMessage('Thao tác thành công'); return true } catch (e) { setError((e as Error).message); return false } }
  // 审核原因和逐项确认来自该记录的表单，不自动勾选。
  function review(e: FormEvent<HTMLFormElement>, item: Item) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
    void action(`/${kind}/${item.id}/review`, { version: item.version, decision: submitter.value, reason: form.get('reason'), checks: form.getAll('checks') }).then(ok => { if (ok) setSelected(null) })
  }
  if (availability.loading) return <p role="status">Đang đọc trạng thái dịch vụ chợ tài sản số…</p>
  if (availability.error) return <div className="market-ops"><p role="alert">Tạm thời không lấy được trạng thái dịch vụ chợ tài sản số, vui lòng thử lại.{availability.error}</p><button type="button" onClick={availability.retry}>Tải lại</button></div>
  if (!enabled) return <div className="market-ops"><p>Chợ tài sản số chưa được bật, vui lòng bật chức năng này trước rồi thử lại.</p><button type="button" onClick={availability.retry}>Làm mới trạng thái dịch vụ</button></div>
  const reviewView = kind === 'works' || kind === 'series' || kind === 'recruits' ? (selected ? 'detail' : 'cards') : 'records'
  return <div className="market-ops">
    <header className="market-ops-header"><div><div className="market-ops-eyebrow"><ShieldCheck size={15} /> Bàn làm việc vận hành</div><h1>Vận hành nền tảng tài sản số</h1><p>Duyệt thống nhất tác phẩm, phim ngắn và thông tin tuyển dụng, quản lý tài liệu bản quyền, báo cáo và doanh thu.</p></div><button type="button" className="market-ops-refresh" onClick={() => setRefresh(v => v + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Làm mới dữ liệu</button></header>
    <div className="market-ops-stats">{([
      { key: 'works_pending', label: 'Tác phẩm chờ duyệt', icon: Film, tab: 'works', tone: 'green' },
      { key: 'recruits_pending', label: 'Tuyển dụng chờ duyệt', icon: Users, tab: 'recruits', tone: 'blue' },
      { key: 'reports_pending', label: 'Báo cáo chờ xử lý', icon: Flag, tab: 'reports', tone: 'amber' },
      { key: 'jobs_failed', label: 'Tác vụ phương tiện thất bại', icon: CircleAlert, tab: 'jobs', tone: 'red' },
    ] as const).map(card => <button type="button" className={`market-ops-stat tone-${card.tone}`} key={card.key} onClick={() => navigateTab(card.tab, card.tab === 'jobs' ? 'failed' : 'pending')}><span className="market-ops-stat-icon"><card.icon size={20} /></span><span><span className="market-ops-stat-label">{card.label}</span><strong>{overview[card.key] ?? '—'}</strong></span><span className="market-ops-stat-arrow">↗</span></button>)}</div>
    <div className="market-ops-context"><span><MessageCircle size={15} />Tổng lượt tư vấn <strong>{overview.consultations ?? '—'}</strong> lần</span><span>Dung lượng tệp <strong>{overview.storage_bytes === undefined ? '—' : `${(overview.storage_bytes / 1024 / 1024).toFixed(1)} MB`}</strong></span><span className="market-ops-context-note">Giao dịch bản quyền và tuyển dụng do CSKH kết nối, doanh thu mở khóa của nền tảng được ghi sổ riêng</span></div>
    <nav className="market-ops-tabs" aria-label="Nghiệp vụ vận hành tài sản số">{Object.entries(businessTabs).map(([key, label]) => <button type="button" key={key} aria-current={kind === key ? 'page' : undefined} onClick={() => navigateTab(key as keyof typeof tabs)}>{label}</button>)}<button type="button" aria-expanded={maintenanceOpen} className="market-ops-maintenance-toggle" onClick={() => { if (maintenanceOpen && (kind === 'jobs' || kind === 'events' || kind === 'previews' || kind === 'submissions' || kind === 'orders' || kind === 'entitlements' || kind === 'ledger' || kind === 'payouts')) navigateTab('works'); setMaintenanceOpen(!maintenanceOpen) }}>Thêm chức năng vận hành {maintenanceOpen ? '−' : '+'}</button></nav>
    {maintenanceOpen && <div className="market-ops-maintenance"><div><strong>Thêm chức năng vận hành</strong><p>Xem đơn hàng, quyền phát, doanh thu và bản ghi chi trả, cùng tác vụ xem thử ngắn và thao tác lịch sử. Nhận việc tuyển dụng do CSKH kết nối.</p></div><nav aria-label="Thêm chức năng vận hành">{Object.entries(maintenanceTabs).map(([key, label]) => <button type="button" key={key} aria-current={kind === key ? 'page' : undefined} onClick={() => navigateTab(key as keyof typeof tabs)}>{label}</button>)}</nav></div>}
    {kind === 'jobs' && <p className="market-ops-feedback">Phần này giữ lại tác vụ phương tiện lịch sử để điều tra; tuyển dụng không còn tạo đóng góp hay tác vụ duyệt phim, xem thử ngắn của tác phẩm thu phí hãy xem ở “Tác vụ xem thử tác phẩm”.</p>}
    {error && <p role="alert" className="market-ops-feedback is-error">{error}</p>}{message && <p role="status" className="market-ops-feedback">{message}</p>}
    {kind === 'support' ? <SupportForm /> : kind === 'categories' ? <CategoryForm /> : kind === 'revenue' ? <RevenueConfigForm /> : <><div className="market-ops-filter"><div><h2>{tabs[kind]}</h2><span>{listing ? `Tổng ${listing.meta.total} bản ghi` : 'Đang tải bản ghi'}</span></div><select aria-label="Lọc trạng thái" className="rounded border bg-background p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả trạng thái</option>{statusOptions(kind).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{kind === 'entitlements' && <div className="market-ops-entitlement-filter"><input aria-label="Mã người dùng mua" type="number" min="1" placeholder="Mã người dùng mua" value={entitlementUserId} onChange={e => { setEntitlementUserId(e.target.value); setPage(1) }} /><input aria-label="Mã nhà sáng tạo" type="number" min="1" placeholder="Mã nhà sáng tạo" value={entitlementOwnerId} onChange={e => { setEntitlementOwnerId(e.target.value); setPage(1) }} /></div>}<button type="button" onClick={() => setRefresh(v => v + 1)}>Làm mới</button></div>{kind === 'payouts' && <PayoutCreateForm onSaved={() => setRefresh(v => v + 1)} />}{loading ? <p role="status">Đang tải…</p> : reviewView === 'detail' && selected ? <ReviewStage item={selected} series={kind === 'series'} recruit={kind === 'recruits'} onBack={() => setSelected(null)} onReview={review} /> : reviewView === 'cards' ? <ReviewGallery items={listing?.items ?? []} series={kind === 'series'} recruit={kind === 'recruits'} onOpen={setSelected} /> : listing?.items.map(item => <article className="market-ops-record" key={`${kind}-${item.id}-${refresh}`}><header className="market-ops-record-head"><div><span className="market-ops-record-id">#{item.id} · {tabs[kind]}</span><h3>{String(item.title || item.filename || item.recruit_title || (kind === 'entitlements' ? `Người dùng #${item.user_id} quyền lợi vĩnh viễn của` : 'Bản ghi nghiệp vụ'))}</h3></div><span className={`market-ops-badge status-${recordStatus(kind, item) || 'record'}`}>{kind === 'events' ? 'Nhật ký thao tác' : kind === 'submissions' ? statusNames[String(item.selection)] || 'Đóng góp lịch sử' : statusLabel(kind, recordStatus(kind, item))}</span></header><details className="market-ops-details" open={kind === 'works' || kind === 'recruits' || kind === 'series' || kind === 'entitlements'}><summary>{recordDetailsTitle(kind)}</summary><Summary item={item} kind={kind} /></details>
      {kind === 'works' && item.sale_type !== 'free' && <WorkPreviewLink id={Number(item.id)} />}
      {typeof item.asset_id === 'number' && <FileLink id={item.asset_id} label="Xem trước video" purpose="original" video />}
      {kind === 'works' && typeof item.cover_asset_id === 'number' && <FileLink id={item.cover_asset_id} label="Ảnh bìa tác phẩm" />}{typeof item.certificate_asset_id === 'number' && <FileLink id={item.certificate_asset_id} label="Giấy chứng minh quyền sở hữu／chứng chỉ đăng ký" />}
      {Array.isArray(item.evidence_ids) && item.evidence_ids.map(id => <FileLink key={Number(id)} id={Number(id)} label="Tài liệu chứng minh" />)}
      {kind === 'series' && Array.isArray(item.episodes) && <div className="market-ops-episodes"><h4>Tài liệu tập</h4>{item.episodes.map((episode: Item) => <section key={episode.id}><strong>Tập {String(episode.episode_no)} · {String(episode.title || '')}</strong>{typeof episode.asset_id === 'number' && <FileLink id={episode.asset_id} label="Video tập" purpose="original" video />}{typeof episode.cover_asset_id === 'number' && <FileLink id={episode.cover_asset_id} label="Ảnh bìa tập" />}{typeof episode.certificate_asset_id === 'number' && <FileLink id={episode.certificate_asset_id} label="Chứng minh bản quyền tập" />}{Array.isArray(episode.evidence_ids) && episode.evidence_ids.map(value => <FileLink key={Number(value)} id={Number(value)} label="Tài liệu chứng minh tập" />)}<AuthorizationLink details={episode.details} /></section>)}</div>}
      <AuthorizationLink details={item.details} />{kind === 'submissions' && <p>Ảnh chụp đóng góp:{JSON.stringify(item.snapshot)}</p>}
      {((kind === 'recruits' || kind === 'series' || kind === 'works') && item.audit_status === 'pending') && <form className="market-ops-review" onSubmit={e => review(e, item)}><h3>Xử lý duyệt</h3><p>Xem nội dung và tài liệu bản quyền xong, đưa ra kết luận duyệt lần này.</p>{(kind === 'works' || kind === 'series') && <div className="grid gap-3"><section><h3>Kiểm tra nội dung</h3><label><input name="checks" value="content" type="checkbox" /> Đã kiểm tra video, ảnh bìa, tiêu đề và giới thiệu</label></section><section><h3>Kiểm tra bản quyền</h3><label><input name="checks" value="copyright" type="checkbox" /> Đã kiểm tra thư ủy quyền hoặc số chứng chỉ, tài liệu chứng minh và tuyên bố bản quyền</label></section></div>}<label className="block">Căn cứ và lý do duyệt<textarea name="reason" required maxLength={3000} className="block w-full rounded border bg-background p-2" /></label><div className="flex gap-3"><button type="submit" value="approved" className="market-ops-approve">Duyệt phiên bản này</button><button type="submit" value="rejected" className="market-ops-reject">Từ chối phiên bản này</button></div></form>}
      {kind === 'reports' && <form className="market-ops-review" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (window.confirm('Xác nhận ghi lại kết quả xử lý báo cáo?')) void action(`/reports/${item.id}/resolve`, { resolution: form.get('resolution') }) }}><textarea name="resolution" aria-label="Kết quả xử lý" required maxLength={3000} className="block w-full rounded border bg-background p-2" /><div className="flex gap-3"><button type="submit" className="market-ops-approve">Ghi lại kết quả xử lý</button><button type="button" className="market-ops-reject" onClick={() => { const reason = window.prompt('Căn cứ và lý do tạm hạn chế đối tượng bị báo cáo'); if (reason) void action(`/block/${item.target_type}/${item.target_id}`, { blocked: true, reason }) }}>Tạm hạn chế đối tượng bị báo cáo</button></div></form>}
      {kind === 'payouts' && <PayoutStatusForm item={item} onSaved={() => setRefresh(v => v + 1)} />}
      {['works', 'recruits', 'submissions'].includes(kind) && <button type="button" className="market-ops-reject" onClick={() => { const reason = window.prompt(`${item.blocked ? 'Gỡ hạn chế' : 'Hạn chế phát và tư vấn'}lý do của`); if (reason) void action(`/block/${({ works: 'work', recruits: 'recruit', submissions: 'submission' } as Record<string, string>)[kind]}/${item.id}`, { blocked: !item.blocked, reason }) }}>{item.blocked ? 'Gỡ hạn chế (không tự động đăng)' : 'Khóa／tạm gỡ'}</button>}
    </article>)}{!selected && !loading && !error && listing?.items.length === 0 && <div className="market-ops-empty"><Inbox size={36} /><h3>Chưa có{tabs[kind]}Bản ghi</h3><p>{status ? 'Không có bản ghi theo điều kiện lọc hiện tại, vui lòng điều chỉnh bộ lọc trạng thái.' : 'Hiện chưa có bản ghi, các bản ghi nghiệp vụ mới sẽ hiển thị ở đây.'}</p></div>}{!selected && listing && <PaginationBar page={page} pageSize={listing.meta.page_size} total={listing.meta.total} onPageChange={setPage} />}</>}
  </div>
}

// 二维码同样必须走独立 OSS；无配置时清晰报错，不生成假图片。
function SupportForm() {
  const [settings, setSettings] = useState<Item | null>(null)
  const [qr, setQr] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { request<Item>('/api/admin/marketplace/support').then(value => { setSettings(value); setQr(typeof value.qr_asset_id === 'number' ? value.qr_asset_id : null) }).catch(e => setMessage(e.message)) }, [])
  // 小二维码也使用同一分片协议，上传完成后需要 Worker 校验。
  async function uploadQr(file?: File) {
    if (!file) return; setBusy(true)
    try {
      const session = await request<{ id: number; asset_id: number; part_size: number }>('/api/marketplace/uploads', 'POST', { filename: file.name, size_bytes: file.size, kind: 'qr' })
      for (let start = 0, number = 1; start < file.size; start += session.part_size, number++) await request(`/api/marketplace/uploads/${session.id}/parts/${number}`, 'PUT', file.slice(start, start + session.part_size))
      await request(`/api/marketplace/uploads/${session.id}/complete`, 'POST'); setQr(session.asset_id); setMessage('Đã tải mã QR xong, vui lòng lưu cấu hình CSKH.')
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  // 后台保存仍校验二维码属于管理员且状态 ready。
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true)
    try { await request('/api/admin/marketplace/support', 'PUT', { name: form.get('name'), wechat: form.get('wechat'), hours: form.get('hours'), enabled: form.get('enabled') === 'on', qr_asset_id: qr }); setMessage('Đã lưu cấu hình CSKH') } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  if (!settings) return <p>{message || 'Đang tải cấu hình CSKH…'}</p>
  return <form className="market-ops-support" onSubmit={save}><label className="block">Tên CSKH<input name="name" required maxLength={80} defaultValue={String(settings.name ?? 'CSKH nền tảng')} className="block w-full rounded border bg-background p-2" /></label><label className="block">ID WeChat<input name="wechat" maxLength={100} defaultValue={String(settings.wechat ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">Thời gian phục vụ<input name="hours" maxLength={100} defaultValue={String(settings.hours ?? '')} className="block w-full rounded border bg-background p-2" /></label><label className="block">Tải lên mã QR CSKH thật<input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={e => uploadQr(e.target.files?.[0])} /></label><p>Mã tệp mã QR:{qr ?? 'Chưa đặt'}</p>{qr && <FileLink id={qr} label="Kiểm tra mã QR" />}<label className="block"><input name="enabled" type="checkbox" defaultChecked={Boolean(settings.enabled)} /> Bật CSKH nền tảng</label><button type="submit" disabled={busy}>Lưu cấu hình CSKH</button><p role="status">{message}</p></form>
}

function RevenueConfigForm() {
  const [value, setValue] = useState<Item | null>(null)
  const [share, setShare] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('Đang tải cấu hình chia sẻ doanh thu nền tảng…')
  const [busy, setBusy] = useState(false)
  useEffect(() => { request<Item>('/api/admin/marketplace/revenue-config').then(item => { setValue(item); setShare(String(item.platform_share_bps ?? '')); setEnabled(Boolean(item.enabled)); setMessage('') }).catch(e => setMessage(e.message)) }, [])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const bps = Number(share)
      if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error('Tỷ lệ chiết khấu nền tảng phải là số nguyên từ 0 đến 10000, 2000 nghĩa là 20%')
      const result = await request<Item>('/api/admin/marketplace/revenue-config', 'PUT', { version: value?.version ?? 0, platform_share_bps: bps, enabled })
      setValue(result); setEnabled(Boolean(result.enabled)); setShare(String(result.platform_share_bps ?? '')); setMessage(result.enabled ? 'Đã lưu cấu hình, doanh thu quảng bá nền tảng đã được bật.' : 'Đã lưu cấu hình, doanh thu quảng bá nền tảng chưa bật, tạm thời chưa thể gửi loại tác phẩm này.')
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support" onSubmit={save}><h2>Chia sẻ doanh thu quảng bá nền tảng</h2><p>Nhập chiết khấu nền tảng theo phần vạn, ví dụ 2000 nghĩa là nền tảng 20%, nhà sáng tạo tự động nhận 80% còn lại. Mỗi tác phẩm có thể ghi đè riêng tỷ lệ mặc định này.</p><label className="block">Tỷ lệ chiết khấu nền tảng (phần vạn)<input type="number" min="0" max="10000" step="1" value={share} onChange={e => setShare(e.target.value)} required className="block w-full rounded border bg-background p-2" /></label>{share !== '' && Number.isInteger(Number(share)) && Number(share) >= 0 && Number(share) <= 10000 && <p>Tỷ lệ hiện tại: nền tảng {Number(share) / 100}% / nhà sáng tạo {(10000 - Number(share)) / 100}%</p>}<label className="block"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Bật doanh thu quảng bá nền tảng</label><button type="submit" disabled={busy || !value}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button><p role="status">{message}</p></form>
}

function PayoutCreateForm({ onSaved }: { onSaved: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    const formElement = e.currentTarget; const form = new FormData(formElement)
    try {
      await request('/api/admin/marketplace/payouts', 'POST', { owner_id: Number(form.get('owner_id')), amount_fen: Math.round(Number(form.get('amount')) * 100), status: form.get('status'), note: form.get('note') })
      formElement.reset(); setMessage('Đã lưu bản ghi chi trả'); onSaved()
    } catch (err) { setMessage((err as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support" onSubmit={save}><h3>Ghi lại chi trả thủ công</h3><div className="pf-market-field-row"><label>Mã người dùng nhà sáng tạo<input name="owner_id" type="number" min="1" required /></label><label>Số tiền (tệ)<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><label>Trạng thái<select name="status" defaultValue="paid"><option value="pending">Chờ chi trả</option><option value="paid">Đã chi trả</option><option value="failed">Chi trả thất bại</option></select></label><label>Ghi chú<textarea name="note" maxLength={3000} /></label><button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu bản ghi chi trả'}</button><p role="status">{message}</p></form>
}








