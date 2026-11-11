import { tr } from "../../i18n/translate.ts";
import { formatNumber } from "../../i18n/detect.ts";
/** Operational quantities use whole counts; never silently round input. */
export function operationInteger(value: unknown, max = 1_000_000_000): number {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) throw new Error(tr('mkOps.input.nonNegInt'))
  const number = Number(text)
  if (!Number.isSafeInteger(number) || number > max) throw new Error(tr('mkOps.input.maxCount', { n: formatNumber(max) }))
  return number
}

export function displayMetricsInput(values: Record<string, unknown>, real: Record<string, number>) {
  return Object.fromEntries(['like_count', 'favorite_count', 'share_count'].map(key => {
    const value = operationInteger(values[key])
    if (value < (real[key] || 0)) throw new Error(tr('mkOps.input.belowReal'))
    return [key, value]
  })) as Record<'like_count' | 'favorite_count' | 'share_count', number>
}
