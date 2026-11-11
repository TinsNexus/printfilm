import { points, pointUnitRate } from '../../lib/points'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { mediaQuoteFen } from '../../lib/mediaQuote'
import { tr } from '../../i18n/translate.ts'

export function MediaCostNotice({ modelId, resolution, seconds, count = 1 }: {
  modelId?: string; resolution?: string; seconds?: number; count?: number
}) {
  const catalog = useMediaModelsCatalog()
  if (!catalog || catalog.billing_mode !== 'fixed_media') return null
  const model = [...catalog.image_models, ...catalog.video_models].find(item => item.id === modelId)
  const price = model?.prices?.[resolution || '']
  const amount = mediaQuoteFen(price, count, seconds ?? 1)
  return <span className="media-cost-notice" role="status">
    {model?.available === false ? '模型暂不可用' : amount === null ? '当前参数无法报价，请选择已定价档位' :
      `${pointUnitRate(price!)} ${tr('mediaCostNotice.points')}/${seconds === undefined ? tr('mediaCostNotice.image') : tr('mediaCostNotice.second')} × ${seconds ?? count}${seconds !== undefined && count > 1 ? ` × ${count}` : ''} = ${tr('mediaCostNotice.estimated')} ${points(amount)}`}
  </span>
}
