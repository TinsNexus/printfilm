import { useEffect, useRef, useState } from 'react'
import { request, upload } from './api'
import { CheckCircle2, UploadCloud } from 'lucide-react'
import AssetPreview, { PreviewContent } from './AssetPreview'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'

// 上传状态与“处理就绪”分开显示，只允许绑定 ready 文件。locked 时不提供手动选择。
export default function AssetPicker({ kind, value, onChange, title = tv('选择或上传文件', 'Chọn hoặc tải tệp lên'), required = false, locked = false, lockUntilPreview = false }: { kind: 'video' | 'document' | 'image'; value: number | null; onChange: (id: number) => void; title?: string; required?: boolean; locked?: boolean; lockUntilPreview?: boolean }) {
  /* 仅上传并绑定当前文件，不加载历史文件列表。 */


  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)

  const [pending, setPending] = useState<number | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [localAssetId, setLocalAssetId] = useState<number | null>(null)
  const [localUrl, setLocalUrl] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  useEffect(() => { setPreviewReady(false) }, [value])
  const waitingPreview = locked || (lockUntilPreview && (!value || !previewReady))
  useEffect(() => {
    if (!localFile) { setLocalUrl(''); return }
    const url = URL.createObjectURL(localFile); setLocalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [localFile])
  useEffect(() => {
    if (!pending) return
    let active = true
    // 独立查询处理状态，离开页面即清理轮询。
    const check = async () => {
      try {
        const asset = await request<{ status: string; error: string }>(`/assets/${pending}`)
        if (!active) return
        if (asset.status === 'ready') { onChange(pending); setPending(null); setProgress(null) }
        if (asset.status === 'failed') { setError(asset.error ? explainMarketplaceError(asset.error) : tv('文件校验失败，请检查文件后重试。', 'Kiểm tra tệp thất bại, vui lòng kiểm tra tệp rồi thử lại.')); setPending(null); setProgress(null) }
      } catch (e) { if (active) { setError((e as Error).message); setPending(null); setProgress(null) } }
    }
    const interval = window.setInterval(check, 5000); void check()
    return () => { active = false; window.clearInterval(interval) }
  }, [pending, onChange])
  // 续传失败保留会话，重新选择同一文件即可继续。
  async function choose(file?: File) {
    if (!file) return
    const allowed = kind === 'video' ? /\.(mp4|mov|webm)$/i : kind === 'image' ? /\.(png|jpe?g|webp)$/i : /\.(pdf|png|jpe?g|webp)$/i
    if (file.size === 0) { setError(tv('文件为空，请重新选择。', 'Tệp trống, vui lòng chọn lại.')); return }
    if (!allowed.test(file.name)) { setError(kind === 'video' ? tv('请选择 MP4、MOV 或 WebM 视频。', 'Vui lòng chọn video MP4, MOV hoặc WebM.') : kind === 'image' ? tv('请选择 PNG、JPG 或 WebP 图片。', 'Vui lòng chọn ảnh PNG, JPG hoặc WebP.') : tv('请选择 PDF、PNG、JPG 或 WebP 文件。', 'Vui lòng chọn tệp PDF, PNG, JPG hoặc WebP.')); return }
    if (file.size > (kind === 'video' ? 500 : 20) * 1024 * 1024) { setError(kind === 'video' ? tv('视频不能超过 500MB，请选择较小的视频。', 'Video không được vượt quá 500MB, vui lòng chọn video nhỏ hơn.') : tv('文件不能超过 20MB，请选择较小的文件。', 'Tệp không được vượt quá 20MB, vui lòng chọn tệp nhỏ hơn.')); return }
    setLocalFile(file); setLocalAssetId(null)
    setError(''); setProgress(0)
    controller.current = new AbortController()
    try { const id = await upload(file, kind, setProgress, controller.current.signal); setLocalAssetId(id); onChange(id); setPending(id) }
    catch (e) { setError((e as Error).message); setProgress(null) }
    finally { controller.current = null }
  }
  return <fieldset><legend>{title}{required && <span className="pf-req-mark">{tv("必填", "Bắt buộc")}</span>}</legend>
    {waitingPreview ? <p className="pf-market-notice" role="status">{tv("加载预览中", "Đang tải xem trước")}</p> : <label className="pf-market-upload-zone"><UploadCloud size={28} strokeWidth={1.4} /><strong>{tv("点击选择", "Bấm để chọn")}{kind === 'video' ? tv('视频', 'Video') : kind === 'image' ? tv('图片', 'Hình ảnh') : tv('文件', 'Tệp')}</strong><span>{kind === 'video' ? tv('MP4 / MOV / WebM · 最大500MB · 最长30分钟', 'MP4 / MOV / WebM · Tối đa 500MB · Dài nhất 30 phút') : kind === 'image' ? tv('PNG / JPG / WebP · 最大20MB', 'PNG / JPG / WebP · Tối đa 20MB') : tv('PDF / PNG / JPG / WebP · 最大20MB', 'PDF / PNG / JPG / WebP · Tối đa 20MB')}</span><input aria-label={tv(`上传${title}`, `Tải lên ${title}`)} type="file" disabled={progress !== null} accept={kind === 'video' ? '.mp4,.mov,.webm' : kind === 'image' ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp'} onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} /></label>}
    {!waitingPreview && progress !== null && <div className="pf-market-upload-progress" role="status"><p>{pending ? tv('上传完成，正在确认文件状态，预览会自动更新。', 'Tải lên xong, đang xác nhận trạng thái tệp, bản xem trước sẽ tự cập nhật.') : tv(`正在上传 ${progress}%`, `Đang tải lên ${progress}%`)}</p><progress value={progress} max={100} aria-label={tv("上传进度", "Tiến độ tải lên")} /></div>}
    {!waitingPreview && progress !== null && !pending && <button type="button" onClick={() => controller.current?.abort()}>{tv("取消上传", "Hủy tải lên")}</button>}
    {localFile && localUrl && <div><p>{tv("本地预览：", "Xem trước cục bộ:")}{localFile.name} · {(localFile.size / 1024 / 1024).toFixed(2)} MB</p><p>{tv("仅供检查所选文件，不代表已上传或审核通过。", "Chỉ để kiểm tra tệp đã chọn, không có nghĩa là đã tải lên hay đã duyệt.")}</p><PreviewContent key={localUrl} url={localUrl} filename={localFile.name} video={kind === 'video'} /><button type="button" onClick={() => setLocalFile(null)}>{tv("关闭本地预览", "Đóng xem trước cục bộ")}</button></div>}
    {value && <><p className="pf-market-upload-selection" hidden={waitingPreview}><CheckCircle2 size={14} /> {tv("当前", "Hiện tại")}{kind === 'video' ? tv('视频', 'Video') : kind === 'image' ? tv('图片', 'Hình ảnh') : tv('文件', 'Tệp')}{tv("已选择，文件名和状态见下方。", "Đã chọn, tên tệp và trạng thái xem bên dưới.")}</p><AssetPreview key={value} id={value} hideMedia={Boolean(localFile)} onReady={id => { if (id === localAssetId) { setLocalFile(null); setLocalAssetId(null) } }} onMediaReady={() => setPreviewReady(true)} /></>}{error && <p role="alert">{error}</p>}</fieldset>
}

