import { formatNumber } from '../i18n/detect.ts';
import { tr } from '../i18n/translate.ts';

/** Account quantities only. Payment, costs and creator revenue remain money. 单位随界面语言（积分 / Points / điểm） */
export function points(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) ? tr('pointsUnit.amount', { n: formatNumber(value) }) : '—';
}

export function parsePoints(value: string, max = Number.MAX_SAFE_INTEGER): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount <= max ? amount : null;
}
