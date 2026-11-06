import { useCategories } from './useCategories'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Clock3, Film, Handshake, Play, Search, ShieldCheck, SlidersHorizontal, UsersRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import { date, money, request, type Listing, type Row } from './api'
import { Media, Pager } from './shared'
import { EmptyState } from './ui'
import { isFreeWork } from './playbackPolicy'
import { tv } from '../../i18n/tv'

function plazaHref(item: Row, recruits: boolean) {
  if (item.kind === 'series') return `/marketplace/series/${item.id}`
  return `/marketplace/${recruits ? 'recruits' : 'works'}/${item.id}`
}

function freeListing(item: Row) {
  return isFreeWork(item)
}

// 公开广场只展示后端过滤通过的单视频、短剧或需求。
export default function Gallery({ recruits = false }: { recruits?: boolean }) {
  /* listing 服务端分页；query 已提交筛选；page 当前页；revision 手动重试；formRef 重置筛选。 */
  const { names: categories, error: categoryError } = useCategories()
  const [listing, setListing] = useState<Listing | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [category, setCategory] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    request<Listing>(`/${recruits ? 'recruits' : 'works'}?${query}&page=${page}`).then(value => { if (active) setListing(value) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, page, recruits, revision])
  // 筛选提交后从第一页查询，金额转分并由服务端执行分页。
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const params = new URLSearchParams()
    for (const key of ['q', 'category', 'sort']) if (form.get(key)) params.set(key, String(form.get(key)))
    for (const [field, key] of [['min', recruits ? 'min_budget' : 'min_price'], ['max', recruits ? 'max_budget' : 'max_price']]) if (form.get(field)) params.set(key, String(Math.round(Number(form.get(field)) * 100)))
    setPage(1); setQuery(params.toString()); setRevision(value => value + 1)
  }
  // 清空条件并恢复最新目录。
  function reset() { setCategory(''); formRef.current?.reset(); setPage(1); setQuery(''); setRevision(value => value + 1) }
  const filtered = [...new URLSearchParams(query)].some(([key, value]) => key !== 'sort' && value)
  return <div className={recruits ? 'pf-market-recruit-gallery' : 'pf-market-discover'}>
    {!recruits && <header className="pf-discover-heading"><div><span className="pf-market-kicker">{tv("创作有价值 · 灵感有回响", "Sáng tạo có giá trị · Cảm hứng có tiếng vang")}</span><h1>{tv("发现好作品", "Khám phá tác phẩm hay")}</h1><p>{tv("从一帧灵感，到下一次合作。探索创作者的数字影像。", "Từ một khung hình cảm hứng đến lần hợp tác tiếp theo. Khám phá hình ảnh số của các nhà sáng tạo.")}</p></div><Button variant="dark" to="/marketplace/works/new" icon>{tv("发布作品", "Đăng tác phẩm")}<ArrowUpRight size={17} /></Button></header>}
    <section className={`pf-market-hero${recruits ? ' is-recruit' : ''}`}>
      <div className="pf-market-hero-copy"><span className="pf-market-kicker">{recruits ? tv('连接需求与创作', 'Kết nối nhu cầu và sáng tạo') : tv('让创作，继续发生', 'Để sáng tạo tiếp tục diễn ra')}</span><h1>{recruits ? <>{tv("发现值得投入的", "Khám phá")}<br /><em>{tv("下一个创作机会。", "cơ hội sáng tạo tiếp theo đáng đầu tư.")}</em></> : <>{tv("让好作品，", "Để tác phẩm hay")}<br /><em>{tv("遇见新的价值。", "gặp giá trị mới.")}</em></>}</h1><p>{recruits ? tv('寻找适合你的创作需求，先联系平台客服，开启下一次合作。', 'Tìm nhu cầu sáng tạo phù hợp với bạn, liên hệ CSKH nền tảng trước, bắt đầu lần hợp tác tiếp theo.') : tv('发现创作者的优质视频，也让你的作品被更多人看见。', 'Khám phá video chất lượng của các nhà sáng tạo, cũng để tác phẩm của bạn được nhiều người thấy hơn.')}</p><Button variant="dark" to={recruits ? '/marketplace/recruits/new' : '/marketplace/works/new'} icon>{recruits ? tv('发布我的需求', 'Đăng nhu cầu của tôi') : tv('发布我的作品', 'Đăng tác phẩm của tôi')}<ArrowUpRight size={17} /></Button></div>
      <div className="pf-market-hero-art" aria-hidden="true"><div className="pf-market-art-orbit" /><div className="pf-market-art-frame pf-market-art-back"><Film size={27} /><span>CREATIVE ASSETS</span></div><div className="pf-market-art-frame pf-market-art-front"><div className="pf-market-art-top"><span>PRINTFILM</span><span>● ● ●</span></div><div className="pf-market-art-play">{recruits ? <UsersRound size={40} strokeWidth={1.3} /> : <Play size={38} strokeWidth={1.2} />}</div><div className="pf-market-art-bottom"><span>{recruits ? tv('灵感与需求，在此相遇', 'Cảm hứng và nhu cầu gặp nhau ở đây') : tv('每一份创作，都有新的可能', 'Mỗi sáng tạo đều có khả năng mới')}</span><ArrowUpRight size={20} /></div></div><span className="pf-market-art-label"><Handshake size={16} />{tv("连接创作与合作", "Kết nối sáng tạo và hợp tác")}</span></div>
    </section>
    <div className="pf-market-principles"><span><ShieldCheck size={17} />{recruits ? tv('招募需求人工审核', 'Duyệt thủ công nhu cầu tuyển dụng') : tv('权属材料人工核验', 'Xác minh thủ công tài liệu quyền sở hữu')}</span><span><Film size={17} />{recruits ? tv('意向接单 · 先联系客服', 'Ý định nhận việc · Liên hệ CSKH trước') : tv('免费完整观看 · 收费先试看', 'Xem trọn vẹn miễn phí · Thu phí thì xem thử trước')}</span><span><Handshake size={17} />{recruits ? tv('客服撮合 · 线下确认合作', 'CSKH kết nối · Xác nhận hợp tác ngoại tuyến') : tv('版权出售 · 平台投放', 'Bán bản quyền · Quảng bá nền tảng')}</span></div>
    <section className="pf-market-catalog" aria-labelledby="market-catalog-title">
      <header className="pf-market-section-heading"><div><h2 id="market-catalog-title">{recruits ? tv('招募广场', 'Quảng trường tuyển dụng') : tv('作品广场', 'Quảng trường tác phẩm')}</h2><p>{recruits ? tv('明确的创作需求，寻找合适的合作伙伴。', 'Nhu cầu sáng tạo rõ ràng, tìm đối tác phù hợp.') : tv('浏览已审核上架的单视频和短剧。', 'Duyệt các video đơn và phim ngắn đã được duyệt và đăng.')}</p></div><span className="pf-market-count">{loading ? tv('正在更新', 'Đang cập nhật') : `${listing?.meta.total ?? 0} ${recruits ? tv('个需求', 'nhu cầu') : tv('件作品', 'tác phẩm')}`}</span></header>
      {!recruits && categoryError && <p role="alert">{categoryError}</p>}<form ref={formRef} className="pf-market-filter-panel" onSubmit={search}>
        {!recruits && <div className="pf-discover-categories" aria-label={tv("作品分类", "Danh mục tác phẩm")}>{['', ...categories].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); const params = new URLSearchParams(query); if (value) params.set('category', value); else params.delete('category'); setQuery(params.toString()); setPage(1) }}>{value || tv('全部作品', 'Tất cả tác phẩm')}</button>)}</div>}
        <div className="pf-market-filter-top"><label className="pf-market-search"><Search size={18} aria-hidden /><input name="q" aria-label={tv("关键词", "Từ khóa")} placeholder={recruits ? tv('搜索需求名称，发现创作机会', 'Tìm tên nhu cầu, khám phá cơ hội sáng tạo') : tv('搜索作品名称，发现更多创意', 'Tìm tên tác phẩm, khám phá thêm ý tưởng')} maxLength={100} /></label><select name="sort" aria-label={tv("排序", "Sắp xếp")}><option value="latest">{tv("最新发布", "Mới đăng nhất")}</option>{recruits ? <option value="deadline">{tv("最近截止", "Sắp đến hạn")}</option> : <><option value="price_asc">{tv("价格从低到高", "Giá từ thấp đến cao")}</option><option value="price_desc">{tv("价格从高到低", "Giá từ cao đến thấp")}</option></>}</select><Button variant="dark" type="submit"><Search size={16} />{tv("搜索", "Tìm kiếm")}</Button></div>
        <div className="pf-market-filter-bottom"><span className="pf-market-filter-label"><SlidersHorizontal size={15} />{tv("筛选", "Lọc")}</span><label className="pf-market-category"><span>{tv("分类", "Danh mục")}</span><input name="category" value={category} onChange={e => setCategory(e.target.value)} aria-label={tv("分类", "Danh mục")} placeholder={tv("全部分类", "Tất cả danh mục")} list="market-categories" maxLength={60} /><datalist id="market-categories">{(recruits ? [tv('短片', 'Phim ngắn'), tv('广告', 'Quảng cáo'), tv('动画', 'Hoạt hình'), tv('文旅', 'Du lịch văn hóa'), tv('科普', 'Khoa học'), tv('其他', 'Khác')] : categories).map(value => <option key={value} value={value} />)}</datalist></label><div className="pf-market-price-filter"><span>{recruits ? tv('单条预算', 'Ngân sách mỗi mục') : tv('参考价', 'Giá tham khảo')}</span><input name="min" type="number" min="0" step="0.01" aria-label={tv("最低价", "Giá thấp nhất")} placeholder={tv("¥ 最低", "¥ thấp nhất")} /><span>—</span><input name="max" type="number" min="0" step="0.01" aria-label={tv("最高价", "Giá cao nhất")} placeholder={tv("¥ 最高", "¥ cao nhất")} /></div><button type="button" className="pf-market-reset" onClick={reset}>{tv("重置筛选", "Đặt lại bộ lọc")}</button></div>
      </form>
      {error ? <div className="pf-market-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{tv("重新加载", "Tải lại")}</Button></div> : loading ? <div className="pf-market-grid" role="status" aria-label={tv("正在加载作品与需求", "Đang tải tác phẩm và nhu cầu")}>{[0, 1, 2].map(item => <div key={item} className="pf-market-skeleton"><div /><span /><span /></div>)}</div> : listing?.items.length ? <div className={`pf-market-grid${recruits ? ' is-recruits' : ''}`}>{listing.items.map(item => {
        const href = plazaHref(item, recruits)
        const free = !recruits && freeListing(item)
        return <article className="pf-market-item" key={`${item.kind || (recruits ? 'recruit' : 'work')}-${item.id}`}>
        {recruits ? <><div className="pf-market-item-cover">{item.image_ids?.length ? <Media kind="recruit" id={item.id} purpose="image-0" /> : <span className="pf-market-series-mark"><UsersRound size={36} strokeWidth={1.4} /></span>}<span className="pf-market-badge">{tv("征集中", "Đang thu thập")}</span><Link className="pf-market-cover-play" to={href} aria-label={tv(`查看需求：${item.title}`, `Xem nhu cầu: ${item.title}`)}><ArrowUpRight size={16} /></Link></div>
        <div className="pf-market-item-body"><span className="pf-market-category-tag">{item.category}</span><h3><Link to={href}>{item.title}</Link></h3><p className="pf-market-author"><span>{item.author?.slice(0, 1) || tv('创', 'Tạo')}</span>{item.author || tv('创作者', 'Nhà sáng tạo')}</p><div className="pf-market-item-price"><div><strong>{money(item.budget_fen)}</strong><span>{tv("/ 条预算", "/ mục ngân sách")}</span></div><Link to={href} aria-label={tv(`查看${item.title}详情`, `Xem chi tiết ${item.title}`)}><ArrowUpRight size={20} /></Link></div><div className="pf-market-item-foot"><Clock3 size={13} /><span>{tv("截止", "Hạn chót")} {date(item.deadline_at)} {tv("· 征集", "· Thu thập")} {item.wanted_count} {tv("条", "mục")}</span></div></div></> : <><div className="pf-market-item-cover">{item.kind === 'series' && !item.cover_asset_id ? <span className="pf-market-series-mark"><Film size={36} /></span> : <Media kind={item.kind === 'series' ? 'series' : 'work'} id={item.id} purpose="cover" />}<Link className="pf-market-cover-play" to={href} aria-label={tv(`查看作品：${item.title}`, `Xem tác phẩm: ${item.title}`)}><Play size={16} /></Link></div>
        <div className="pf-market-item-body"><span className="pf-market-category-tag">{item.kind === 'series' ? tv('短剧', 'Phim ngắn') : item.category}</span><h3><Link to={href}>{item.title}</Link></h3><p className="pf-market-author"><span>{item.author?.slice(0, 1) || tv('创', 'Tạo')}</span>{item.author || tv('创作者', 'Nhà sáng tạo')}</p><div className="pf-market-item-price"><div><strong>{free ? tv('免费', 'Miễn phí') : item.kind === 'series' && item.sale_type === 'platform_unlock' ? tv('按集解锁', 'Mở khóa theo tập') : money(item.sale_type === 'platform_unlock' ? item.unlock_price_fen : item.price_fen)}</strong>{item.kind === 'series' ? <span>{item.episode_count || 0} {tv("集", "tập")}{item.free_episode_count ? tv(` · 前${item.free_episode_count}集免费`, ` · ${item.free_episode_count} tập đầu miễn phí`) : ''}</span> : (!free) && <span>{item.sale_type === 'platform_unlock' ? tv('解锁价', 'Giá mở khóa') : tv('参考价', 'Giá tham khảo')}</span>}</div><Link to={href} aria-label={tv(`查看${item.title}详情`, `Xem chi tiết ${item.title}`)}><ArrowUpRight size={20} /></Link></div><div className="pf-market-item-foot"><Check size={14} /><span>{item.kind === 'series' ? tv('短剧 · 权属材料已核验', 'Phim ngắn · Đã xác minh tài liệu quyền sở hữu') : tv('权属材料已核验', 'Đã xác minh tài liệu quyền sở hữu')}</span></div></div></>}
      </article>})}</div> : <EmptyState title={filtered ? tv('暂时没有找到匹配结果', 'Tạm thời không tìm thấy kết quả phù hợp') : recruits ? tv('下一个好项目，从你的需求开始', 'Dự án hay tiếp theo bắt đầu từ nhu cầu của bạn') : tv('好作品，值得被更多人看见', 'Tác phẩm hay xứng đáng được nhiều người thấy')} description={filtered ? tv('试试其他关键词，或放宽分类和价格范围。', 'Hãy thử từ khóa khác, hoặc nới rộng danh mục và khoảng giá.') : recruits ? tv('当前暂无公开招募。写下你的创作需求，寻找合适的创作者。', 'Hiện chưa có tuyển dụng công khai. Hãy viết nhu cầu sáng tạo của bạn để tìm nhà sáng tạo phù hợp.') : tv('当前暂无已审核上架的作品。上传你的作品，完成核验后开启展示。', 'Hiện chưa có tác phẩm nào được duyệt và đăng. Hãy tải tác phẩm của bạn lên, hoàn tất xác minh rồi bật hiển thị.')} action={filtered ? undefined : recruits ? tv('发布第一份需求', 'Đăng nhu cầu đầu tiên') : tv('发布我的作品', 'Đăng tác phẩm của tôi')} to={recruits ? '/marketplace/recruits/new' : '/marketplace/works/new'}>{filtered && <Button variant="outline" onClick={reset}>{tv("清空筛选条件", "Xóa điều kiện lọc")}</Button>}</EmptyState>}
      <Pager listing={listing} page={page} change={setPage} />
    </section>
    <p className="pf-market-footnote">{recruits ? tv('接单请先联系平台客服，具体合作条件在线下协商确认。', 'Muốn nhận việc hãy liên hệ CSKH nền tảng trước, điều kiện hợp tác cụ thể được thương lượng và xác nhận ngoại tuyến.') : tv('版权合作参考价以客服洽谈为准；观众解锁价用于购买在线播放权益，不包含版权转让。版权转让手续及相关费用请与客服确认。', 'Giá tham khảo hợp tác bản quyền lấy theo trao đổi với CSKH; giá mở khóa cho khán giả dùng để mua quyền phát trực tuyến, không bao gồm chuyển nhượng bản quyền. Thủ tục và chi phí chuyển nhượng bản quyền vui lòng xác nhận với CSKH.')}</p>
  </div>
}




