import { useCategories } from './useCategories'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import SeriesEditor from './SeriesEditor'
import AssetPicker from './AssetPicker'
import { request, type Handoff, type Row } from './api'
import { Save } from 'lucide-react'
import Button from '../../components/ui/Button'
import { FormSection, PageHeading, PublishGuide } from './ui'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'



function PublishKindChooser({ choose }: { choose: (kind: 'video' | 'series') => void }) {
  const navigate = useNavigate()
  return <>
    <PageHeading title={tv("发布作品", "Đăng tác phẩm")} description={tv("单条视频和短剧都会出现在作品广场。也可以直接选择已经在 PrintFilm 生成的成片。", "Video đơn và phim ngắn đều xuất hiện ở quảng trường tác phẩm. Cũng có thể chọn thẳng phim đã tạo trên PrintFilm.")} back="/marketplace" />
    <div className="pf-market-kind-choice">
      <button type="button" onClick={() => choose('video')}><strong>{tv("单条视频", "Video đơn")}</strong><span>{tv("上传视频与封面，补充版权信息后统一提交审核。", "Tải video và ảnh bìa, bổ sung thông tin bản quyền rồi gửi duyệt cùng lúc.")}</span></button>
      <button type="button" onClick={() => choose('series')}><strong>{tv("短剧", "Phim ngắn")}</strong><span>{tv("在同一页继续添加分集，每集一个视频和封面。", "Tiếp tục thêm tập ở cùng trang, mỗi tập một video và một ảnh bìa.")}</span></button>
      <button type="button" onClick={() => navigate('/marketplace/from-printfilm')}><strong>{tv("从我的成片选择", "Chọn từ phim của tôi")}</strong><span>{tv("同步 PrintFilm 已生成的科普成片或漫剧分集，补充资料后提交审核。有效授权函会自动关联。", "Đồng bộ phim khoa học hoặc tập phim truyện đã tạo trên PrintFilm, bổ sung tài liệu rồi gửi duyệt. Thư ủy quyền còn hiệu lực sẽ tự động liên kết.")}</span></button>
    </div>
  </>
}

