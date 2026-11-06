import { useEffect, useState } from 'react'
import { media, request, type Row } from './api'
import { explainMarketplaceError } from './messages'
import { tv } from '../../i18n/tv'

const fileStatusNames: Record<string, string> = { ready: tv('上传完成', 'Tải lên hoàn tất'), uploading: tv('上传中', 'Đang tải lên'), processing: tv('正在校验文件', 'Đang kiểm tra tệp'), failed: tv('文件校验失败', 'Kiểm tra tệp thất bại'), cancelled: tv('已取消上传', 'Đã hủy tải lên'), expired: tv('上传已过期', 'Tải lên đã hết hạn') }

// 浏览器原生预览；不把文件或签名链接保存到 localStorage。
export function PreviewContent({ url, filename, video = false, onReady, onFailure }: { url: string; filename: string; video?: boolean; onReady?: () => void; onFailure?: () => void }) {
  const [failed, setFailed] = useState(false)
  function fail() { setFailed(true); onFailure?.() }
  const pdf = /\.pdf$/i.test(filename)
  return <div className="pf-market-file-preview">
    {video ? <video src={url} controls preload="metadata" onLoadedMetadata={onReady} onError={fail} /> : pdf ? <><iframe src={url} title={tv(`PDF预览：${filename}`, `Xem trước PDF: ${filename}`)} onLoad={onReady} /><a href={url} target="_blank" rel="noreferrer">{tv("在新窗口查看 PDF", "Xem PDF trong cửa sổ mới")}</a></> : <img src={url} alt={filename} onLoad={onReady} onError={fail} />}
    {failed && <p role="alert">{video ? tv('视频暂时无法预览，请重新加载；若仍无法播放，可能是浏览器不支持该视频编码。', 'Video tạm thời không xem trước được, vui lòng tải lại; nếu vẫn không phát được, có thể trình duyệt không hỗ trợ bộ mã hóa video này.') : tv('文件暂时无法预览，请重新加载；若仍失败，请稍后重试或联系客服。', 'Tệp tạm thời không xem trước được, vui lòng tải lại; nếu vẫn thất bại, hãy thử lại sau hoặc liên hệ CSKH.')}</p>}
  </div>
}

export default function AssetPreview({ id, onReady, onMediaReady, hideMedia = false }: { id: number; onReady?: (id: number) => void; onMediaReady?: (id: number) => void; hideMedia?: boolean }) {
  const [asset, setAsset] = useState<Row | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true; setUrl(''); setError(''); setAsset(null)
    async function load() {
      try {
        const item = await request<Row>(`/assets/${id}`)
        if (!active) return
        setAsset(item)
        if (item.status === 'ready') {
          const link = await media('asset', id, 'original')
          if (active) {
            setUrl(link)
            // A signed cloud URL means the uploaded asset is ready to replace
            // the local object URL.  Notify the picker immediately so the
            // temporary local preview closes without another manual click.
            onReady?.(id)
          }
        } else if (item.status === 'failed') onMediaReady?.(id)
      } catch (e) { if (active) setError((e as Error).message) }
    }
    void load()
    return () => { active = false }
  }, [id, revision])
  useEffect(() => {
    if (!asset || !['uploading', 'processing'].includes(asset.status || '')) return
    const timer = window.setTimeout(() => setRevision(value => value + 1), 2000)
    return () => window.clearTimeout(timer)
  }, [asset])
  return <div className="pf-market-asset-preview"><p>{asset?.filename || tv('正在读取文件信息', 'Đang đọc thông tin tệp')} · {fileStatusNames[asset?.status || ''] || tv('正在读取状态', 'Đang đọc trạng thái')}</p>
    {url && <div hidden={hideMedia}><PreviewContent key={url} url={url} filename={asset?.filename || ''} video={asset?.kind === 'video'} onReady={() => { onReady?.(id); onMediaReady?.(id) }} onFailure={() => { onMediaReady?.(id); if (hideMedia) setError(tv('上传文件暂时无法预览，请点击“重新加载预览”重试。', 'Tệp đã tải lên tạm thời không xem trước được, vui lòng bấm “Tải lại xem trước” để thử lại.')) }} /></div>}
    {asset?.status === 'processing' && <p>{tv("文件已上传，正在校验文件信息，状态会自动更新。", "Tệp đã tải lên, đang kiểm tra thông tin tệp, trạng thái sẽ tự động cập nhật.")}</p>}
    {asset?.error && <p role="alert">{explainMarketplaceError(asset.error)}</p>}{error && <p role="alert">{error}</p>}
    <button type="button" onClick={() => setRevision(v => v + 1)}>{tv("重新加载预览", "Tải lại xem trước")}</button>
  </div>
}
