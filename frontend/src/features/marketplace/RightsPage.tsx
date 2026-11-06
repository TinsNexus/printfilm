import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { request, type RightsRecord } from './api'
import AssetPicker from './AssetPicker'
import { PageHeading } from './ui'
import AuthorizationPanel from './AuthorizationPanel'
import AssetPreview from './AssetPreview'
import { tv } from '../../i18n/tv'

function safeDraftReturn(value: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/marketplace/')) return ''
    return url.pathname + url.search
  } catch { return '' }
}

export default function RightsPage({ assetId: suppliedAssetId, sourceHint, embedded = false, onUpdated }: { assetId?: number; sourceHint?: string; embedded?: boolean; onUpdated?: () => void } = {}) {
  const params = useParams()
  const assetId = suppliedAssetId ?? Number(params.id)
  const [query] = useSearchParams()
  const backTo = safeDraftReturn(query.get('return'))
  const [source, setSource] = useState('external')
  const [item, setItem] = useState<RightsRecord | null>(null)
  const [certificate, setCertificate] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [support, setSupport] = useState<{ available: boolean; name?: string; wechat?: string; hours?: string; message?: string } | null>(null)
  const [qr, setQr] = useState('')
  useEffect(() => { let active = true; request<RightsRecord>(`/assets/${assetId}/rights`).then(value => { if (active) { setItem(value); setSource(sourceHint ?? (value.id ? value.details?.source : query.get('source')) ?? 'external'); setCertificate(value.certificate_asset_id ?? null) } }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [assetId, revision, query, sourceHint])
  async function save(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    const form = e ? new FormData(e.currentTarget) : null
    setBusy(true); setError(''); setMessage('')
    try {
      await request(`/assets/${assetId}/rights`, 'PUT', { version: item?.version ?? 0, details: { source, certificate_number: String(form?.get('certificate_number') ?? ''), dispute_ack: form?.get('dispute_ack') === 'on' }, certificate_asset_id: source === 'printfilm' ? null : certificate, evidence_ids: [] })
      setMessage(backTo ? tv('版权材料已保存。可以返回草稿页继续编辑或提交审核。', 'Đã lưu tài liệu bản quyền. Có thể quay lại trang bản nháp để tiếp tục chỉnh sửa hoặc gửi duyệt.') : tv('版权材料已保存。请回到草稿页点击“提交审核”。', 'Đã lưu tài liệu bản quyền. Vui lòng quay lại trang bản nháp bấm “Gửi duyệt”.'))
      setRevision(v => v + 1); onUpdated?.()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function contact() {
    setError('')
    try {
      const result = await request<{ available: boolean; name?: string; wechat?: string; hours?: string; message?: string }>('/support')
      setSupport(result)
      if (result.available) setQr((await request<{ url: string }>('/media/support/1/qr')).url)
    } catch (err) { setError((err as Error).message) }
  }
  if (!item) return <p role={error ? 'alert' : 'status'}>{error || tv('正在加载版权信息…', 'Đang tải thông tin bản quyền…')}</p>
  return <>{!embedded && <PageHeading title={tv("确认版权信息", "Xác nhận thông tin bản quyền")} description={tv("版权信息与作品一次提交、一次审核。标有必填的项目需要填完才能保存。", "Thông tin bản quyền và tác phẩm được gửi một lần, duyệt một lần. Các mục đánh dấu bắt buộc phải điền xong mới lưu được.")} back={backTo || '/marketplace/mine'} backLabel={backTo ? tv('返回继续编辑草稿', 'Quay lại tiếp tục chỉnh sửa bản nháp') : tv('返回我的发布', 'Quay lại Đăng của tôi')} />}
    <section className="pf-market-rights-route"><h2>{tv("确认作品来源", "Xác nhận nguồn tác phẩm")}</h2><label>{tv("视频生成平台", "Nền tảng tạo video")}<select value={source} disabled={Boolean(sourceHint)} onChange={e => setSource(e.target.value)}><option value="printfilm">{tv("PrintFilm 生成", "Do PrintFilm tạo")}</option><option value="external">{tv("其他平台生成", "Do nền tảng khác tạo")}</option></select></label><details><summary>{tv("查看当前视频", "Xem video hiện tại")}</summary><AssetPreview id={assetId} /></details>
      {source === 'printfilm' ? <><AuthorizationPanel onSigned={() => { void save() }} /><button type="button" disabled={busy} onClick={() => { void save() }}>{tv("使用已签署授权函", "Dùng thư ủy quyền đã ký")}</button><p>{tv("账号按当前条款签署一次即可，后续 PrintFilm 作品可引用有效授权函，无需逐件签署或上传版权证书。", "Tài khoản ký một lần theo điều khoản hiện hành, các tác phẩm PrintFilm sau này có thể tham chiếu thư ủy quyền còn hiệu lực, không cần ký từng cái hay tải chứng chỉ bản quyền.")}</p></> : <><form className="pf-market-form" key={`${item.version}-${source}`} onSubmit={save}><label>{tv("版权证书编号", "Số chứng chỉ bản quyền")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span><input name="certificate_number" required maxLength={200} defaultValue={item.details?.certificate_number} /></label><AssetPicker kind="image" required value={certificate} onChange={setCertificate} title={tv("版权证书截图或照片", "Ảnh chụp màn hình hoặc ảnh chứng chỉ bản quyền")} /><label><input type="checkbox" name="dispute_ack" required defaultChecked={Boolean(item.details?.dispute_ack)} />{tv("我确认材料真实，版权纠纷与平台无关", "Tôi xác nhận tài liệu là thật, tranh chấp bản quyền không liên quan đến nền tảng")}<span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span></label><button type="submit" disabled={busy || !certificate}>{tv("保存版权信息", "Lưu thông tin bản quyền")}</button></form><p>{tv("暂缺版权证明材料？联系客服了解协办流程，材料齐备后再提交审核。", "Chưa có tài liệu chứng minh bản quyền? Liên hệ CSKH tìm hiểu quy trình hỗ trợ, đủ tài liệu rồi hãy gửi duyệt.")}</p><button type="button" onClick={() => { void contact() }}>{tv("联系客服协办", "Liên hệ CSKH hỗ trợ")}</button></>}
      {support && <div role="status">{support.available ? <><p>{support.name} · {support.wechat} · {support.hours}</p>{qr && <img src={qr} alt={tv("平台客服二维码", "Mã QR CSKH nền tảng")} style={{ maxWidth: 240 }} />}</> : <p>{support.message || tv('客服暂不可用', 'CSKH tạm thời không khả dụng')}</p>}</div>}
    </section>{message && <p role="status">{message}{backTo && <> <Link to={backTo}>{tv("返回继续编辑草稿", "Quay lại tiếp tục chỉnh sửa bản nháp")}</Link></>}</p>}{error && <p role="alert">{error}</p>}</>
}
