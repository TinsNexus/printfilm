import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AssetPicker from './AssetPicker'
import { localDate, request, type Row } from './api'
import { Save } from 'lucide-react'
import Button from '../../components/ui/Button'
import { FormSection, PageHeading, PublishGuide } from './ui'
import { tv } from '../../i18n/tv'

// 需求可以无附件发布；实质条款锁定由服务端最终校验。
export default function RecruitEditor() {
  /* item 需求快照；images 参考图；error/busy 保存反馈。 */
  const { id } = useParams(); const navigate = useNavigate()
  const [item, setItem] = useState<Row | null>(null)
  const [images, setImages] = useState<number[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (id) request<Row>(`/recruits/${id}`).then(value => { setItem(value); setImages(value.image_ids ?? []) }).catch(e => setError(e.message)) }, [id])
  // 保留服务器版本，避免旧表单覆盖最新需求及审核结果。
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('')
    const body = { title: form.get('title'), description: form.get('description'), category: form.get('category'), budget_fen: Math.round(Number(form.get('budget')) * 100), wanted_count: Number(form.get('count')), requirements: form.get('requirements'), license_scope: form.get('license_scope'), deadline_at: new Date(String(form.get('deadline'))).toISOString(), image_ids: images, ...(id ? { version: item?.version } : {}) }
    try { const result = await request<Row>(id ? `/recruits/${id}` : '/recruits', id ? 'PUT' : 'POST', body); navigate(`/marketplace/recruits/${result.id}/manage`) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  if (id && !item) return <p role={error ? 'alert' : 'status'}>{error || tv('正在加载…', 'Đang tải…')}</p>
  return <><PageHeading title={id ? tv('编辑招募', 'Chỉnh sửa tuyển dụng') : tv('发布招募', 'Đăng tuyển dụng')} description={tv("描述创作需求，审核通过后由平台客服协助对接创作者。", "Mô tả nhu cầu sáng tạo, sau khi duyệt CSKH nền tảng sẽ hỗ trợ kết nối nhà sáng tạo.")} back="/marketplace/recruits" />{Boolean(item?.submission_count) && <p className="pf-market-notice">{tv("这条需求存在旧版合作记录，为保留原约定，预算、用途、授权、交付和截止条件不可修改。重大变更请关闭后重新发布。", "Nhu cầu này có bản ghi hợp tác kiểu cũ, để giữ thỏa thuận ban đầu, ngân sách, mục đích, cấp phép, bàn giao và hạn chót không thể sửa. Thay đổi lớn vui lòng đóng rồi đăng lại.")}</p>}<div className="pf-market-editor-layout"><form className="pf-market-form" onSubmit={save}>
    <FormSection step="01" title={tv("描述创作需求", "Mô tả nhu cầu sáng tạo")} description={tv("写清你想做什么，以及作品将用于什么场景。", "Viết rõ bạn muốn làm gì và tác phẩm sẽ dùng trong bối cảnh nào.")}><label>{tv("标题", "Tiêu đề")}<input name="title" required maxLength={200} placeholder={tv("例如：为城市文旅项目征集一支短片", "Ví dụ: Thu thập một phim ngắn cho dự án du lịch văn hóa thành phố")} defaultValue={item?.title} /></label><label>{tv("需求说明", "Mô tả nhu cầu")}<textarea name="description" required maxLength={5000} placeholder={tv("介绍项目背景、目标受众与期待的内容方向", "Giới thiệu bối cảnh dự án, đối tượng khán giả và hướng nội dung mong muốn")} defaultValue={item?.description} /></label><label>{tv("分类", "Danh mục")}<input name="category" required maxLength={60} defaultValue={item?.category ?? tv('其他', 'Khác')} /></label></FormSection>
    <FormSection step="02" title={tv("预算与交付", "Ngân sách và bàn giao")} description={tv("填写预期预算及交付要求，具体合作条件由客服协助线下确认。", "Nhập ngân sách dự kiến và yêu cầu bàn giao, điều kiện hợp tác cụ thể do CSKH hỗ trợ xác nhận ngoại tuyến.")}><div className="pf-market-field-row"><label>{tv("单条预算（元）", "Ngân sách mỗi mục (tệ)")}<input name="budget" required type="number" min="0.01" max="1000000" step="0.01" placeholder="0.00" defaultValue={item?.budget_fen ? item.budget_fen / 100 : ''} /></label><label>{tv("征集数量", "Số lượng thu thập")}<input name="count" required type="number" min="1" max="10000" defaultValue={item?.wanted_count ?? 1} /></label></div><label>{tv("规格和交付要求（时长、画幅、用途等）", "Quy cách và yêu cầu bàn giao (thời lượng, tỷ lệ khung, mục đích, v.v.)")}<textarea name="requirements" required maxLength={3000} placeholder={tv("例如：30秒、16:9横屏、用于品牌宣传；写清交付格式", "Ví dụ: 30 giây, ngang 16:9, dùng quảng bá thương hiệu; ghi rõ định dạng bàn giao")} defaultValue={item?.requirements} /></label><label>{tv("授权意向及限制", "Ý định cấp phép và giới hạn")}<textarea name="license_scope" required maxLength={3000} placeholder={tv("说明使用渠道、期限、地域与是否需要独家授权", "Nêu kênh sử dụng, thời hạn, khu vực và có cần cấp phép độc quyền không")} defaultValue={item?.license_scope} /></label><label>{tv("截止时间（本机时区）", "Hạn chót (múi giờ máy này)")}<input name="deadline" type="datetime-local" required defaultValue={localDate(item?.deadline_at ?? new Date(Date.now() + 30 * 86400000).toISOString())} /></label></FormSection>
    <FormSection step="03" title={tv("参考与确认", "Tham chiếu và xác nhận")} description={tv("参考图片为选填，最多6张；没有附件也可以发布需求。", "Ảnh tham chiếu là tùy chọn, tối đa 6 ảnh; không có tệp đính kèm vẫn đăng được nhu cầu.")}>{images.length > 0 && <div className="pf-market-actions">{images.map(image => <button key={image} type="button" onClick={() => setImages(images.filter(i => i !== image))}>{tv("移除参考图 #", "Xóa ảnh tham chiếu #")}{image}</button>)}</div>}{images.length < 6 && <AssetPicker kind="image" value={null} onChange={image => setImages(previous => [...new Set([...previous, image])].slice(0, 6))} title={tv("添加参考图片（最多6张）", "Thêm ảnh tham chiếu (tối đa 6 ảnh)")} />}<label><input type="checkbox" required />{tv("确认有权展示参考材料，理解发布需求及客服咨询不代表已达成合作。", "Xác nhận có quyền hiển thị tài liệu tham chiếu, hiểu rằng đăng nhu cầu và tư vấn CSKH không có nghĩa đã đạt hợp tác.")}</label></FormSection>
    {error && <p role="alert">{error}</p>}<div className="pf-market-form-actions"><p>{tv("先保存草稿，确认内容后提交审核。审核通过后展示在招募广场。", "Lưu bản nháp trước, xác nhận nội dung rồi gửi duyệt. Sau khi duyệt sẽ hiển thị ở quảng trường tuyển dụng.")}</p><Button type="submit" variant="lime" disabled={busy} icon><Save size={17} />{busy ? tv('保存中…', 'Đang lưu…') : tv('保存草稿', 'Lưu bản nháp')}</Button></div>
  </form><PublishGuide recruit /></div></>
}

