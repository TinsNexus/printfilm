import { getActiveLocale, LOCALE_DATE, type Locale } from '../i18n/detect.ts'
/** Wallet quantities already use integer hundredths of CNY: 1 stored unit = 1 point. */
// 积分单位：按界面语言显示
const POINT_UNIT: Record<Locale, string> = { zh: '积分', en: 'Points', vi: 'điểm' }

/** 当前界面语言（与 tr() 一致） */
export function pointLocale(): Locale {
  return getActiveLocale()
}

/** 积分数值 + 单位，按语言分组千位 */
export function points(value: unknown, locale: Locale = pointLocale()): string {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? `${value.toLocaleString(LOCALE_DATE[locale])} ${POINT_UNIT[locale]}` : '—'
}

/** No rounding, exponent notation, fractions or yuan conversion for account inputs. */
export function parsePoints(value: string, max = Number.MAX_SAFE_INTEGER): number | null {
  const text = value.trim()
  if (!/^\d+$/.test(text)) return null
  const amount = Number(text)
  return Number.isSafeInteger(amount) && amount <= max ? amount : null
}

/** Display sub-point unit rates exactly; final quotes retain the existing rounding. */
export function pointUnitRate(yuan: string): string {
  if (!/^\d+(\.\d{1,4})?$/.test(yuan)) return '—'
  const [whole, fraction = ''] = yuan.split('.')
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
  const decimals = (units % 100n).toString().padStart(2, '0').replace(/0+$/, '')
  return `${units / 100n}${decimals ? '.' + decimals : ''}`
}
