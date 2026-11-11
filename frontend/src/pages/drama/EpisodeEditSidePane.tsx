import { marketText as mt } from '../../features/marketplace/translate'
import { useMarketplaceLocale } from '../../features/marketplace/useMarketplaceLocale'
/** 分集编辑右侧：分段视频预览 + 入口打开全屏分镜画布 */
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import DramaPublishModal from '../../features/marketplace/DramaPublishModal'
import { useMarketplace } from '../../features/marketplace/hooks'
import type { DramaFragment } from '../../api/drama'
import { DramaFragmentSegmentedVideoPlayer } from '../../components/drama/DramaFragmentSegmentedVideoPlayer'
import { triggerBlobDownload } from '../../lib/clientDownload'
import {
  composeEpisodeVideoClient,
  episodeComposeFilename,
  listEpisodeComposeClips,
  type EpisodeComposeProgress,
} from '../../lib/composeEpisodeVideoClient'
import { dialog } from '../../lib/dialog'
import { tv } from '../../i18n/tv'

type Props = {
  fragments: DramaFragment[]
  playingFragmentId: number | null
  onPlayingFragmentChange: (fragmentId: number) => void
  aspectRatio: string
  episodeId?: number
  projectId?: string
  episodeName?: string
  onOpenStoryboard: () => void
  /** 预览历史版本时覆盖当前镜 video src */
  previewVideoUrl?: string | null
  previewPosterUrl?: string | null
  previewLabel?: string
  onClearPreview?: () => void
  onActivatePreview?: () => void
}

/** 把合成进度转成按钮文案 */
function composeProgressLabel(progress: EpisodeComposeProgress | null, busy: boolean) {
  if (!busy) return tv('全片合成下载', 'Ghép và tải toàn phim')
  if (!progress) return tv('全片合成中…', 'Đang ghép toàn phim…')
  if (progress.phase === 'download') return tv(`拉取分镜 ${progress.done}/${progress.total}`, `Đang lấy phân cảnh ${progress.done}/${progress.total}`)
  if (progress.phase === 'server') return tv('服务端统一重编码拼接…', 'Máy chủ mã hóa lại thống nhất và ghép…')
  return tv('正在拼接…', 'Đang ghép…')
}

