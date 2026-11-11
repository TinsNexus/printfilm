import { points } from '../../lib/points'
import type { Project } from '../../api'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { mediaQuoteFen } from '../../lib/mediaQuote'
import { MediaCostNotice } from './MediaCostNotice'
import { tr } from '../../i18n/translate.ts'

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
    {images.length > 0 && <div>{tr('projectMediaCostSummary.pendingImages')}<MediaCostNotice modelId={project.image_model || catalog.defaults.image_model} resolution={project.image_resolution || '2K'} count={images.length} /></div>}
    {videos.length > 0 && <div>{tr('projectMediaCostSummary.pendingVideos')}{tr('uiCommon.videoCostLine', { resolution, count: videos.length, seconds: videos.reduce((sum, shot) => sum + Math.trunc(shot.duration), 0) })}{videoFen === null ? tr('uiCommon.notPricedYet') : `${tr('projectMediaCostSummary.estimated')} ${points(videoFen)}`}</div>}
    {(images.length > 0 || videos.length > 0) && <small>{tr('uiCommon.stageHoldNote')}</small>}
  </div>
}
