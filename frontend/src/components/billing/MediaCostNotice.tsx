import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { mediaQuoteFen } from '../../lib/mediaQuote'
import { tv } from '../../i18n/tv'

export function MediaCostNotice({ modelId, resolution, seconds, count = 1 }: {
  modelId?: string; resolution?: string; seconds?: number; count?: number
}) {
  const catalog = useMediaModelsCatalog()
  if (!catalog || catalog.billing_mode !== 'fixed_media') return null
  const model = [...catalog.image_models, ...catalog.video_models].find(item => item.id === modelId)
  const price = model?.prices?.[resolution || '']
  const amount = mediaQuoteFen(price, count, seconds ?? 1)
  return <span className="media-cost-notice" role="status">
    {model?.available === false ? tv('模型暂不可用', 'Model tạm thời không khả dụng') : amount === null ? tv('当前参数无法报价，请选择已定价档位', 'Tham số hiện tại không thể báo giá, vui lòng chọn mức đã có giá') :
      tv(`¥${price}/${seconds === undefined ? '张' : '秒'} × ${seconds ?? count}${seconds === undefined ? ' 张' : ' 秒'}${seconds !== undefined && count > 1 ? ` × ${count} 条` : ''} = 预计 ¥${(amount / 100).toFixed(2)}`, `¥${price}/${seconds === undefined ? '张' : '秒'} × ${seconds ?? count}${seconds === undefined ? ' 张' : ' 秒'}${seconds !== undefined && count > 1 ? ` × ${count} 条` : ''} = dự kiến ¥${(amount / 100).toFixed(2)}`)}
  </span>
}
