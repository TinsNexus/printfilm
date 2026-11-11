import { points } from '../../lib/points.ts'
import { tr } from '../../i18n/translate.ts'
/** App运营只展示明确允许的业务字段，避免将Apple签名和支付密钥带到页面。 */
// 只存 key，读取时按当前语言 tr（模块级常量不能存已翻译文字）
const APP_PANEL_KEYS = ['products', 'transactions', 'notifications', 'wallets', 'recharge-orders', 'funding-sources', 'funding-reviews', 'debts', 'repayments', 'wallet-entries', 'unlock-orders', 'adjustments', 'media', 'revenue', 'settlements', 'payouts'] as const
export type AppPanel = typeof APP_PANEL_KEYS[number]
/** 面板名：可枚举 getter，Object.entries 与 appPanels[panel] 都在读取时翻译 */
export const appPanels = Object.defineProperties({}, Object.fromEntries(APP_PANEL_KEYS.map(key => [key, { enumerable: true, get: () => tr(`mkApp.panel.${key}`) }]))) as Record<AppPanel, string>

const FIELD_KEYS = new Set(['payment_amount_minor', 'storefront', 'valuation_status', 'expected_prices', 'fx_snapshot', 'spendable_fen', 'pending_commitment_fen', 'sku_id', 'balance_fen', 'frozen_fen', 'debt_fen', 'delta_fen', 'frozen_delta_fen', 'frozen_after', 'source_type', 'source_ref', 'total_units', 'total_amount_fen', 'available_units', 'cause_type', 'cause_ref', 'origin_lot_id', 'units', 'debt_id', 'allocation_id', 'repaid_units', 'outstanding_units', 'reviewed_at', 'pay_type', 'credit_fen', 'product_id', 'coins', 'price_fen', 'enabled', 'used', 'environment', 'user_id', 'owner_id', 'transaction_id', 'original_transaction_id', 'apple_transaction_id', 'status', 'currency', 'amount_fen', 'balance_coins', 'balance', 'available_coins', 'remaining_coins', 'coin_amount', 'coins_delta', 'delta_coins', 'balance_after', 'balance_after_coins', 'kind', 'action', 'publication_id', 'order_id', 'out_trade_no', 'notification_type', 'notification_uuid', 'attempts', 'error', 'next_attempt_at', 'settlement_status', 'revoked_at', 'signed_at', 'paid_at', 'created_at', 'updated_at', 'note', 'reason', 'title', 'content_type', 'content_id', 'version', 'asset_id', 'playback_status', 'media_status', 'mode', 'variant', 'month', 'gross_fen', 'platform_fen', 'creator_fen', 'revenue_gross_fen', 'channel_fee_fen', 'tax_fen', 'received_fen', 'net_platform_fen', 'share_bps', 'transaction_ids', 'ledger_ids', 'settlement_id', 'payout_id', 'operator_id', 'processed_at', 'active', 'refunded_at', 'reconciled_at', 'anomaly', 'eligible', 'reference', 'unlock_id', 'debt_offset_fen'])
/** 白名单字段名 */
function fieldName(key: string): string | undefined {
  return FIELD_KEYS.has(key) ? tr(`mkApp.field.${key}`) : undefined
}
const LABEL_KEYS = new Set(['pending_fx', 'valued', 'web_order', 'apple_transaction', 'signup_grant', 'admin_grant', 'source_refund', 'ai_overage', 'legacy_overage', 'debt_created', 'debt_repay', 'debt_release', 'debt_cancelled', 'repayment_void', 'freeze', 'settle', 'unfreeze', 'consume', 'grant', 'adjust', 'alipay', 'wxpay', 'apple_iap', 'platform_balance', 'Production', 'Sandbox', 'pending', 'processing', 'running', 'paid', 'refunded', 'refund_reversed', 'failed', 'done', 'ready', 'approved', 'draft', 'none', 'cancelled', 'revoked', 'credited', 'quarantined', 'ignored', 'reconciled', 'unsettled', 'settled', 'restricted', 'purchase', 'credit', 'topup', 'unlock', 'debit', 'refund', 'refund_return', 'refund_reversal', 'refund_restore', 'reversal', 'work', 'series_episode', 'full', 'preview', 'ONE_TIME_CHARGE', 'REFUND', 'REFUND_REVERSED', 'CONSUMPTION_REQUEST', 'TEST', 'offset_only'])
/** 状态/类型值的显示名，未知值返回 undefined */
function valueLabel(value: string): string | undefined {
  return LABEL_KEYS.has(value) ? tr(`mkApp.label.${value}`) : undefined
}

