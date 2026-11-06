import type { Project } from '../../api'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { mediaQuoteFen } from '../../lib/mediaQuote'
import { MediaCostNotice } from './MediaCostNotice'
import { tv } from '../../i18n/tv'

export function ProjectMediaCostSummary({ project }: { project: Project }) {
  const catalog = useMediaModelsCatalog()
  if (catalog?.billing_mode !== 'fixed_media') return null
  const images = project.shots.filter(shot => !shot.image_url)
  const videos = project.pipeline_mode === 'image_text' ? [] : project.shots.filter(shot => !shot.video_url && shot.video_skip_reason !== 'privacy')
  const modelId = project.video_model || catalog.defaults.video_model
  const video = catalog.video_models.find(item => item.id === modelId)
  const fallback = catalog.generation_defaults?.video_resolution || '480p'
  const resolution = project.video_resolution || (project.resolution_mode === 'hd' && fallback === '480p' ? '720p' : fallback)
  const parts = videos.map(shot => mediaQuoteFen(video?.prices?.[resolution], 1, Math.trunc(shot.duration)))
  const videoFen = parts.every(value => value !== null) ? parts.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
  return <div className="media-cost-notice" role="status">
    {images.length > 0 && <div>{tv("待生成图片：", "Ảnh chờ tạo:")}<MediaCostNotice modelId={project.image_model || catalog.defaults.image_model} resolution={project.image_resolution || '2K'} count={images.length} /></div>}
    {videos.length > 0 && <div>{tv("待生成视频：", "Video chờ tạo:")}{resolution} · {videos.length} {tv("条 ·", "mục ·")} {videos.reduce((sum, shot) => sum + Math.trunc(shot.duration), 0)} {tv("秒 ·", "giây ·")} {videoFen === null ? tv('当前参数尚未定价', 'Tham số hiện tại chưa có giá') : tv(`预计 ¥${(videoFen / 100).toFixed(2)}`, `Dự kiến ¥${(videoFen / 100).toFixed(2)}`)}</div>}
    {(images.length > 0 || videos.length > 0) && <small>{tv("各阶段分别冻结；图视频按成功交付结算，配音等费用另计。", "Các giai đoạn đóng băng riêng; ảnh/video quyết toán theo kết quả giao thành công, lồng tiếng… tính riêng.")}</small>}
  </div>
}