// 渲染分集右侧预览与画布入口
export function EpisodeEditSidePane({
  fragments,
  playingFragmentId,
  onPlayingFragmentChange,
  aspectRatio,
  episodeId,
  projectId,
  episodeName = tv('本集', 'Tập này'),
  onOpenStoryboard,
  previewVideoUrl = null,
  previewPosterUrl = null,
  previewLabel = '',
  onClearPreview,
  onActivatePreview,
}: Props) {
  useMarketplaceLocale()
  const hasSelection = playingFragmentId !== null
  /*
   * composeBusy 本地拼接中
   * composeProgress 拉取/拼接进度
   * composeError 失败原因
   */
  const { capabilities } = useMarketplace()
  const [publishOpen, setPublishOpen] = useState(false)
  const [composeBusy, setComposeBusy] = useState(false)
  const [composeProgress, setComposeProgress] = useState<EpisodeComposeProgress | null>(null)
  const [composeError, setComposeError] = useState('')
  const composeClips = listEpisodeComposeClips(fragments)
  const missingCount = fragments.length - composeClips.length

  // 浏览器内拼接已生成镜头并下载成片
  async function handleComposeDownload() {
    if (composeBusy || composeClips.length === 0) return
    if (missingCount > 0) {
      const ok = await dialog.confirm({
        title: tv('部分分镜尚未生成', 'Một số phân cảnh chưa được tạo'),
        message: tv(`有 ${missingCount} 镜还没有视频，将只拼接已生成的 ${composeClips.length} 镜。是否继续？`, `Có ${missingCount} cảnh chưa có video, chỉ ghép ${composeClips.length} cảnh đã tạo. Tiếp tục không?`),
        confirmText: tv('继续合成', 'Tiếp tục ghép'),
      })
      if (!ok) return
    }
    setComposeError('')
    setComposeBusy(true)
    setComposeProgress({ phase: 'download', done: 0, total: composeClips.length })
    try {
      const blob = await composeEpisodeVideoClient(composeClips, setComposeProgress, {
        episodeId,
      })
      triggerBlobDownload(blob, episodeComposeFilename(episodeName))
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : tv('全片合成失败', 'Ghép toàn phim thất bại'))
    } finally {
      setComposeBusy(false)
      setComposeProgress(null)
    }
  }

  return (
    <aside className="drama-ep-preview">
      <div className="drama-ep-side-header">
        <div className="drama-ep-side-tabs" role="tablist" aria-label={tv("右侧面板", "Bảng bên phải")}>
          <button type="button" role="tab" aria-selected className="active">
            {tv("预览", "Xem trước")}
          </button>
          <button type="button" role="tab" onClick={onOpenStoryboard}>
            {tv("画布", "Canvas")}
          </button>
        </div>
        <button
          type="button"
          className="drama-ep-compose-btn drama-ep-compose-btn--header"
          disabled={composeBusy || composeClips.length === 0}
          title={
            composeClips.length === 0
              ? tv('请先生成分镜视频', 'Vui lòng tạo video phân cảnh trước')
              : tv('在浏览器里把本集已生成镜头拼成一条成片并下载', 'Ghép các cảnh đã tạo của tập này thành một phim ngay trong trình duyệt và tải xuống')
          }
          onClick={() => void handleComposeDownload()}
        >
          {composeBusy ? (
            <Loader2 size={14} className="drama-ep-compose-spin" />
          ) : (
            <Download size={14} strokeWidth={1.8} />
          )}
          {composeProgressLabel(composeProgress, composeBusy)}
        </button>
        {capabilities?.enabled && projectId && episodeId ? (
          <button
            type="button"
            className="drama-ep-compose-btn drama-ep-compose-btn--header"
            onClick={() => setPublishOpen(true)}
          >
            {mt("发布到数字资产市场")}
          </button>
        ) : null}
      </div>
      {composeError ? <p className="drama-ep-compose-error drama-ep-compose-error--header">{composeError}</p> : null}

      {previewVideoUrl ? (
        <div className="drama-ep-preview-banner">
          <span>{tv("预览历史版本", "Xem trước phiên bản lịch sử")}{previewLabel ? ` · ${previewLabel}` : ''}</span>
          <div className="drama-ep-preview-banner-actions">
            {onActivatePreview ? (
              <button type="button" className="drama-ep-preview-banner-btn" onClick={onActivatePreview}>
                {tv("设为当前", "Đặt làm hiện tại")}
              </button>
            ) : null}
            {onClearPreview ? (
              <button type="button" className="drama-ep-preview-banner-btn is-ghost" onClick={onClearPreview}>
                {tv("退出预览", "Thoát xem trước")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasSelection || fragments.length === 0 ? (
        <p className="drama-ep-empty">{tv("请选择底部分镜", "Vui lòng chọn phân cảnh ở phía dưới")}</p>
      ) : (
        <div className="drama-ep-preview-inner">
          <DramaFragmentSegmentedVideoPlayer
            fragments={fragments}
            playingFragmentId={playingFragmentId}
            onPlayingFragmentChange={onPlayingFragmentChange}
            aspectRatio={aspectRatio}
            overrideVideoUrl={previewVideoUrl}
            overridePosterUrl={previewPosterUrl}
          />
          {!fragments.some((f) => f.video) && (
            <button type="button" className="drama-ep-open-canvas" onClick={onOpenStoryboard}>
              {tv("打开分镜画布", "Mở canvas phân cảnh")}
            </button>
          )}
        </div>
      )}
      {publishOpen && capabilities?.enabled && projectId && <DramaPublishModal projectId={Number(projectId)} initialEpisodeId={episodeId} onClose={() => setPublishOpen(false)} />}
    </aside>
  )
}
