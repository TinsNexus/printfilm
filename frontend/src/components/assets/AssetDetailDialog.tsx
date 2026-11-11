/** 全局资产详情：媒体预览、来源、生成快照与业务操作共用一个弹窗。 */
import { useEffect, useState, type ReactNode } from 'react'
import Modal from '../ui/Modal'
import { Copy, Download, Maximize2, Minimize2, X } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../api/drama'
import { assetDetailInfo, formatMediaDuration, type AssetDetailRecord } from '../../lib/assetDetails'
import { formatDateTime } from '../../i18n'
import { canvasMediaFilename, downloadCanvasMedia, downloadCanvasText, isPlayableVideoUrl, videoPosterUrl } from '../../lib/canvasNodeMedia'
import { AssetVisual } from './AssetLibrary'
import { DetailPrompt, DetailReferences, DetailReferencePreview, readableDetailPrompt, type ReferencePreview } from './AssetDetailReferences'
import './asset-detail.css'
import { tv } from '../../i18n/tv'

type Props = {
  asset: AssetDetailRecord
  open?: boolean
  onClose: () => void
  actions?: ReactNode
  children?: ReactNode
  notice?: ReactNode
  description?: string
  audioUrl?: string | null
}

/** 展示并下载当前媒体；各业务入口仅通过插槽提供编辑/生成操作。 */
export function AssetDetailDialog({ asset, open = true, onClose, actions, children, notice, description, audioUrl }: Props) {
  /* zoomed 为媒体放大态；feedback 为复制/下载反馈；dimensions 为浏览器实际读取的媒体尺寸。 */
  const [zoomed, setZoomed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [dimensions, setDimensions] = useState('')
  const [mediaDuration, setMediaDuration] = useState('')
  const [playback, setPlayback] = useState({ current: 0, duration: 0 })
  const [referencePreview, setReferencePreview] = useState<ReferencePreview | null>(null)
  const info = assetDetailInfo(asset)
  const title = asset.name || info.filename || tv('资产详情', 'Chi tiết tài sản')
  const url = resolveDramaMediaUrl(asset.url || asset.cover)
  const audio = resolveDramaMediaUrl(audioUrl)
  const kind = asset.type === 'text' ? 'text' : asset.type === 'voice' || asset.type === 'audio' || asset.asset_type === 'audio' ? 'audio' : asset.type === 'video' || asset.asset_type === 'video' || isPlayableVideoUrl(url) ? 'video' : 'image'
  const text = String(asset.params?.textContent || '')
  const prompt = info.prompt || description || ''
  const labels: Record<string, string> = { character: tv('角色', 'Nhân vật'), scene: tv('场景', 'Bối cảnh'), prop: tv('道具', 'Đạo cụ'), voice: tv('音色', 'Giọng nói'), image: tv('图片', 'Hình ảnh'), video: tv('视频', 'Video'), audio: tv('音频', 'Âm thanh'), text: tv('文本', 'Văn bản') }

  useEffect(() => {
    if (open) { setZoomed(false); setFeedback(''); setDimensions(''); setMediaDuration(''); setPlayback({ current: 0, duration: 0 }); setReferencePreview(null) }
  }, [open, asset.id, asset.url])

  /** 复制完整提示词，折叠展示不会截断复制内容。 */
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(readableDetailPrompt(prompt, info.references)); setFeedback(tv('已复制完整提示词', 'Đã sao chép toàn bộ prompt')) }
    catch { setFeedback(tv('复制失败，请手动复制', 'Sao chép thất bại, vui lòng sao chép thủ công')) }
  }

  /** 下载当前版本的媒体或文本。 */
  async function download() {
    if (downloading) return
    setDownloading(true)
    try {
      if (kind === 'text') downloadCanvasText(text, title)
      else await downloadCanvasMedia(url, canvasMediaFilename(title, url, kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png'))
      setFeedback(tv('已开始下载', 'Đã bắt đầu tải xuống'))
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : tv('下载失败', 'Tải xuống thất bại')) }
    finally { setDownloading(false) }
  }

  if (!open) return null
  return <Modal open={open} onClose={onClose} size="xl" className="pf-asset-detail-shell">
    <div className={`pf-asset-detail-dialog${zoomed ? ' is-zoomed' : ''}`}>
      <section className={`pf-asset-detail-media is-${kind}`} aria-label={tv("媒体预览", "Xem trước phương tiện")}>
        {kind === 'video' && url ? <video key={url} src={url} poster={videoPosterUrl(resolveDramaMediaUrl(asset.cover))} controls playsInline preload="metadata" onTimeUpdate={event => { const currentTime = event.currentTarget.currentTime; setPlayback(current => ({ ...current, current: currentTime })) }} onLoadedMetadata={(event) => { const media = event.currentTarget; setDimensions(media.videoWidth > 0 && media.videoHeight > 0 ? `${media.videoWidth} × ${media.videoHeight}` : ''); setMediaDuration(formatMediaDuration(media.duration)); setPlayback({ current: media.currentTime, duration: Number.isFinite(media.duration) ? media.duration : 0 }) }} />
          : kind === 'audio' ? <div className="pf-asset-detail-audio"><AssetVisual asset={asset} />{url && <audio key={url} src={url} controls preload="metadata" onLoadedMetadata={(event) => setMediaDuration(formatMediaDuration(event.currentTarget.duration))} />}</div>
          : kind === 'text' ? <pre>{text || tv('暂无文本', 'Chưa có văn bản')}</pre>
          : url ? <img key={url} src={url} alt={title} onLoad={(event) => { const media = event.currentTarget; setDimensions(`${media.naturalWidth} × ${media.naturalHeight}`) }} />
          : <AssetVisual asset={asset} />}
        {audio && kind === 'image' && <audio className="pf-asset-detail-voice" src={audio} controls preload="none" />}
        {kind === 'video' && playback.duration > 0 && <span className="pf-asset-detail-time" aria-hidden>{playback.current.toFixed(2)} / {playback.duration.toFixed(2)}s</span>}
        <div className="pf-asset-detail-media-tools">
          {kind === 'image' && url && <button type="button" onClick={() => setZoomed(!zoomed)} aria-label={zoomed ? tv('退出放大', 'Thoát phóng to') : tv('放大预览', 'Phóng to xem trước')}>{zoomed ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>}
          <button type="button" onClick={onClose} aria-label={tv("关闭资产详情", "Đóng chi tiết tài sản")}><X size={20} /></button>
        </div>
      </section>
      <aside className="pf-asset-detail-sidebar">
        <div className="pf-asset-detail-scroll">
          <span className="pf-asset-detail-type">{labels[asset.type] || labels[kind] || asset.type}</span>
          <h2 title={title}>{title}</h2>
          {notice}
          {prompt && <section className="pf-asset-detail-prompt"><h3>{info.source === 'AI 生成' ? tv('生成提示词', 'Prompt tạo') : tv('资产说明', 'Mô tả tài sản')}</h3><DetailPrompt key={`${asset.id}:${url}`} text={prompt} references={info.references} onPreview={setReferencePreview} /></section>}
          <DetailReferences references={info.references} onPreview={setReferencePreview} />
          <dl className="pf-asset-detail-meta">
            <dt>{tv("来源", "Nguồn")}</dt><dd>{info.source}</dd>
            {info.source !== '上传' && <><dt>{tv("模型", "Model")}</dt><dd title={info.model}>{info.model || tv('未记录', 'Chưa ghi nhận')}</dd></>}
            {dimensions && <><dt>{tv("媒体尺寸", "Kích thước phương tiện")}</dt><dd>{dimensions}</dd></>}
            {(mediaDuration || info.mediaDuration) && <><dt>{kind === 'audio' ? tv('音频时长', 'Thời lượng âm thanh') : tv('成片时长', 'Thời lượng phim')}</dt><dd>{mediaDuration || info.mediaDuration}</dd></>}
            {info.fileSize !== null && <><dt>{tv("文件大小", "Dung lượng tệp")}</dt><dd>{info.fileSize >= 1048576 ? `${(info.fileSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(info.fileSize / 1024))} KB`}</dd></>}
            {info.createdAt && <><dt>{tv("记录时间", "Thời gian ghi nhận")}</dt><dd title={info.createdAt}>{formatDateTime(info.createdAt)}</dd></>}
            {asset.project_id && <><dt>{tv("来源项目", "Dự án nguồn")}</dt><dd>#{asset.project_id}</dd></>}
            {info.parameters.map((item) => <div className="pf-asset-detail-meta-row" key={item.key}><dt>{item.label}</dt><dd title={item.value}>{item.value}</dd></div>)}
          </dl>
          {children}
        </div>
        <footer className="pf-asset-detail-actions">
          {feedback && <p role="status">{feedback}</p>}
          {actions}
          <div className="pf-asset-detail-utilities">
            {prompt && <button type="button" className="pf-btn pf-btn-sm" onClick={() => void copyPrompt()}><Copy size={15} />{tv("复制说明", "Sao chép mô tả")}</button>}
            <button type="button" className="pf-btn pf-btn-sm" disabled={downloading || !(url || text)} onClick={() => void download()}><Download size={15} />{downloading ? tv('下载中…', 'Đang tải xuống…') : tv('下载', 'Tải xuống')}</button>
            <button type="button" className="pf-btn pf-btn-sm" onClick={onClose}>{tv("关闭", "Đóng")}</button>
          </div>
        </footer>
      </aside>
    </div>
    {referencePreview && <DetailReferencePreview key={`${referencePreview.reference.kind}:${referencePreview.reference.url}`} preview={referencePreview} onClose={() => setReferencePreview(null)} />}
  </Modal>
}