/** 界面金额使用元，财务接口仍使用整数分。 */
export function appMoney(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `¥${(value / 100).toFixed(2)}` : '—'
}

/** 只返回白名单字段，不对服务端返回的任意对象执行序列化。 */
export function appRecordFields(item: Record<string, unknown>, panel?: AppPanel): Array<[string, string]> {
  return Object.entries(item).flatMap(([key, value]) => {
    const name = fieldName(key)
    if (!name || value === null || value === undefined || value === '') return []
    let text: string
    if (key === 'expected_prices' && typeof value === 'object') text = Object.entries(value).map(([currency, amount]) => `${currency} ${(Number(amount) / 100).toFixed(2)}`).join(' / ')
    else if (key === 'fx_snapshot' && typeof value === 'object') { const rate = value as Record<string, unknown>; text = rate.cny_per_unit ? tr('mkApp.fxLine', { version: String(rate.version), rate: String(rate.cny_per_unit), source: String(rate.source) }) : tr('mkApp.pendingValuation') }
    else if (typeof value === 'boolean') text = tr(value ? 'mkApp.yes' : 'mkApp.no')
    else if (['spendable_fen', 'pending_commitment_fen', 'debt_fen', 'frozen_delta_fen', 'frozen_after', 'available_units', 'units', 'repaid_units', 'outstanding_units', 'balance_coins', 'balance', 'available_coins', 'remaining_coins', 'coin_amount', 'coins_delta', 'delta_coins', 'balance_after', 'balance_after_coins', 'balance_fen', 'frozen_fen', 'credit_fen', 'bonus_fen', 'charge_fen', 'delta_fen', 'balance_after_fen', 'unlock_price_fen', 'coins', 'total_units', 'remaining_units', 'debt_units', 'available_fen'].includes(key)) text = points(value)
    else if (key.endsWith('_fen')) text = appMoney(value)
    else if (Array.isArray(value)) text = value.filter(entry => typeof entry === 'number' || typeof entry === 'string').join(tr('mkApp.listSep')) || '—'
    else if (typeof value === 'number' || typeof value === 'string') {
      const state = String(value)
      if (key === 'settlement_status') text = (['pending', 'reconciled', 'paid', 'revoked'].includes(state) ? tr(`mkApp.settle.${state}`) : undefined) || valueLabel(state) || state
      else if (key === 'status' && panel === 'unlock-orders') text = (['paid', 'revoked'].includes(state) ? tr(`mkApp.unlock.${state}`) : undefined) || valueLabel(state) || state
      else if (key === 'status' && panel === 'payouts' && state === 'paid') text = tr('mkApp.settle.paid')
      else if (key === 'status' && panel === 'media' && state === 'done') text = tr('mkApp.label.ready')
      else text = valueLabel(state) || state
    }
    else return []
    return [[name, text] as [string, string]]
  })
}

/** 精确解析以元填写的金额；只有净到账允许负数，所有场景拒绝指数及额外小数。 */
export function appAmountFen(value: FormDataEntryValue | null, allowZero = true, allowNegative = false): number {
  const text = String(value ?? '').trim()
  if (!(allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) throw new Error(tr(allowNegative ? 'mkApp.errAmount' : 'mkApp.errAmountNonNeg'))
  const [whole, decimal = ''] = text.replace(/^-/, '').split('.')
  const fen = (Number(whole) * 100 + Number(decimal.padEnd(2, '0'))) * (text.startsWith('-') ? -1 : 1)
  if (!Number.isSafeInteger(fen) || (!allowZero && fen <= 0)) throw new Error(tr('mkApp.errAmountInvalid'))
  return fen
}

/** 财务记录关联服务端编号，不能用逗号分隔的任意字符串代替。 */
export function appRecordIds(value: FormDataEntryValue | null): number[] {
  const values = String(value ?? '').trim().split(/[\s,，]+/).filter(Boolean)
  if (!values.length || values.some(value => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error(tr('mkApp.errIds'))
  const ids = values.map(Number)
  if (new Set(ids).size !== ids.length) throw new Error(tr('mkApp.errIdsDup'))
  return ids
}
