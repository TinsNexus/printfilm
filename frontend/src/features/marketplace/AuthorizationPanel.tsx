import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Download, Eye, FileCheck2, ShieldCheck } from 'lucide-react'
import { date, letterFile, request } from './api'
import Modal from '../../components/ui/Modal'
import { tv } from '../../i18n/tv'

type Signed = { id: number; signer_name: string; created_at: string; template_version: string }
type Status = { template: { version: string; title: string; notices: string[]; body: string }; current: Signed | null }
type Point = [number, number]
type Preview = { url: string; image: boolean }

/** 账号签署一次。条款在页面内阅读，已签署文件默认在线预览，点下载才保存。 */
export default function AuthorizationPanel({ onSigned }: { onSigned?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [name, setName] = useState('')
  const [adult, setAdult] = useState(false)
  const [readAll, setReadAll] = useState(false)
  const [acceptKey, setAcceptKey] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Point[][]>([])
  const drawing = useRef<number | null>(null)
  const ready = adult && readAll && acceptKey && name.trim().length >= 2
  useEffect(() => { let active = true; request<Status>('/authorization').then(value => { if (active) setStatus(value) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [])
  const previewUrl = useRef('')
  useEffect(() => {
    setPreview(null)
    setPreviewOpen(false)
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = ''
    }
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = ''
    }
  }, [status?.current?.id])
  function point(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(800, (e.clientX - rect.left) / rect.width * 800)), Math.max(0, Math.min(240, (e.clientY - rect.top) / rect.height * 240))]
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (drawing.current !== e.pointerId) return
    const stroke = strokes.current[strokes.current.length - 1]
    if (stroke.length >= 1000) return
    const next = point(e), previous = stroke[stroke.length - 1]
    const ctx = canvas.current?.getContext('2d')
    if (ctx) { ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...previous); ctx.lineTo(...next); ctx.stroke() }
    stroke.push(next)
  }
  async function loadPreview() {
    if (preview) return preview
    const id = status?.current?.id
    if (!id) return null
    setPreviewBusy(true)
    setError('')
    try {
      const blob = await letterFile(id)
      const url = URL.createObjectURL(blob)
      previewUrl.current = url
      const value = { url, image: blob.type.startsWith('image/') }
      setPreview(value)
      return value
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setPreviewBusy(false)
    }
  }
  async function openPreview() {
    const value = await loadPreview()
    if (value) setPreviewOpen(true)
  }
  async function downloadLetter() {
    const value = await loadPreview()
    if (!value) return
    const link = document.createElement('a')
    link.href = value.url
    link.download = value.image ? tv('授权函.png', 'Thư ủy quyền.png') : tv('授权函.pdf', 'Thư ủy quyền.pdf')
    link.click()
    link.remove()
  }
  async function sign() {
    if (!status || !ready) return
    const valid = strokes.current.filter(stroke => stroke.length >= 2)
    if (valid.flat().length < 12) { setError(tv('请在签名区完整手写签名，再确认签署。', 'Vui lòng ký tay đầy đủ trong vùng chữ ký rồi mới xác nhận ký.')); return }
    setBusy(true); setError('')
    try {
      const result = await request<Signed>('/authorization', 'POST', { template_version: status.template.version, signer_name: name.trim(), accepted_terms: true, adult: true, read_all: true, accept_key: true, strokes: valid })
      setStatus({ ...status, current: result }); onSigned?.()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="pf-market-authorization"><h2>{tv("PrintFilm 作品授权函", "Thư ủy quyền tác phẩm PrintFilm")}</h2><p>{tv("按现行条款签署一次，本账号后续 PrintFilm 作品可引用。本函是许可使用，不是著作权转让。", "Ký một lần theo điều khoản hiện hành, các tác phẩm PrintFilm sau này của tài khoản này có thể tham chiếu. Thư này là cho phép sử dụng, không phải chuyển nhượng bản quyền.")}</p>
    {status && <>
      <h3>{status.template.title}</h3>
      <p>{tv("版本", "Phiên bản")} {status.template.version}</p>
      <ol className="pf-market-letter-notices">{status.template.notices.map(item => <li key={item}>{item}</li>)}</ol>
      <div className="pf-market-letter">{status.template.body}</div>
      {status.current ? <>
        <p className="pf-market-notice">{tv("已签署：", "Đã ký:")}{status.current.signer_name} · {date(status.current.created_at)}{tv("。可点击预览或下载已签署授权函。", ". Có thể bấm xem trước hoặc tải thư ủy quyền đã ký.")}</p>
        <div className="pf-market-letter-actions"><button type="button" onClick={() => { void openPreview() }} disabled={previewBusy}>{previewBusy ? tv('正在打开…', 'Đang mở…') : tv('预览授权函', 'Xem trước thư ủy quyền')}</button><button type="button" onClick={() => { void downloadLetter() }} disabled={previewBusy}>{previewBusy ? tv('处理中…', 'Đang xử lý…') : tv('下载授权函', 'Tải thư ủy quyền')}</button></div>
        <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={tv("授权函预览", "Xem trước thư ủy quyền")} size="xl" className="pf-market-letter-modal">
          <div className="pf-market-letter-modal-summary">
            <div className="pf-market-letter-modal-summary-top">
              <span className="pf-market-letter-modal-eyebrow"><ShieldCheck size={14} /> {tv("PRINTFILM · 数字资产市场", "PRINTFILM · Chợ tài sản số")}</span>
              <span className="pf-market-letter-modal-status"><FileCheck2 size={13} /> {tv("已签署", "Đã ký")}</span>
            </div>
            <strong>{tv("账号授权函", "Thư ủy quyền tài khoản")}</strong>
            <span className="pf-market-letter-modal-meta">{tv("签署人：", "Người ký:")}{status.current.signer_name} · {date(status.current.created_at)} {tv("· 条款", "· Điều khoản")} {status.current.template_version}</span>
            <p>{tv("此处展示已签署的授权协议，具体授权范围以协议正文为准。在线预览不会自动下载文件。", "Phần này hiển thị thỏa thuận ủy quyền đã ký, phạm vi ủy quyền cụ thể lấy theo nội dung thỏa thuận. Xem trực tuyến sẽ không tự động tải tệp xuống.")}</p>
          </div>
          <div className="pf-market-letter-preview-surface">
            <div className="pf-market-letter-preview-label"><Eye size={14} /> {tv("文档预览", "Xem trước tài liệu")}</div>
            {preview && (preview.image ? <img className="pf-market-letter-image" src={preview.url} alt={tv("已签署授权函", "Thư ủy quyền đã ký")} /> : <iframe className="pf-market-letter-frame" src={preview.url} title={tv("授权函预览", "Xem trước thư ủy quyền")} />)}
          </div>
          <div className="pf-market-letter-modal-actions"><button type="button" className="pf-market-letter-modal-secondary" onClick={() => setPreviewOpen(false)}>{tv("关闭", "Đóng")}</button><button type="button" className="pf-market-letter-modal-primary" onClick={() => { void downloadLetter() }} disabled={previewBusy}><Download size={14} /> {previewBusy ? tv('处理中…', 'Đang xử lý…') : tv('下载授权函', 'Tải thư ủy quyền')}</button></div>
        </Modal>
      </> : <div className="pf-market-fields">
        <label>{tv("签署人真实姓名", "Họ tên thật của người ký")}<input value={name} minLength={2} maxLength={80} onChange={e => setName(e.target.value)} disabled={busy} /></label>
        <p>{tv("在下方手写签名（支持鼠标或触屏）", "Ký tay bên dưới (hỗ trợ chuột hoặc màn hình cảm ứng)")}</p>
        <canvas aria-label={tv("手写签名区域", "Vùng chữ ký tay")} ref={canvas} width={800} height={240} className="pf-market-signature" onPointerDown={e => { if (busy || drawing.current !== null || strokes.current.length >= 40) return; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 当前指针无法捕获时仍记录笔画 */ } drawing.current = e.pointerId; strokes.current.push([point(e)]) }} onPointerMove={move} onPointerUp={e => { if (drawing.current === e.pointerId) drawing.current = null }} onPointerCancel={() => { drawing.current = null }} />
        <button type="button" disabled={busy} onClick={() => { strokes.current = []; canvas.current?.getContext('2d')?.clearRect(0, 0, 800, 240) }}>{tv("清除签名", "Xóa chữ ký")}</button>
        <label><input type="checkbox" checked={adult} disabled={busy} onChange={e => setAdult(e.target.checked)} />{tv("我已年满十八周岁，具有完全民事行为能力，所填姓名真实。", "Tôi đã đủ mười tám tuổi, có đầy đủ năng lực hành vi dân sự, họ tên điền là thật.")}</label>
        <label><input type="checkbox" checked={readAll} disabled={busy} onChange={e => setReadAll(e.target.checked)} />{tv("我已完整阅读本协议全文。", "Tôi đã đọc đầy đủ toàn văn thỏa thuận này.")}</label>
        <label><input type="checkbox" checked={acceptKey} disabled={busy} onChange={e => setAcceptKey(e.target.checked)} />{tv("我已特别阅读并同意第7、8、10、11、13、15条。", "Tôi đã đọc kỹ và đồng ý các điều 7, 8, 10, 11, 13, 15.")}</label>
        <button type="button" disabled={busy || !ready} onClick={sign}>{busy ? tv('正在存档…', 'Đang lưu trữ…') : tv('确认签署并保存授权函', 'Xác nhận ký và lưu thư ủy quyền')}</button>
      </div>}
    </>}
    {!status && !error && <p role="status">{tv("正在读取授权条款…", "Đang đọc điều khoản ủy quyền…")}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
