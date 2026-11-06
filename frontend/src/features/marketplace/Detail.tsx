import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { date, labels, money, request, type Row } from './api'
import { Contact, Media, NeedLogin, ReportForm } from './shared'
import { PageHeading } from './ui'
import WorkPublishingSteps from './WorkPublishingSteps'
import { dialog } from '../../lib/dialog'
import { isFreeWork } from './playbackPolicy'
import { tv } from '../../i18n/tv'

// 公开详情与作者管理分离，招募统一由客服协调接单。
export default function Detail({ recruit = false, manage = false }: { recruit?: boolean; manage?: boolean }) {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [item, setItem] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [preview, setPreview] = useState(false)
  const [retryingPreview, setRetryingPreview] = useState(false)
  const previewActive = Boolean(item && !isFreeWork(item) && (item.preview_status === 'pending' || item.preview_status === 'running'))
  useEffect(() => { let active = true; setItem(null); setError(''); request<Row>(`/${recruit ? 'recruits' : 'works'}/${id}`).then(value => { if (active) setItem(value) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [id, recruit, refresh])
  // 状态操作只发意图；重复和过期版本由后端处理。
  async function action(path: string, body?: unknown) {
    setError(''); setMessage('')
    try { await request(path, 'POST', body); setMessage(tv('操作成功', 'Thao tác thành công')); setRefresh(v => v + 1) }
    catch (err) { setError((err as Error).message) }
  }
  useEffect(() => {
    if (!manage || recruit || (item?.audit_status !== 'processing' && !previewActive)) return
    let active = true
    const timer = window.setInterval(() => {
      request<Row>(`/works/${id}`).then(fresh => { if (active) setItem(fresh) }).catch(err => { if (active) setError(err.message) })
    }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [id, manage, recruit, item?.audit_status, previewActive])
  if (!item) return <p role={error ? 'alert' : 'status'}>{error || tv('正在加载…', 'Đang tải…')}</p>
  const privateView = manage && item.version !== undefined
  const submitIssues = [
    !item.asset_id ? tv('请先上传并保存作品视频。', 'Vui lòng tải lên và lưu video tác phẩm trước.') : item.media_status !== 'ready' ? tv('作品视频尚未就绪，请检查上传状态。', 'Video tác phẩm chưa sẵn sàng, vui lòng kiểm tra trạng thái tải lên.') : '',
    !item.rights_complete ? tv('请补齐版权材料（PrintFilm 授权函或其他平台版权证明）。', 'Vui lòng bổ sung tài liệu bản quyền (thư ủy quyền PrintFilm hoặc chứng minh bản quyền của nền tảng khác).') : '',
    !item.license_scope?.trim() ? tv('请在“编辑草稿 → 收益与授权”中填写“拟授权用途及限制”。', 'Vui lòng điền “Mục đích và giới hạn dự kiến được cấp phép” trong “Chỉnh sửa bản nháp → Doanh thu và cấp phép”.') : '',
    item.blocked ? tv('作品已被限制，请联系客服处理。', 'Tác phẩm đã bị hạn chế, vui lòng liên hệ CSKH xử lý.') : '',
  ].filter(Boolean)
  const canSubmitWork = submitIssues.length === 0
  async function refreshProgress() {
    try { setItem(await request<Row>(`/works/${id}`)) } catch (e) { setError((e as Error).message) }
  }
  async function retryPreview() {
    if (!item || retryingPreview || previewActive) return
    setRetryingPreview(true); setError(''); setMessage('')
    try {
      setItem(await request<Row>(`/works/${id}/preview/retry`, 'POST', { version: item.version }))
      setMessage(tv('已重新排队生成短试看，可在此查看处理进度。', 'Đã xếp hàng lại để tạo bản xem thử ngắn, có thể xem tiến độ xử lý tại đây.'))
    } catch (err) { setError((err as Error).message) } finally { setRetryingPreview(false) }
  }
  async function removeWork() {
    const ok = await dialog.confirm({ title: tv('删除作品', 'Xóa tác phẩm'), message: tv('删除后作品会从我的作品和作品广场撤下。文件和审核记录会保留，但不能再展示。', 'Sau khi xóa, tác phẩm sẽ bị gỡ khỏi tác phẩm của tôi và quảng trường tác phẩm. Tệp và bản ghi duyệt được giữ lại nhưng không thể hiển thị nữa.'), confirmText: tv('删除', 'Xóa'), tone: 'danger' })
    if (!ok) return
    try { await request(`/works/${id}`, 'DELETE'); navigate('/marketplace/mine') } catch (err) { setError((err as Error).message) }
  }
  if (manage && !privateView) return <p role="alert">{tv("无权管理此记录，请从广场查看公开详情。", "Không có quyền quản lý bản ghi này, vui lòng xem chi tiết công khai từ quảng trường.")}</p>
  // 广场详情面向浏览与购买；作者管理仅从独立管理路由进入。
  if (!recruit && !manage) return <>
    <PageHeading title={item.title || tv('作品详情', 'Chi tiết tác phẩm')} description={`${item.author || tv('创作者', 'Nhà sáng tạo')} · ${item.category || tv('其他', 'Khác')}`} back="/marketplace" />
    <div className="pf-market-buyer-layout">
      <section className="pf-market-buyer-player" aria-label={tv("作品视频预览", "Xem trước video tác phẩm")}><Media kind="work" id={id} purpose="preview" video /></section>
      <aside className="pf-market-buyer-info"><span className="pf-market-badge">{tv("视频作品", "Tác phẩm video")}</span><h2>{item.title}</h2><p>{tv("创作者 ·", "Nhà sáng tạo ·")} {item.author || tv('创作者', 'Nhà sáng tạo')}</p><div className="pf-market-buyer-price"><span>{isFreeWork(item) ? tv('免费公开', 'Công khai miễn phí') : item.sale_type === 'platform_unlock' ? tv('观众解锁价', 'Giá mở khóa cho khán giả') : tv('参考价', 'Giá tham khảo')}</span><strong>{isFreeWork(item) ? tv('免费', 'Miễn phí') : money(item.sale_type === 'platform_unlock' ? item.unlock_price_fen : item.price_fen)}</strong></div>{item.sale_type === 'copyright_contact' && <Contact kind="work" id={id} />}<small>{isFreeWork(item) ? tv('免费作品可看完整时长，播放原片。使用仍须遵守作者授权范围。', 'Tác phẩm miễn phí xem được trọn thời lượng, phát bản gốc. Việc sử dụng vẫn phải tuân thủ phạm vi ủy quyền của tác giả.') : item.sale_type === 'platform_unlock' ? tv('购买后可永久在线播放所购版本，不包含版权转让。当前网页仅提供短试看。', 'Sau khi mua có thể phát trực tuyến vĩnh viễn phiên bản đã mua, không bao gồm chuyển nhượng bản quyền. Trang web hiện chỉ cung cấp bản xem thử ngắn.') : tv('当前为无水印短试看，最长15秒且不超过原片时长的30%。版权合作请联系客服，确认价格、授权或转让范围及交付方式。', 'Hiện là bản xem thử ngắn không watermark, dài tối đa 15 giây và không quá 30% thời lượng bản gốc. Về hợp tác bản quyền, vui lòng liên hệ CSKH để xác nhận giá, phạm vi cấp phép hoặc chuyển nhượng và cách bàn giao.')}</small><ReportForm kind="work" id={id} /></aside>
    </div>
    <section className="pf-market-detail-section"><h2>{tv("作品介绍", "Giới thiệu tác phẩm")}</h2><p className="pf-market-text">{item.description || tv('暂未填写详细介绍', 'Chưa điền giới thiệu chi tiết')}</p><h2>{tv("用途及授权意向", "Mục đích và ý định cấp phép")}</h2><p className="pf-market-text">{item.license_scope || tv('具体授权范围请联系客服确认', 'Phạm vi cấp phép cụ thể vui lòng liên hệ CSKH xác nhận')}</p><p>{tv("内容审核已通过，版权材料已核验。", "Đã duyệt nội dung, đã xác minh tài liệu bản quyền.")}{item.sale_type === 'copyright_contact' ? tv('具体授权或版权转让以双方另行签订的协议为准。', 'Việc cấp phép hoặc chuyển nhượng bản quyền cụ thể lấy theo thỏa thuận hai bên ký riêng.') : tv('观看权益不等于取得版权，使用仍须遵守作者授权范围。', 'Quyền xem không đồng nghĩa với có bản quyền, việc sử dụng vẫn phải tuân thủ phạm vi ủy quyền của tác giả.')}</p></section>
  </>
  if (recruit && !manage) return <>
    <PageHeading title={item.title || tv('招募详情', 'Chi tiết tuyển dụng')} description={`${item.author || tv('需求发布者', 'Người đăng nhu cầu')} · ${item.category || tv('其他', 'Khác')} · ${date(item.created_at)}`} back="/marketplace/recruits" />
    <div className="pf-market-detail-intro">
      <div><span className="pf-market-category-tag">{tv("创作需求", "Nhu cầu sáng tạo")}</span><p className="pf-market-text">{item.description || tv('暂未填写详细介绍', 'Chưa điền giới thiệu chi tiết')}</p></div>
      <div className="pf-market-detail-price"><span>{tv("单条预算", "Ngân sách mỗi mục")}</span><strong>{money(item.budget_fen)}</strong><small>{tv("具体合作条件由客服协助线下确认", "Điều kiện hợp tác cụ thể do CSKH hỗ trợ xác nhận ngoại tuyến")}</small></div>
    </div>
    <section className="pf-market-detail-section"><h2>{tv("需求与交付要求", "Nhu cầu và yêu cầu bàn giao")}</h2><p>{tv("需求数量", "Số lượng nhu cầu")} {item.wanted_count} {tv("条 · 截止", "mục · hạn chót")} {date(item.deadline_at)}</p><p className="pf-market-text">{item.requirements}</p><h2>{tv("用途及授权意向", "Mục đích và ý định cấp phép")}</h2><p className="pf-market-text">{item.license_scope || tv('具体授权要求请联系客服确认', 'Yêu cầu cấp phép cụ thể vui lòng liên hệ CSKH xác nhận')}</p>{Boolean(item.image_ids?.length) && <><h2>{tv("参考图片", "Ảnh tham chiếu")}</h2>{item.image_ids?.map((image, index) => <Media key={image} kind="recruit" id={id} purpose={`image-${index}`} />)}</>}</section>
    <section className="pf-market-detail-section"><h2>{item.is_owner ? tv('你的招募需求', 'Tuyển dụng của bạn') : tv('想接下这个项目？', 'Muốn nhận dự án này?')}</h2>
      {item.is_owner ? <p>{tv("创作者通过平台客服沟通接单，客服协助你确认合作。", "Nhà sáng tạo trao đổi nhận việc qua CSKH nền tảng, CSKH hỗ trợ bạn xác nhận hợp tác.")}<Link to={`/marketplace/recruits/${id}/manage`}>{tv("管理我的招募", "Quản lý tuyển dụng của tôi")}</Link></p> : !item.is_open ? <p className="pf-market-notice">{tv("该招募已结束，暂不接受新的接单咨询。", "Tuyển dụng này đã kết thúc, tạm thời không nhận tư vấn nhận việc mới.")}</p> : <><p>{tv("先联系平台客服，提供这条招募的编号及你的创作意向。客服将协助确认需求、预算、授权和交付安排。", "Hãy liên hệ CSKH nền tảng trước, cung cấp mã của tuyển dụng này và ý định sáng tạo của bạn. CSKH sẽ hỗ trợ xác nhận nhu cầu, ngân sách, cấp phép và sắp xếp bàn giao.")}</p><div className="pf-market-actions"><NeedLogin><Contact kind="recruit" id={id} /></NeedLogin></div><small>{tv("具体合作在线下协商，联系客服不代表已接单或成交。", "Hợp tác cụ thể được thương lượng ngoại tuyến, liên hệ CSKH không có nghĩa là đã nhận việc hay chốt giao dịch.")}</small></>}
    </section>
    <ReportForm kind="recruit" id={id} />
  </>
  return <><PageHeading title={item.title || (recruit ? tv('招募详情', 'Chi tiết tuyển dụng') : tv('作品详情', 'Chi tiết tác phẩm'))} description={`${item.author || tv('创作者', 'Nhà sáng tạo')} · ${item.category || tv('其他', 'Khác')} · ${date(item.created_at)}`} back={manage ? '/marketplace/mine' : recruit ? '/marketplace/recruits' : '/marketplace'} /><div className="pf-market-detail-intro"><div><span className="pf-market-category-tag">{recruit ? tv('创作需求', 'Nhu cầu sáng tạo') : tv('视频作品', 'Tác phẩm video')}</span><p className="pf-market-text">{item.description || tv('暂未填写详细介绍', 'Chưa điền giới thiệu chi tiết')}</p></div><div className="pf-market-detail-price"><span>{recruit ? tv('单条预算', 'Ngân sách mỗi mục') : isFreeWork(item) ? tv('免费公开', 'Công khai miễn phí') : item.sale_type === 'platform_unlock' ? tv('观众解锁价', 'Giá mở khóa cho khán giả') : tv('参考价', 'Giá tham khảo')}</span><strong>{!recruit && isFreeWork(item) ? tv('免费', 'Miễn phí') : money(recruit ? item.budget_fen : item.sale_type === 'platform_unlock' ? item.unlock_price_fen : item.price_fen)}</strong><small>{recruit || item.sale_type === 'copyright_contact' ? tv('具体合作与授权由客服协助线下确认', 'Hợp tác và cấp phép cụ thể do CSKH hỗ trợ xác nhận ngoại tuyến') : item.sale_type === 'platform_unlock' ? tv('购买所购版本的永久在线播放权益，不包含版权转让', 'Mua quyền phát trực tuyến vĩnh viễn của phiên bản đã mua, không bao gồm chuyển nhượng bản quyền') : tv('免费完整观看，使用仍须遵守作者授权范围', 'Xem trọn vẹn miễn phí, việc sử dụng vẫn phải tuân thủ phạm vi ủy quyền của tác giả')}</small></div></div><section className="pf-market-detail-section"><h2>{tv("用途及授权意向", "Mục đích và ý định cấp phép")}</h2><p className="pf-market-text">{item.license_scope || tv('请联系发布者补充授权说明', 'Vui lòng liên hệ người đăng để bổ sung mô tả cấp phép')}</p>
    {recruit ? <><p>{tv("征集", "Thu thập")} {item.wanted_count} {tv("条 · 截止", "mục · hạn chót")} {date(item.deadline_at)}</p><p className="pf-market-text">{item.requirements}</p>{item.image_ids?.map((_, index) => <Media key={index} kind="recruit" id={id} purpose={`image-${index}`} />)}</> : <><p>{tv("作品与版权材料一并提交，由管理员统一审核；通过后由您主动上架。", "Tác phẩm và tài liệu bản quyền được gửi cùng nhau, quản trị viên duyệt thống nhất; sau khi duyệt bạn chủ động đăng.")}</p><button type="button" disabled={privateView && (!item.asset_id || item.media_status !== 'ready')} onClick={() => setPreview(!preview)}>{tv("播放／关闭作品预览", "Phát／đóng xem trước tác phẩm")}</button>{preview && <Media kind={privateView ? 'asset' : 'work'} id={privateView ? item.asset_id ?? 0 : id} purpose="preview" video />}</>}
    </section>{privateView && !recruit && <WorkPublishingSteps item={item} onUpdated={() => { void refreshProgress() }} />}{privateView && <section><h2>{tv("发布管理", "Quản lý đăng")}</h2>{!recruit && submitIssues.length > 0 && <div className="pf-market-notice" role="status"><strong>{tv("提交前还需完成：", "Trước khi gửi cần hoàn tất:")}</strong><ul>{submitIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><Link to={`/marketplace/works/${id}/edit`}>{tv("前往编辑草稿", "Đến chỉnh sửa bản nháp")}</Link></div>}{item.audit_status === 'processing' && <p role="status">{tv("正在生成短试看，完成后自动进入待审核。可以关闭页面，稍后在我的发布中查看。", "Đang tạo bản xem thử ngắn, xong sẽ tự động vào trạng thái chờ duyệt. Có thể đóng trang, lát nữa xem ở Đăng của tôi.")}</p>}<p>{recruit ? tv('招募审核', 'Duyệt tuyển dụng') : tv('作品审核', 'Duyệt tác phẩm')}：{labels[item.audit_status ?? ''] || item.audit_status} · {recruit ? labels[item.state ?? ''] : item.listed ? tv('已上架', 'Đã đăng') : tv('未上架', 'Chưa đăng')}{item.blocked ? tv(' · 已封禁', ' · Đã bị khóa') : ''}</p><p>{item.reason}</p><div className="pf-market-actions"><Link to={`/marketplace/${recruit ? 'recruits' : 'works'}/${id}/edit`}>{tv("编辑草稿", "Chỉnh sửa bản nháp")}</Link><button type="button" disabled={!recruit && (!canSubmitWork || item.audit_status === 'processing' || item.audit_status === 'pending' || item.audit_status === 'approved')} onClick={() => action(`/${recruit ? 'recruits' : 'works'}/${id}/submit`, { version: item.version })}>{item.audit_status === 'processing' ? tv('正在生成短试看…', 'Đang tạo bản xem thử ngắn…') : item.audit_status === 'preview_failed' ? tv('重试生成短试看并提交', 'Thử lại tạo bản xem thử ngắn và gửi') : tv('提交审核', 'Gửi duyệt')}</button>{recruit ? <button type="button" onClick={() => { if (window.confirm(tv('关闭后将退出招募广场，停止新的接单咨询。确认关闭？', 'Sau khi đóng sẽ rời quảng trường tuyển dụng, ngừng nhận tư vấn nhận việc mới. Xác nhận đóng?'))) void action(`/recruits/${id}/close`) }}>{tv("关闭招募", "Đóng tuyển dụng")}</button> : <><button type="button" disabled={!item.listed && (!canSubmitWork || item.audit_status !== 'approved')} onClick={() => action(`/works/${id}/listing?listed=${!item.listed}`, { version: item.version })}>{item.listed ? tv('下架', 'Gỡ xuống') : tv('上架', 'Đăng lên')}</button>{item.asset_id && <Link to={`/marketplace/assets/${item.asset_id}/rights?source=${item.source || 'external'}&return=${encodeURIComponent(`/marketplace/works/${id}/edit`)}`}>{tv("确认版权信息", "Xác nhận thông tin bản quyền")}</Link>}<button type="button" onClick={() => void removeWork()}>{tv("删除作品", "Xóa tác phẩm")}</button></>}</div></section>}
    {privateView && !recruit && item.audit_status === 'approved' && !isFreeWork(item) && (item.preview_status === 'failed' || previewActive) && <section aria-label={tv("短试看修复", "Sửa bản xem thử ngắn")}><p role="status">{previewActive ? tv('正在生成短试看，可以关闭页面，稍后回来查看。', 'Đang tạo bản xem thử ngắn, có thể đóng trang, lát nữa quay lại xem.') : tv('短试看生成失败，可直接重试。', 'Tạo bản xem thử ngắn thất bại, có thể thử lại ngay.')}</p><button type="button" disabled={retryingPreview || previewActive || item.blocked} onClick={() => void retryPreview()}>{retryingPreview || previewActive ? tv('正在生成短试看…', 'Đang tạo bản xem thử ngắn…') : tv('重试生成短试看', 'Thử lại tạo bản xem thử ngắn')}</button></section>}
    {recruit && <p className="pf-market-notice">{tv("审核通过后，创作者通过平台客服沟通接单。具体合作、合同与交付在线下确认。", "Sau khi duyệt, nhà sáng tạo trao đổi nhận việc qua CSKH nền tảng. Hợp tác, hợp đồng và bàn giao cụ thể xác nhận ngoại tuyến.")}</p>}
    <div className="pf-market-actions">{(recruit || (item.sale_type === 'copyright_contact')) && <Contact kind={recruit ? 'recruit' : 'work'} id={id} label={recruit ? tv('联系客服', 'Liên hệ CSKH') : undefined} />}<ReportForm kind={recruit ? 'recruit' : 'work'} id={id} /></div>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</>
}








