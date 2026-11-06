import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Film, Play, RefreshCw, UsersRound } from 'lucide-react'
import { date, labels, money, request, type Listing, type Row } from './api'
import { Media, Pager } from './shared'
import Button from '../../components/ui/Button'
import { EmptyState, PageHeading } from './ui'
import AssetPreview from './AssetPreview'
import { dialog } from '../../lib/dialog'
import { isFreeWork } from './playbackPolicy'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'

const fileKindNames: Record<string, string> = { video: tv('视频', 'Video'), image: tv('图片', 'Hình ảnh'), document: tv('文档', 'Tài liệu') }

function mineHref(item: Row) {
  return item.kind === 'series' ? `/marketplace/series/${item.id}/edit` : `/marketplace/works/${item.id}/manage`
}

function mineStatus(item: Row) {
  if (item.blocked) return tv('已限制', 'Đã hạn chế')
  if (item.listed) return tv('已上架', 'Đã đăng')
  return labels[item.audit_status || ''] || tv('草稿', 'Bản nháp')
}

function recruitStatus(item: Row) {
  if (item.blocked) return tv('已限制', 'Đã hạn chế')
  if (item.state === 'closed') return tv('已关闭', 'Đã đóng')
  if (item.state === 'expired') return tv('已到期', 'Đã hết hạn')
  return labels[item.audit_status || ''] || tv('草稿', 'Bản nháp')
}

function freeMine(item: Row) {
  return isFreeWork(item)
}

function MineRecruits({ listing, loading, page, changePage }: { listing: Listing | null; loading: boolean; page: number; changePage: (value: number) => void }) {
  return <section className="pf-market-discover pf-market-mine">
    <header className="pf-discover-heading"><div><span className="pf-market-kicker">{tv("创作需求", "Nhu cầu sáng tạo")}</span><h1>{tv("我的招募", "Tuyển dụng của tôi")}</h1><p>{tv("草稿、审核和已通过的需求都在这里。", "Bản nháp, đang duyệt và nhu cầu đã duyệt đều ở đây.")}</p></div><Button variant="dark" to="/marketplace/recruits/new" icon>{tv("发布招募", "Đăng tuyển dụng")}<ArrowUpRight size={17} /></Button></header>
    {loading || !listing ? <div key="loading" className="pf-market-grid" role="status">{[0, 1, 2].map(item => <div key={item} className="pf-market-skeleton"><div /><span /><span /></div>)}</div> : listing.items.length ? <div key="ready" className="pf-market-grid">{listing.items.map(item => {
      const href = `/marketplace/recruits/${item.id}/manage`
      return <article className="pf-market-item" key={`recruit-${item.id}`}>
        <div className="pf-market-item-cover">{item.image_ids?.length ? <Media kind="recruit" id={item.id} purpose="image-0" /> : <span className="pf-market-series-mark"><UsersRound size={36} strokeWidth={1.4} /></span>}<span className="pf-market-badge">{recruitStatus(item)}</span><Link className="pf-market-cover-play" to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><ArrowUpRight size={16} /></Link></div>
        <div className="pf-market-item-body">
          <h3><Link to={href}>{item.title}</Link></h3>
          <p className="pf-market-author"><span>{tv("需", "Nhu cầu")}</span>{tv("截止", "Hạn chót")} {date(item.deadline_at)} {tv("· 征集", "· Thu thập")} {item.wanted_count || 0} {tv("条", "mục")}</p>
          <div className="pf-market-item-price"><div><strong>{money(item.budget_fen)}</strong><span>{tv("/ 条预算", "/ mục ngân sách")}</span></div><Link to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><ArrowUpRight size={20} /></Link></div>
        </div>
      </article>
    })}</div> : <EmptyState title={tv("还没有招募", "Chưa có tuyển dụng")} description={tv("写下创作需求，审核通过后会出现在招募广场。", "Viết nhu cầu sáng tạo, sau khi duyệt sẽ xuất hiện ở quảng trường tuyển dụng.")} action={tv("发布招募需求", "Đăng nhu cầu tuyển dụng")} to="/marketplace/recruits/new" />}
    <Pager listing={listing} page={page} change={changePage} />
  </section>
}

