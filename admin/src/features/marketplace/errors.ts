import { points } from '../../lib/points.ts'
import { tr } from '../../i18n/translate.ts'
// 错误码与字段名：只存 key，读取时按当前语言 tr（模块级常量不能存已翻译文字）
const MESSAGE_CODES = new Set([
  'MARKETPLACE_STORAGE_UNAVAILABLE',
  'MARKETPLACE_PAYMENT_UNAVAILABLE',
  'MARKETPLACE_REVENUE_CONFIG_REQUIRED',
  'MARKETPLACE_RIGHTS_REQUIRED',
  'MARKETPLACE_EPISODE_NOT_READY',
  'MARKETPLACE_ENTITLEMENT_REQUIRED',
  'MARKETPLACE_SOURCE_NOT_READY',
  'MARKETPLACE_SOURCE_CHANGED',
  'MARKETPLACE_SOURCE_INCOMPATIBLE',
  'MARKETPLACE_TARGET_CHANGED',
  'MARKETPLACE_SYNC_IN_PROGRESS',
  'MARKETPLACE_SUBMISSIONS_DISABLED',
])
const FIELD_NAMES = new Set([
  'version', 'title', 'reason', 'checks', 'owner_id', 'user_id', 'amount_fen', 'platform_share_bps', 'enabled', 'status', 'note', 'names', 'name', 'wechat', 'hours', 'qr_asset_id', 'resolution',
])

/** 供 api.ts 等取通用提示（api.ts 在单测里以 data: URL 加载，只能经由 ./errors 取得 tr） */
export function marketplaceText(key: 'network' | 'letterNetwork' | 'letterUnavailable' | 'statusFailed' | 'previewUnavailable'): string {
  return tr(`mkErr.text.${key}`)
}

function codeMessage(code: string): string | undefined {
  return MESSAGE_CODES.has(code) ? tr(`mkErr.code.${code}`) : undefined
}

function fieldName(name: string): string | undefined {
  return FIELD_NAMES.has(name) ? tr(`mkErr.field.${name}`) : undefined
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readableText(value: string) {
  const text = value.trim().replace(/^Value error,\s*/i, '')
  return /[\u3400-\u9fff]/.test(text) ? text : undefined
}

function boundary(value: unknown, field: string): string {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return tr('mkErr.allowedRange')
  if (field === 'unlock_price_fen') return points(Number(value))
  return field.endsWith('_fen') ? `¥${(Number(value) / 100).toFixed(2)}` : String(value)
}

function explainValidation(value: Record<string, unknown>, field: string) {
  const raw = typeof value.msg === 'string' ? value.msg : ''
  const translated = readableText(raw)
  if (translated) return translated
  const ctx = record(value.ctx) || {}
  const length = (key: string) => typeof ctx[key] === 'number' && Number.isInteger(ctx[key]) && Number(ctx[key]) >= 0 ? String(ctx[key]) : tr('mkErr.requiredCount')
  switch (value.type) {
    case 'missing': return tr('mkErr.required')
    case 'string_too_short': return tr('mkErr.strMin', { n: length('min_length') })
    case 'string_too_long': return tr('mkErr.strMax', { n: length('max_length') })
    case 'too_short': return tr('mkErr.itemsMin', { n: length('min_length') })
    case 'too_long': return tr('mkErr.itemsMax', { n: length('max_length') })
    case 'greater_than': return tr('mkErr.gt', { v: boundary(ctx.gt, field) })
    case 'greater_than_equal': return tr('mkErr.ge', { v: boundary(ctx.ge, field) })
    case 'less_than': return tr('mkErr.lt', { v: boundary(ctx.lt, field) })
    case 'less_than_equal': return tr('mkErr.le', { v: boundary(ctx.le, field) })
    case 'int_parsing': case 'int_type': case 'int_from_float': return tr('mkErr.integer')
    case 'float_parsing': case 'float_type': case 'finite_number': return tr('mkErr.validNumber')
    case 'literal_error': return ctx.expected === 'True' ? tr('mkErr.checkConfirm') : tr('mkErr.validOption')
    case 'bool_parsing': case 'bool_type': return tr('mkErr.confirmOption')
    case 'extra_forbidden': return tr('mkErr.extraForbidden')
  }
  if (/field required/i.test(raw)) return tr('mkErr.required')
  if (/valid integer/i.test(raw)) return tr('mkErr.integer')
  if (/valid number/i.test(raw)) return tr('mkErr.number')
  const bound = raw.match(/(greater than or equal to|less than or equal to|greater than|less than|at least|at most)\s+(-?[\d.]+)/i)
  if (bound) {
    if (/string/i.test(raw)) return tr(/at least/i.test(bound[1]) ? 'mkErr.strMin' : 'mkErr.strMaxAlt', { n: bound[2] })
    return tr(/greater|at least/i.test(bound[1]) ? /or equal|at least/i.test(bound[1]) ? 'mkErr.ge' : 'mkErr.gt' : /or equal|at most/i.test(bound[1]) ? 'mkErr.le' : 'mkErr.lt', { v: boundary(bound[2], field) })
  }
  return tr('mkErr.checkInput')
}

function validationMessage(detail: unknown[]) {
  const lines = detail.flatMap(entry => {
    const value = record(entry)
    if (!value) return []
    const parts = (Array.isArray(value.loc) ? value.loc : []).filter(part => (typeof part === 'string' || typeof part === 'number') && !['body', 'query', 'path'].includes(String(part)))
    const field = String(parts.findLast(part => typeof part === 'string') || '')
    const location = parts.map(part => typeof part === 'number' ? tr('mkErr.itemN', { n: part + 1 }) : fieldName(String(part)) || tr('mkErr.formContent')).join(tr('mkErr.locJoin'))
    const message = explainValidation(value, field)
    return [location ? tr('mkErr.locMessage', { location, message }) : message]
  })
  return [...new Set(lines)].join(tr('mkErr.lineSep')) || tr('mkErr.checkForm')
}

function fallbackMessage(status: number) {
  if (status === 401) return tr('mkErr.http401')
  if (status === 403) return tr('mkErr.http403')
  if (status === 404) return tr('mkErr.http404')
  if (status === 409) return tr('mkErr.http409')
  if (status === 422) return tr('mkErr.checkForm')
  if (status === 429) return tr('mkErr.http429')
  return tr('mkErr.httpOther')
}

export class MarketplaceRequestError extends Error {
  code: string | undefined
  status: number

  constructor(detail: unknown, status: number, fallback?: string, cause?: unknown) {
    const object = record(detail)
    const raw = typeof detail === 'string' ? detail : typeof object?.message === 'string' ? object.message : ''
    const match = raw.match(/^(MARKETPLACE_[A-Z_]+)(?=[:：\s]|$)/)
    const code = typeof object?.code === 'string' ? object.code : match?.[1]
    const text = match ? raw.slice(match[0].length).replace(/^\s*[:：]?\s*/, '') : raw
    const message = Array.isArray(detail) ? validationMessage(detail) : readableText(text) || (code ? codeMessage(code) : undefined) || fallback || fallbackMessage(status)
    super(message, { cause })
    this.name = 'MarketplaceRequestError'
    this.code = code
    this.status = status
  }
}