// 发布草稿独立于上游创作项目，未配置文件服务仍可保存文字。
export default function WorkEditor() {
  /* item 编辑快照；assetId 视频；coverId 自定义封面；error/busy 保存反馈。 */
  const { id } = useParams(); const navigate = useNavigate(); const [search] = useSearchParams()
  const [publishKind, setPublishKind] = useState<'video' | 'series' | ''>(search.get('type') === 'series' ? 'series' : '')
  const { names: categories, error: categoryError } = useCategories()
  const [category, setCategory] = useState('')
  useEffect(() => { if (!id && !category && categories.length) setCategory(categories.includes('其他') ? tv('其他', 'Khác') : categories[0]) }, [id, category, categories])
  const [item, setItem] = useState<Row | null>(null)
  const [assetId, setAssetId] = useState<number | null>(null)
  const [coverId, setCoverId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saleType, setSaleType] = useState<'free' | 'copyright_contact' | 'platform_unlock'>('copyright_contact')
  const [shareBps, setShareBps] = useState<number | null>(null)
  const [source, setSource] = useState('external')
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const handoffQuery = search.get('handoff')
  const syncing = handoff?.status === 'pending' || handoff?.status === 'running'
  useEffect(() => {
    if (!id && !handoffQuery) return
    let stop = false
    let timer = 0
    async function tick() {
      try {
        const value = handoffQuery
          ? await request<Handoff>(`/handoffs/${handoffQuery}`)
          : (await request<{ items: Handoff[] }>(`/handoffs?target_kind=work&target_id=${id}`)).items[0]
        if (stop || !value) return
        setHandoff(value)
        if (value.status === 'ready' && value.work_id) {
          const work = await request<Row>(`/works/${value.work_id}`)
          if (stop) return
          setAssetId(work.asset_id ?? null)
          setCoverId(work.cover_asset_id ?? null)
        }
        if (value.status === 'pending' || value.status === 'running') timer = window.setTimeout(tick, 3000)
      } catch (err) { if (!stop) setError((err as Error).message) }
    }
    void tick()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [id, handoffQuery, handoff?.status])
  useEffect(() => { if (id) request<Row>(`/works/${id}`).then(value => { setItem(value); setCategory(value.category || tv('其他', 'Khác')); setSaleType((value.sale_type as typeof saleType) || 'copyright_contact'); setShareBps(typeof value.share_bps === 'number' ? value.share_bps : null); setSource(value.source || 'external'); setAssetId(value.asset_id ?? null); setCoverId(value.cover_asset_id ?? null) }).catch(e => setError(e.message)) }, [id])
  // 完整表单更新携带版本，服务器决定是否重审。
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); const form = new FormData(e.currentTarget)
    const body = { title: form.get('title'), description: form.get('description'), category: form.get('category'), tags: String(form.get('tags')).split(/[,，]/).map(v => v.trim()).filter(Boolean), price_fen: saleType === 'free' ? 0 : Math.round(Number(form.get('price')) * 100), unlock_price_fen: saleType === 'platform_unlock' ? Math.round(Number(form.get('unlock_price')) * 100) : 0, share_bps: saleType === 'platform_unlock' ? shareBps : null, sale_type: saleType, source, license_scope: form.get('license_scope'), asset_id: assetId, cover_asset_id: coverId, ...(id ? { version: item?.version } : {}) }
    try { const result = await request<Row>(id ? `/works/${id}` : '/works', id ? 'PUT' : 'POST', body); navigate(`/marketplace/works/${result.id}/manage`) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  if (!id && publishKind === 'series') return <SeriesEditor />
  if (!id && !publishKind) return <PublishKindChooser choose={setPublishKind} />
  if (id && !item) return <p role={error ? 'alert' : 'status'}>{error || tv('正在加载作品…', 'Đang tải tác phẩm…')}</p>
  return <><PageHeading title={id ? tv('编辑作品', 'Chỉnh sửa tác phẩm') : tv('发布作品', 'Đăng tác phẩm')} description={tv("为作品建立一份清晰的介绍。资料可以先保存为草稿，提交时一次确认版权并交由管理员审核，通过后再上架。", "Tạo một bản giới thiệu rõ ràng cho tác phẩm. Tài liệu có thể lưu nháp trước, khi gửi sẽ xác nhận bản quyền một lần và giao quản trị viên duyệt, duyệt xong mới đăng.")} back="/marketplace" /><div className="pf-market-editor-layout"><div className="pf-market-editor-main"><form className="pf-market-form" onSubmit={save}>
    <p className="pf-market-notice">{tv("先保存作品草稿，提交审核前再统一确认版权信息。", "Lưu bản nháp tác phẩm trước, trước khi gửi duyệt sẽ xác nhận thống nhất thông tin bản quyền.")}</p>
    {handoff && <p className={handoff.status === 'failed' ? '' : 'pf-market-notice'} role={handoff.status === 'failed' ? 'alert' : 'status'}>{handoff.label}{handoff.error ? `：${explainMarketplaceError(handoff.error)}` : ''}。{handoff.status === 'ready' && !handoff.authorization_ready ? <button type="button" onClick={() => navigate('/marketplace/authorization')}>{tv("去签署授权函", "Đi ký thư ủy quyền")}</button> : null}{handoff.status === 'failed' && handoff.retryable !== false ? <button type="button" onClick={() => void request<Handoff>(`/handoffs/${handoff.id}/retry`, 'POST').then(setHandoff).catch(err => setError((err as Error).message))}>{tv("重新同步", "Đồng bộ lại")}</button> : handoff.status === 'failed' ? <span>{tv("请返回成片选择页，重新选择最新版本后同步。", "Vui lòng quay lại trang chọn phim, chọn lại phiên bản mới nhất rồi đồng bộ.")}</span> : null}</p>}    <FormSection step="01" title={tv("作品文件", "Tệp tác phẩm")} description={tv("视频和封面在提交审核前必填。保存草稿可以先只写文字。", "Video và ảnh bìa bắt buộc trước khi gửi duyệt. Lưu bản nháp có thể chỉ viết chữ trước.")}>
      <AssetPicker kind="video" required value={assetId} onChange={setAssetId} title={tv("作品视频", "Video tác phẩm")} /><AssetPicker kind="image" required value={coverId} onChange={setCoverId} title={tv("作品封面", "Ảnh bìa tác phẩm")} />
    </FormSection>
    <FormSection step="02" title={tv("介绍你的作品", "Giới thiệu tác phẩm của bạn")} description={tv("清晰的标题和简介，帮助感兴趣的人找到你。", "Tiêu đề và giới thiệu rõ ràng giúp người quan tâm tìm thấy bạn.")}><label>{tv("标题", "Tiêu đề")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><input name="title" required maxLength={200} placeholder={tv("给作品一个简洁、有辨识度的名字", "Đặt cho tác phẩm một cái tên ngắn gọn, dễ nhận diện")} defaultValue={item?.title} /></label><label>{tv("简介", "Giới thiệu")}<textarea name="description" maxLength={5000} placeholder={tv("介绍作品内容、创作想法与适用场景", "Giới thiệu nội dung tác phẩm, ý tưởng sáng tạo và bối cảnh phù hợp")} defaultValue={item?.description} /></label><div className="pf-market-field-row"><label>{tv("作品分类", "Danh mục tác phẩm")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><select name="category" required value={category} onChange={e => setCategory(e.target.value)} disabled={!categories.length}><option value="" disabled>{tv("请选择作品分类", "Vui lòng chọn danh mục tác phẩm")}</option>{category && !categories.includes(category) && <option value={category}>{category}{tv("（历史分类）", "(danh mục lịch sử)")}</option>}{categories.map(name => <option key={name} value={name}>{name}</option>)}</select>{categoryError && <span role="alert">{categoryError}</span>}</label><label>{tv("内容来源", "Nguồn nội dung")}<select name="source" value={source} onChange={e => setSource(e.target.value)}><option value="printfilm">{tv("PrintFilm 生成", "Do PrintFilm tạo")}</option><option value="external">{tv("其他平台生成", "Do nền tảng khác tạo")}</option>{!['printfilm', 'external'].includes(source) && <option value={source}>{tv("历史来源：", "Nguồn lịch sử:")}{source}</option>}</select></label></div><label>{tv("标签（逗号分隔，最多10个）", "Nhãn (cách nhau bằng dấu phẩy, tối đa 10)")}<input name="tags" placeholder={tv("例如：城市，航拍，生活", "Ví dụ: Đô thị, quay flycam, đời sống")} defaultValue={item?.tags?.join('，')} /></label></FormSection>
    <FormSection step="03" title={tv("收益与授权", "Doanh thu và cấp phép")} description={tv("选择作品的收益方式，并分别设置版权合作参考价与观众解锁价。", "Chọn cách chia doanh thu của tác phẩm, và đặt riêng giá tham khảo hợp tác bản quyền và giá mở khóa cho khán giả.")}><label>{tv("收益方式", "Cách chia doanh thu")}<select value={saleType} onChange={e => { const next = e.target.value as typeof saleType; setSaleType(next); if (next !== 'platform_unlock') setShareBps(null) }}><option value="free">{tv("免费公开", "Công khai miễn phí")}</option><option value="copyright_contact">{tv("版权出售收益", "Doanh thu bán bản quyền")}</option><option value="platform_unlock">{tv("平台投放收益", "Doanh thu quảng bá nền tảng")}</option></select></label>{saleType === 'free' ? <p className="pf-market-notice">{tv("免费作品审核通过并上架后，可完整观看原片，无需生成试看。免费不代表可任意商用，仍须遵守作者授权范围。", "Tác phẩm miễn phí sau khi duyệt và đăng có thể xem trọn bản gốc, không cần tạo bản xem thử. Miễn phí không có nghĩa được dùng thương mại tùy ý, vẫn phải tuân thủ phạm vi ủy quyền của tác giả.")}</p> : <><p className="pf-market-notice">{saleType === 'platform_unlock' ? tv('提交审核时生成无水印短试看，最长15秒且不超过原片时长的30%。审核通过后准备完整在线播放版本。观众购买后可永久在线播放所购版本，不包含版权转让；需在平台启用分成后才能提交审核。', 'Khi gửi duyệt sẽ tạo bản xem thử ngắn không watermark, dài tối đa 15 giây và không quá 30% thời lượng bản gốc. Sau khi duyệt sẽ chuẩn bị phiên bản phát trực tuyến hoàn chỉnh. Khán giả mua xong có thể phát trực tuyến vĩnh viễn phiên bản đã mua, không bao gồm chuyển nhượng bản quyền; cần nền tảng bật chia sẻ doanh thu mới gửi duyệt được.') : tv('提交审核时生成无水印短试看，最长15秒且不超过原片时长的30%。版权合作通过客服线下洽谈，最终价格、授权或转让范围及额外手续费用请与客服确认。', 'Khi gửi duyệt sẽ tạo bản xem thử ngắn không watermark, dài tối đa 15 giây và không quá 30% thời lượng bản gốc. Hợp tác bản quyền thương lượng ngoại tuyến qua CSKH, giá cuối, phạm vi cấp phép hoặc chuyển nhượng và các chi phí thủ tục phát sinh vui lòng xác nhận với CSKH.')}</p><label>{tv("参考价（元）", "Giá tham khảo (tệ)")}<input name="price" type="number" min="0" max="1000000" step="0.01" placeholder="0.00" defaultValue={item?.price_fen ? item.price_fen / 100 : ''} /><small>{tv("供版权合作洽谈参考；不代表已包含版权转让手续、登记或服务等费用。", "Dùng để tham khảo khi thương lượng hợp tác bản quyền; không có nghĩa đã bao gồm chi phí thủ tục chuyển nhượng bản quyền, đăng ký hay dịch vụ.")}</small></label>{saleType === 'platform_unlock' && <><label>{tv("观众解锁价（元）", "Giá mở khóa cho khán giả (tệ)")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><input name="unlock_price" type="number" required min="0.01" max="1000000" step="0.01" defaultValue={item?.unlock_price_fen ? item.unlock_price_fen / 100 : ''} /></label><label>{tv("平台抽成比例（万分比，可留空使用平台默认）", "Tỷ lệ chiết khấu nền tảng (phần vạn, có thể để trống để dùng mặc định của nền tảng)")}<input type="number" min="0" max="10000" step="1" value={shareBps ?? ''} onChange={e => setShareBps(e.target.value === '' ? null : Number(e.target.value))} placeholder={tv("例如 2000，表示平台20%、创作者80%", "Ví dụ 2000, nghĩa là nền tảng 20%, nhà sáng tạo 80%")} /><small>{tv("10000 表示 100%；留空时使用平台默认比例，单独设置时优先使用此处比例。", "10000 nghĩa là 100%; để trống dùng tỷ lệ mặc định của nền tảng, khi đặt riêng thì ưu tiên tỷ lệ ở đây.")}</small></label></>}</>}<label>{tv("拟授权用途及限制", "Mục đích và giới hạn dự kiến được cấp phép")}<span className="pf-req-mark">{tv("提交审核前必填", "Bắt buộc trước khi gửi duyệt")}</span><textarea name="license_scope" maxLength={3000} placeholder={tv("请说明允许的用途、范围和期限及禁止事项；保存草稿可暂不填，提交审核前必须补充", "Vui lòng nêu mục đích, phạm vi, thời hạn được phép và các điều cấm; lưu bản nháp có thể chưa điền, nhưng phải bổ sung trước khi gửi duyệt")} defaultValue={item?.license_scope} /></label></FormSection>
    {error && <p role="alert">{error}</p>}<div className="pf-market-form-actions"><p>{id ? tv('保存修改后，作品将退出公开展示并重新审核。', 'Sau khi lưu thay đổi, tác phẩm sẽ ngừng hiển thị công khai và được duyệt lại.') : tv('保存草稿不会公开发布，封面请自行上传。', 'Lưu bản nháp sẽ không đăng công khai, ảnh bìa vui lòng tự tải lên.')}</p><Button variant="lime" type="submit" disabled={busy || syncing || !categories.length || !category} icon><Save size={17} />{busy ? tv('保存中…', 'Đang lưu…') : syncing ? tv('正在同步成片…', 'Đang đồng bộ phim…') : tv('保存草稿', 'Lưu bản nháp')}</Button></div>
  </form></div><PublishGuide saleType={saleType} /></div></>
}