function MineWorks({ listing, loading, page, changePage, remove }: { listing: Listing | null; loading: boolean; page: number; changePage: (value: number) => void; remove: (item: Row) => void }) {
  return <section className="pf-market-discover pf-market-mine">
    <header className="pf-discover-heading"><div><span className="pf-market-kicker">{tv("单视频与短剧", "Video đơn và phim ngắn")}</span><h1>{tv("我的作品", "Tác phẩm của tôi")}</h1><p>{tv("草稿、审核和已上架的作品都在这里。", "Bản nháp, đang duyệt và tác phẩm đã đăng đều ở đây.")}</p></div><Button variant="dark" to="/marketplace/works/new" icon>{tv("发布作品", "Đăng tác phẩm")}<ArrowUpRight size={17} /></Button></header>
    {loading || !listing ? <div key="loading" className="pf-market-grid" role="status">{[0, 1, 2].map(item => <div key={item} className="pf-market-skeleton"><div /><span /><span /></div>)}</div> : listing.items.length ? <div key="ready" className="pf-market-grid">{listing.items.map(item => {
      const href = mineHref(item)
      const free = freeMine(item)
      const copyrightPrice = item.kind === 'series' ? item.copyright_price_fen ?? item.price_fen : item.price_fen
      return <article className="pf-market-item" key={`${item.kind}-${item.id}`}>
        <div className="pf-market-item-cover">{item.cover_asset_id ? <Media kind={item.kind === 'series' ? 'series' : 'work'} id={item.id} purpose="cover" /> : <span className="pf-market-series-mark"><Film size={36} /></span>}<Link className="pf-market-cover-play" to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><Play size={16} /></Link></div>
        <div className="pf-market-item-body">
          <h3><Link to={href}>{item.title}</Link></h3>
          <p className="pf-market-author"><span>{item.kind === 'series' ? tv('剧', 'Phim') : tv('作', 'Tác phẩm')}</span>{mineStatus(item)}{item.kind === 'series' ? tv(` · ${item.episode_count || 0} 集`, ` · ${item.episode_count || 0} tập`) : ''}</p>
          <div className="pf-market-item-price"><div><strong>{free ? tv('免费', 'Miễn phí') : item.kind === 'series' && item.sale_type === 'platform_unlock' ? tv('按集解锁', 'Mở khóa theo tập') : money(item.sale_type === 'platform_unlock' ? item.unlock_price_fen : copyrightPrice)}</strong>{!free && <span>{item.sale_type === 'platform_unlock' ? item.kind === 'series' ? tv('分集定价', 'Định giá theo tập') : tv('解锁价', 'Giá mở khóa') : tv('参考价', 'Giá tham khảo')}</span>}</div><button type="button" onClick={() => remove(item)}>{tv("删除", "Xóa")}</button><Link to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><ArrowUpRight size={20} /></Link></div>
        </div>
      </article>
    })}</div> : <EmptyState title={tv("还没有作品", "Chưa có tác phẩm")} description={tv("单条视频和短剧都会出现在这里。", "Video đơn và phim ngắn đều hiển thị ở đây.")} action={tv("发布我的作品", "Đăng tác phẩm của tôi")} to="/marketplace/works/new" />}
    <Pager listing={listing} page={page} change={changePage} />
  </section>
}

