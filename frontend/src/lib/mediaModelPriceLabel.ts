import type { MediaModelOption, MediaModelsCatalog } from '../api.ts'
import { tr } from '../i18n/translate.ts'
import { pointUnitRate } from './points.ts'

/** 单价（元，四位小数）→ 1/10000 元整数，非法返回 null */
function priceUnits(yuan: string | undefined): bigint | null {
  if (!yuan || !/^\d+(\.\d{1,4})?$/.test(yuan)) return null
  const [whole, fraction = ''] = yuan.split('.')
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
  return units > 0n ? units : null
}

/**
 * 模型价格后缀：取已开放分辨率的最低～最高单价，换算成积分。
 * 例：「77–131 积分/张」「12 积分/秒」；没有价目（未发布价格或旧计费）返回空串。
 */
export function modelPriceSuffix(row: Pick<MediaModelOption, 'prices' | 'available_resolutions' | 'billing_unit'>): string {
  const prices = row.prices || {}
  const keys = row.available_resolutions?.length ? row.available_resolutions : Object.keys(prices)
  const values = keys.map(k => prices[k]).filter((v): v is string => priceUnits(v) !== null)
  if (!values.length) return ''
  values.sort((a, b) => (priceUnits(a)! < priceUnits(b)! ? -1 : priceUnits(a)! > priceUnits(b)! ? 1 : 0))
  const low = pointUnitRate(values[0])
  const high = pointUnitRate(values[values.length - 1])
  const range = low === high ? low : `${low}–${high}`
  const unit = row.billing_unit === 'second' ? tr('mediaCostNotice.second') : tr('mediaCostNotice.image')
  return `${range} ${tr('mediaCostNotice.points')}/${unit}`
}

/** 给目录里每个模型的 label 接上价格（原名保留在 name），下拉框等处直接显示 */
export function withPriceLabels(catalog: MediaModelsCatalog): MediaModelsCatalog {
  const decorate = (rows: MediaModelOption[]) => rows.map((row) => {
    const name = row.name || row.label
    const suffix = modelPriceSuffix(row)
    return { ...row, name, label: suffix ? `${name} · ${suffix}` : name }
  })
  return { ...catalog, image_models: decorate(catalog.image_models), video_models: decorate(catalog.video_models) }
}
