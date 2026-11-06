import { Link } from 'react-router-dom'
import { labels, type Row } from './api'
import RightsPage from './RightsPage'
import AuthorizationPanel from './AuthorizationPanel'
import { isFreeWork, previewStatusLabel } from './playbackPolicy'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'

// 发布步骤始终显示；缺少视频时明确指向第一步，不再隐藏权属入口。
export default function WorkPublishingSteps({ item, onUpdated }: { item: Row; onUpdated: () => void }) {
  const mediaReady = Boolean(item.asset_id && item.media_status === 'ready')
  const internal = item.source === 'printfilm'
  const sourceKnown = internal || item.source === 'external'
  const rightsTitle = internal ? tv('确认版权信息', 'Xác nhận thông tin bản quyền') : sourceKnown ? tv('补充版权材料', 'Bổ sung tài liệu bản quyền') : tv('确认作品来源', 'Xác nhận nguồn tác phẩm')
  return <section className="pf-market-publishing" id="publishing" aria-label={tv("作品发布流程", "Quy trình đăng tác phẩm")}>
    <h2>{tv("发布步骤", "Các bước đăng")}</h2><p>{tv("按顺序完成文件、授权材料与人工审核，最后由您主动上架。", "Lần lượt hoàn tất tệp, tài liệu cấp phép và duyệt thủ công, cuối cùng bạn chủ động đăng.")}</p>
    <ol className="pf-market-publish-steps">
      <li data-complete={mediaReady}><span>01</span><div><h3>{tv("完善作品文件", "Hoàn thiện tệp tác phẩm")}</h3><p>{mediaReady ? tv('视频已上传', 'Video đã tải lên') : item.asset_id ? tv(`视频${labels[item.media_status || ''] || '尚未就绪'}，请检查上传状态`, `Video ${labels[item.media_status || ''] || '尚未就绪'}, vui lòng kiểm tra trạng thái tải lên`) : tv('尚未上传视频。请先上传或同步成片。', 'Chưa tải video lên. Vui lòng tải lên hoặc đồng bộ phim trước.')}</p><Link to={`/marketplace/works/${item.id}/edit`}>{mediaReady ? tv('修改作品文件', 'Sửa tệp tác phẩm') : tv('去上传视频', 'Đi tải video lên')}</Link></div></li>
      <li data-complete={Boolean(item.rights_complete)}><span>02</span><div><h3>{rightsTitle}</h3><p>{internal ? tv('账号按当前条款签署一次授权函即可，后续同类作品可引用，无需其他证明。', 'Tài khoản ký một lần thư ủy quyền theo điều khoản hiện hành là đủ, các tác phẩm cùng loại sau này có thể tham chiếu, không cần chứng minh nào khác.') : sourceKnown ? tv('填写证书编号并上传截图或照片；暂缺证明材料可联系客服了解协办流程。', 'Điền số chứng chỉ và tải ảnh chụp màn hình hoặc ảnh; chưa có tài liệu chứng minh có thể liên hệ CSKH tìm hiểu quy trình hỗ trợ.') : tv('请先确认生成平台，再按对应流程补充材料。', 'Vui lòng xác nhận nền tảng tạo trước, rồi bổ sung tài liệu theo quy trình tương ứng.')}</p>{item.rights_ready ? <p>{tv("版权材料已核验", "Tài liệu bản quyền đã được xác minh")}</p> : <p>{item.rights_complete ? tv('版权材料已填写，随作品一并提交审核。', 'Tài liệu bản quyền đã điền, sẽ gửi duyệt cùng tác phẩm.') : mediaReady ? tv('补齐版权材料后，与作品一起提交审核。', 'Bổ sung tài liệu bản quyền xong sẽ gửi duyệt cùng tác phẩm.') : tv('请先完成第 01 步上传视频。', 'Vui lòng hoàn tất bước 01 tải video lên trước.')}</p>}</div></li>
      <li data-complete={item.audit_status === 'approved'}><span>03</span><div><h3>{tv("提交作品审核", "Gửi duyệt tác phẩm")}</h3><p>{tv("作品和版权信息一次提交，管理员统一审核。免费作品审核通过并上架后可完整观看；收费内容提交时生成最长15秒且不超过原片时长30%的无水印短试看。平台投放内容购买后可永久在线播放所购版本。", "Tác phẩm và thông tin bản quyền được gửi một lần, quản trị viên duyệt thống nhất. Tác phẩm miễn phí sau khi duyệt và đăng có thể xem trọn vẹn; nội dung thu phí khi gửi sẽ tạo bản xem thử ngắn không watermark dài tối đa 15 giây và không quá 30% thời lượng bản gốc. Nội dung quảng bá nền tảng sau khi mua có thể phát trực tuyến vĩnh viễn phiên bản đã mua.")}</p><p>{tv("作品审核：", "Duyệt tác phẩm:")}{labels[item.audit_status || 'missing'] || tv('待提交', 'Chờ gửi')}</p><p>{tv("试看：", "Xem thử:")}{previewStatusLabel(item.preview_status, isFreeWork(item))}</p>{item.preview_error && !isFreeWork(item) && <p role="alert">{explainMarketplaceError(item.preview_error)}</p>}</div></li>
      <li data-complete={Boolean(item.listed)}><span>04</span><div><h3>{tv("上架发布", "Đăng lên")}</h3><p>{item.listed ? tv('已上架', 'Đã đăng') : tv('作品与版权材料统一审核通过、播放文件就绪后，由您主动上架。', 'Sau khi tác phẩm và tài liệu bản quyền được duyệt thống nhất và tệp phát sẵn sàng, bạn chủ động đăng.')}</p></div></li>
    </ol>
    {mediaReady ? <details className="pf-market-inline-rights" open={!item.rights_ready}><summary>{internal ? tv('签署 / 查看授权函', 'Ký / Xem thư ủy quyền') : tv('上传 / 补充版权材料，或联系客服协办', 'Tải lên / bổ sung tài liệu bản quyền, hoặc liên hệ CSKH hỗ trợ')}</summary><RightsPage key={`${item.asset_id}-${item.source}`} assetId={item.asset_id!} sourceHint={item.source} embedded onUpdated={onUpdated} /></details> : internal ? <AuthorizationPanel /> : <p className="pf-market-notice">{tv("上传视频后即可填写对应的版权材料。", "Sau khi tải video lên là có thể điền tài liệu bản quyền tương ứng.")}<Link to="/marketplace/authorization">{tv("PrintFilm 作品也可先签署账号授权函", "Tác phẩm PrintFilm cũng có thể ký thư ủy quyền tài khoản trước")}</Link>。</p>}
  </section>
}