// 所有列表由后端按当前账号隔离；不与原个人中心数据混合。
export default function Workspace() {
  /* kind 工作台分类；listing/page 当前列表；refresh 重新读取；mediaId 当前文件预览。 */
  const [kind, setKind] = useState('works')
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mediaId, setMediaId] = useState<number | null>(null)
  useEffect(() => { let active = true; setLoading(true); setListing(null); setError(''); request<Listing>(`/mine/${kind}?page=${page}`).then(value => { if (active) setListing(value) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [kind, page, refresh])
  async function action(path: string) { try { await request(path, 'POST'); setRefresh(v => v + 1) } catch (e) { setError((e as Error).message) } }
  async function removeOwned(item: Row) {
    const ok = await dialog.confirm({ title: tv('删除作品', 'Xóa tác phẩm'), message: tv(`删除后「${item.title || '未命名作品'}」会从我的作品和作品广场撤下。文件和审核记录会保留，但不能再展示。`, `Sau khi xóa, “${item.title || '未命名作品'}” sẽ bị gỡ khỏi tác phẩm của tôi và quảng trường tác phẩm. Tệp và bản ghi duyệt được giữ lại nhưng không thể hiển thị nữa.`), confirmText: tv('删除', 'Xóa'), tone: 'danger' })
    if (!ok || !item.id) return
    try { await request(item.kind === 'series' ? `/series/${item.id}` : `/works/${item.id}`, 'DELETE'); setRefresh(value => value + 1) } catch (e) { setError((e as Error).message) }
  }
  const tabs = { works: tv('我的作品', 'Tác phẩm của tôi'), series: tv('我的短剧', 'Phim ngắn của tôi'), recruits: tv('我的招募', 'Tuyển dụng của tôi'), rights: tv('版权材料', 'Tài liệu bản quyền'), assets: tv('我的文件', 'Tệp của tôi'), notifications: tv('站内通知', 'Thông báo trong site') }
  return <><PageHeading title={tv("我的发布与业务进度", "Đăng và tiến độ nghiệp vụ của tôi")} description={tv("从作品草稿到合作机会，在这里跟进作品发布与需求审核。招募接单请联系客服。", "Từ bản nháp tác phẩm đến cơ hội hợp tác, theo dõi việc đăng tác phẩm và duyệt nhu cầu tại đây. Nhận việc tuyển dụng vui lòng liên hệ CSKH.")} /><p><Link to="/marketplace/authorization">{tv("签署 / 查看 PrintFilm 授权函", "Ký / Xem thư ủy quyền PrintFilm")}</Link></p>
    <div className="pf-market-workspace-toolbar"><nav className="pf-market-tabs" aria-label={tv("个人业务分类", "Phân loại nghiệp vụ cá nhân")}>{Object.entries(tabs).map(([key, label]) => <button key={key} type="button" aria-pressed={key === kind} onClick={() => { setKind(key); setPage(1); setMediaId(null); setListing(null); setLoading(true) }}>{label}</button>)}</nav><button type="button" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={14} />{tv("刷新", "Làm mới")}</button></div>
    {error && <p role="alert">{error}</p>}
    {kind === 'works' ? <MineWorks listing={listing} loading={loading} page={page} changePage={setPage} remove={item => void removeOwned(item)} /> : kind === 'recruits' ? <MineRecruits listing={listing} loading={loading} page={page} changePage={setPage} /> : <>
      {kind === 'series' && <section className="pf-market-discover pf-market-mine"><header className="pf-discover-heading"><div><span className="pf-market-kicker">{tv("剧集资产", "Tài sản phim nhiều tập")}</span><h1>{tv("我的短剧", "Phim ngắn của tôi")}</h1><p>{tv("查看短剧草稿、统一审核和上架状态。", "Xem bản nháp phim ngắn, duyệt thống nhất và trạng thái đăng.")}</p></div><Button variant="dark" to="/marketplace/works/new?type=series" icon>{tv("发布短剧", "Đăng phim ngắn")}<ArrowUpRight size={17} /></Button></header>{loading || !listing ? <div key="loading" className="pf-market-grid" role="status">{[0, 1, 2].map(item => <div key={item} className="pf-market-skeleton"><div /><span /><span /></div>)}</div> : listing.items.length ? <div key="ready" className="pf-market-grid">{listing.items.map(item => { const href = `/marketplace/series/${item.id}/edit`; const free = item.sale_type === 'free'; const price = item.copyright_price_fen ?? item.price_fen; return <article className="pf-market-item" key={`series-${item.id}`}><div className="pf-market-item-cover">{item.cover_asset_id ? <Media kind="series" id={item.id} purpose="cover" /> : <span className="pf-market-series-mark"><Film size={36} /></span>}<Link className="pf-market-cover-play" to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><Play size={16} /></Link></div><div className="pf-market-item-body"><h3><Link to={href}>{item.title}</Link></h3><p className="pf-market-author"><span>{tv("剧", "Phim")}</span>{mineStatus(item)} · {item.episode_count || 0} {tv("集", "tập")}</p><div className="pf-market-item-price"><div><strong>{free ? tv('免费', 'Miễn phí') : item.sale_type === 'platform_unlock' ? tv('按集解锁', 'Mở khóa theo tập') : money(price)}</strong>{!free && <span>{item.sale_type === 'platform_unlock' ? tv('分集定价', 'Định giá theo tập') : tv('参考价', 'Giá tham khảo')}</span>}</div><Link to={href} aria-label={tv(`管理${item.title}`, `Quản lý ${item.title}`)}><ArrowUpRight size={20} /></Link></div></div></article> })}</div> : <EmptyState title={tv("还没有短剧", "Chưa có phim ngắn")} description={tv("创建系列后，可逐集上传或导入漫剧分集。", "Sau khi tạo series, có thể tải lên hoặc nhập từng tập phim truyện.")} action={tv("发布短剧", "Đăng phim ngắn")} to="/marketplace/works/new?type=series" />}<Pager listing={listing} page={page} change={setPage} /></section>}
      {kind !== 'series' && kind !== 'recruits' && <>{loading ? <div className="pf-market-empty" role="status">{tv("正在读取你的业务进度…", "Đang đọc tiến độ nghiệp vụ của bạn…")}</div> : listing?.items.map(item => <article className="pf-market-workspace-item" key={item.id}>
        <div className="pf-market-record-head"><h2>{item.title || item.filename || item.recruit_title || item.message || tv(`记录 #${item.id}`, `Bản ghi #${item.id}`)}</h2><span className="pf-market-badge">{item.blocked ? tv('已限制', 'Đã hạn chế') : item.withdrawn ? tv('已撤回', 'Đã thu hồi') : labels[item.audit_status ?? item.status ?? item.state ?? item.selection ?? ''] || (kind === 'notifications' ? item.read ? tv('已读', 'Đã đọc') : tv('未读', 'Chưa đọc') : tv('业务记录', 'Bản ghi nghiệp vụ'))}</span></div>
        <p>{date(item.created_at)} {tv("· 编号 #", "· Mã #")}{item.id}</p>
        {(item.reason || item.note || item.error) && <p className="pf-market-record-note">{item.reason || item.note || (item.error ? explainMarketplaceError(item.error) : '')}</p>}
        {kind === 'assets' && <><p>{tv("文件类型：", "Loại tệp:")}{fileKindNames[item.kind || ''] || tv('文件', 'Tệp')}</p><button type="button" onClick={() => setMediaId(mediaId === item.id ? null : item.id)}>{mediaId === item.id ? tv('收起预览', 'Thu gọn xem trước') : tv('查看文件预览', 'Xem trước tệp')}</button>{mediaId === item.id && <AssetPreview id={item.id} />}{item.status === 'failed' && <button type="button" onClick={() => action(`/assets/${item.id}/retry`)}>{tv("重新校验文件", "Kiểm tra lại tệp")}</button>}{item.kind === 'video' && item.status === 'ready' && <Link to={`/marketplace/assets/${item.id}/rights?return=${encodeURIComponent('/marketplace/mine')}`}>{tv("查看版权材料", "Xem tài liệu bản quyền")}</Link>}</>}
        {kind === 'rights' && <><p>{tv("材料状态：", "Trạng thái tài liệu:")}{labels[item.full_status ?? ''] || tv('待补充', 'Chờ bổ sung')}</p><p>{tv("版权材料随作品一并提交审核，无需单独申请审核。", "Tài liệu bản quyền được gửi duyệt cùng tác phẩm, không cần xin duyệt riêng.")}</p><Link to={`/marketplace/assets/${item.asset_id}/rights?return=${encodeURIComponent('/marketplace/mine')}`}>{tv("查看与补充材料", "Xem và bổ sung tài liệu")}</Link></>}
        {kind === 'notifications' && <>{item.link && <Link to={item.link}>{tv("前往工作台", "Đến bàn làm việc")}</Link>}<button type="button" disabled={item.read} onClick={() => action(`/notifications/${item.id}/read`)}>{item.read ? tv('已读', 'Đã đọc') : tv('标记已读', 'Đánh dấu đã đọc')}</button></>}
      </article>)}
      {!loading && !error && listing?.items.length === 0 && kind !== 'recruits' && <EmptyState title={tv("这里还没有记录", "Chưa có bản ghi nào ở đây")} description={kind === 'notifications' ? tv('发布及审核状态发生变化时，通知会出现在这里。', 'Khi trạng thái đăng và duyệt thay đổi, thông báo sẽ xuất hiện ở đây.') : tv('你的需求与合作进展，都会在这里留下记录。', 'Nhu cầu và tiến triển hợp tác của bạn đều lưu lại ở đây.')} />}
      <Pager listing={listing} page={page} change={setPage} /></>}
    </>}
  </>
}
