import { tr } from '../../i18n/translate.ts'

// 状态表只存文案 key（模块级常量不能存已翻译文字），读取时 tr
const reviewStatuses: Record<string, string> = {
  draft: 'mkStatus.review.draft', pending: 'mkStatus.review.pending', processing: 'mkStatus.review.processing', preview_failed: 'mkStatus.review.previewFailed', approved: 'mkStatus.review.approved', rejected: 'mkStatus.review.rejected',
}
const taskStatuses: Record<string, string> = {
  pending: 'mkStatus.task.pending', running: 'mkStatus.task.running', processing: 'mkStatus.task.running', done: 'mkStatus.task.done', ready: 'mkStatus.task.ready', failed: 'mkStatus.task.failed', cancelled: 'mkStatus.task.cancelled', missing: 'mkStatus.task.missing', none: 'mkStatus.task.missing',
}
const domainStatuses: Record<string, Record<string, string>> = {
  works: reviewStatuses,
  series: reviewStatuses,
  recruits: { draft: 'mkStatus.review.draft', pending: 'mkStatus.review.pending', approved: 'mkStatus.review.approved', rejected: 'mkStatus.review.rejected' },
  previews: { pending: 'mkStatus.task.pending', running: 'mkStatus.task.running', done: 'mkStatus.task.done', failed: 'mkStatus.task.failed', cancelled: 'mkStatus.task.cancelled' },
  jobs: { pending: 'mkStatus.task.pending', running: 'mkStatus.task.running', done: 'mkStatus.task.done', failed: 'mkStatus.task.failed' },
  orders: { pending: 'mkStatus.order.pending', paid: 'mkStatus.order.paid', failed: 'mkStatus.order.failed' },
  payouts: { pending: 'mkStatus.payout.pending', paid: 'mkStatus.payout.paid', failed: 'mkStatus.payout.failed' },
  reports: { pending: 'mkStatus.report.pending', resolved: 'mkStatus.report.resolved' },
  entitlements: { active: 'mkStatus.entitlement.active', inactive: 'mkStatus.entitlement.inactive' },
}
const ledgerStatuses: Record<string, string> = { pending: 'mkStatus.ledger.pending', settled: 'mkStatus.ledger.settled' }
const detailTitles: Record<string, string> = {
  works: 'mkStatus.detail.works', series: 'mkStatus.detail.series', recruits: 'mkStatus.detail.recruits', reports: 'mkStatus.detail.reports', previews: 'mkStatus.detail.previews',
  jobs: 'mkStatus.detail.jobs', submissions: 'mkStatus.detail.submissions', orders: 'mkStatus.detail.orders', entitlements: 'mkStatus.detail.entitlements', ledger: 'mkStatus.detail.ledger', payouts: 'mkStatus.detail.payouts', events: 'mkStatus.detail.events',
}

/** 按 key 取文案；没有 key 时返回 undefined，交给调用方兜底 */
function label(key: string | undefined): string | undefined {
  return key ? tr(key) : undefined
}

// 每种记录只提供服务端支持的状态筛选，避免把收益方式当作状态。
export function statusOptions(kind: string): [string, string][] {
  return Object.entries(domainStatuses[kind] || {}).map(([value, key]) => [value, tr(key)])
}

export function statusLabel(kind: string, status: unknown): string {
  if (kind === 'ledger') return label(ledgerStatuses[String(status)]) || tr('mkStatus.ledger.unknown')
  return label(domainStatuses[kind]?.[String(status)]) || tr('mkStatus.unknown')
}

export function recordStatus(kind: string, item: Record<string, unknown>): string {
  if (kind === 'entitlements') return item.active ? 'active' : 'inactive'
  if (kind === 'ledger') return String(item.settlement_status || 'pending')
  return String(item.audit_status || item.status || item.selection || '')
}

export function fieldStatusLabel(field: string, value: unknown): string | undefined {
  if (field === 'audit_status' || field === 'basic_status' || field === 'full_status') return label(reviewStatuses[String(value)])
  if (field === 'preview_status' || field === 'playback_status' || field === 'media_status') return label(taskStatuses[String(value)])
  if (field === 'settlement_status') return statusLabel('ledger', value)
  return undefined
}

export function recordDetailsTitle(kind: string): string {
  return label(detailTitles[kind]) || tr('mkStatus.detail.default')
}
