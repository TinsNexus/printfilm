import { points } from '../../lib/points.ts'
import { marketText as mt, marketFeedback } from './translate.ts'
import { tr } from '../../i18n/translate.ts'
/** 用户提示与接口错误码分开处理，不改变服务端状态和错误契约。 */
const businessMessages: Record<string, string> = {
  MARKETPLACE_STORAGE_UNAVAILABLE: '文件服务暂未配置或暂时不可用，请稍后重试或联系客服。',
  MARKETPLACE_PAYMENT_UNAVAILABLE: '支付服务暂不可用，请稍后重试。',
  MARKETPLACE_REVENUE_CONFIG_REQUIRED: '平台投放收益暂未开放，请联系客服确认。',
  MARKETPLACE_RIGHTS_REQUIRED: '请先确认版权信息：PRINTFILM 作品签署授权函，其他平台作品提交版权证明。',
  MARKETPLACE_EPISODE_NOT_READY: '视频尚未准备好，请稍后刷新查看。',
  MARKETPLACE_ENTITLEMENT_REQUIRED: '请先购买该发布版本的在线播放权益。',
  MARKETPLACE_SOURCE_NOT_READY: '源成片尚未就绪，请完成视频生成后再同步。',
  MARKETPLACE_SOURCE_CHANGED: '源成片已更新，请刷新并重新选择后同步。',
  MARKETPLACE_TARGET_CHANGED: '市场作品已更新，请刷新后重新确认同步内容。',
  MARKETPLACE_SOURCE_INCOMPATIBLE: '分镜视频规格不一致，请统一画幅和分辨率后重新同步。',
  MARKETPLACE_SYNC_IN_PROGRESS: '成片正在同步，请等待同步完成后再保存或提交。',
  MARKETPLACE_SUBMISSIONS_DISABLED: '招募通过平台客服接单，请在招募详情中联系客服。',
}

const fieldNames: Record<string, string> = {
  title: tr('messages.title'), description: tr('messages.description'), category: tr('messages.category'), tags: tr('messages.tags'), price_fen: tr('messages.referencePrice'),
  copyright_price_fen: tr('messages.referencePrice'), unlock_price_fen: tr('messages.viewerUnlockPrice'), share_bps: tr('messages.platformFeeRate'),
  license_scope: tr('messages.intendedLicenseUseLimits'), scope: tr('messages.licenseScope'), asset_id: tr('messages.video'), cover_asset_id: tr('messages.cover'), source: tr('messages.contentSource'),
  certificate_number: tr('messages.copyrightCertificateNumber'), certificate_asset_id: tr('messages.copyrightProofImage'), dispute_ack: tr('messages.copyrightStatement'),
  episode_no: tr('messages.episodeNumber'), episodes: tr('messages.episode'), episode_ids: tr('messages.selectedEpisode'), episode_id: tr('messages.episode'), free_episode_count: tr('messages.freeEpisodes'),
  budget_fen: tr('messages.budgetPerItem'), wanted_count: tr('messages.wantedCount'), requirements: tr('messages.deliveryRequirements'), deadline_at: tr('messages.deadline'),
  image_ids: tr('messages.referenceImages'), evidence_ids: tr('messages.evidence'), valid_until: tr('messages.licenseValidity'), details: tr('messages.copyrightInformation'),
  signer_name: tr('messages.signerName'), strokes: tr('messages.handwrittenSignature'), accepted_terms: tr('messages.licenseTerms'), adult: tr('messages.ageConfirmation'),
  read_all: tr('messages.readConfirmation'), accept_key: tr('messages.keyTermsConfirmation'), template_version: tr('messages.licenseTermsVersion'),
  sale_type: tr('messages.earningsModel'), filename: tr('messages.fileName'), size_bytes: tr('messages.fileSize'), kind: tr('messages.fileType'),
  statement: tr('messages.reportDetails'), contact: tr('messages.contact'), version: tr('messages.contentVersion'), series_version: tr('messages.shortDramaVersion'),
  drama_project_id: tr('messages.dramaProject'), project_id: tr('messages.finishedProject'), series_id: tr('messages.marketplaceShortDrama'), source_version: tr('messages.sourceVideoVersion'),
  idempotency_key: tr('messages.operationId'), target_type: tr('messages.inquiryType'), target_id: tr('messages.inquiryDetails'),
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function marketplaceErrorCode(detail: unknown): string | undefined {
  const value = record(detail)
  if (typeof value?.code === 'string') return value.code
  const message = typeof detail === 'string' ? detail : typeof value?.message === 'string' ? value.message : ''
  return message.match(/^(MARKETPLACE_[A-Z_]+)(?=[:：\s]|$)/)?.[1]
}

function readableText(text: string): string | undefined {
  const cleaned = text.trim().replace(/^Value error,\s*/i, '')
  // 两种语言的业务说明均可展示；纯错误码和底层异常使用安全回退提示。
  if (!cleaned || /^MARKETPLACE_[A-Z_]+$/.test(cleaned) || /Internal Server Error|Traceback|sqlalchemy|SELECT .* FROM|https?:\/\/|object at 0x|Error:|Exception:/i.test(cleaned)) return undefined
  return marketFeedback(cleaned)
}

function limitText(value: unknown, field: string): string {
  if (typeof value !== 'number' && typeof value !== 'string') return mt("允许的范围")
  if (field === 'unlock_price_fen') return points(Number(value))
  if (field.endsWith('_fen') && Number.isFinite(Number(value))) return `¥${(Number(value) / 100).toFixed(2)}`
  return String(value)
}

function validationMessage(row: Record<string, unknown>, field: string): string {
  const type = row.type
  const ctx = record(row.ctx) ?? {}
  const raw = typeof row.msg === 'string' ? row.msg : ''
  const ownMessage = readableText(raw)
  if (ownMessage && type === 'value_error') return ownMessage
  switch (type) {
    case 'missing': return mt("这是必填项")
    case 'string_too_short': return mt("至少填写 {0} 个字", [ctx.min_length])
    case 'string_too_long': return mt("不能超过 {0} 个字", [ctx.max_length])
    case 'too_short': return mt("至少需要 {0} 项", [ctx.min_length])
    case 'too_long': return mt("最多允许 {0} 项", [ctx.max_length])
    case 'greater_than': return mt("须大于 {0}", [limitText(ctx.gt, field)])
    case 'greater_than_equal': return mt("不能小于 {0}", [limitText(ctx.ge, field)])
    case 'less_than': return mt("须小于 {0}", [limitText(ctx.lt, field)])
    case 'less_than_equal': return mt("不能超过 {0}", [limitText(ctx.le, field)])
    case 'int_parsing': case 'int_type': case 'int_from_float': return mt("请填写整数")
    case 'float_parsing': case 'float_type': case 'finite_number': return mt("请填写有效数字")
    case 'literal_error': return ctx.expected === 'True' ? mt("请勾选确认") : mt("请选择有效选项")
    case 'bool_parsing': case 'bool_type': return mt("请确认此选项")
    case 'datetime_parsing': case 'datetime_from_date_parsing': case 'timezone_aware': return mt("请填写有效的日期和时间")
    case 'extra_forbidden': return mt("此项不支持提交，请刷新页面后重试")
  }
  if (/field required/i.test(raw)) return mt("这是必填项")
  if (/at least 1 character/i.test(raw)) return mt("不能为空")
  if (/valid integer/i.test(raw)) return mt("请填写整数")
  if (/valid number/i.test(raw)) return mt("请填写有效数字")
  return mt("请检查填写内容")
}

function explainValidation(detail: unknown[]): string {
  const lines = detail.flatMap(value => {
    const row = record(value)
    if (!row) return []
    const parts = (Array.isArray(row.loc) ? row.loc : []).filter(part => !['body', 'query', 'path'].includes(String(part)))
    const field = String(parts.at(-1) ?? '')
    const location = parts.map(part => typeof part === 'number' ? mt("第 {0} 项", [part + 1]) : mt(fieldNames[String(part)] || '') || mt("填写内容")).join(mt("的"))
    const message = validationMessage(row, field)
    return [location ? `${location}：${message}` : message]
  })
  return [...new Set(lines)].join('；') || mt("请检查表单内容和必填字段")
}

export function explainMarketplaceError(detail: unknown, status?: number): string {
  if (Array.isArray(detail)) return explainValidation(detail)
  const value = record(detail)
  const raw = typeof detail === 'string' ? detail : typeof value?.message === 'string' ? value.message : ''
  const code = marketplaceErrorCode(detail)
  // 带具体原因的业务说明优先于通用错误码说明。
  const message = readableText(raw.replace(/^MARKETPLACE_[A-Z_]+\s*[:：]?\s*/, ''))
  if (message) return message
  if (code && businessMessages[code]) return mt(businessMessages[code])
  if (status === 401) return mt("登录已过期，请重新登录后继续。")
  if (status === 403) return mt("当前账号没有执行此操作的权限。")
  if (status === 404) return mt("内容不存在或暂不可访问，请刷新后重试。")
  if (status === 409) return mt("内容状态已变化，请刷新后重新操作。")
  if (status === 413) return mt("文件超过允许大小，请选择较小的文件。")
  if (status === 422) return mt("请检查表单内容和必填字段。")
  if (status === 429) return mt("操作过于频繁，请稍后再试。")
  return mt("暂时无法完成操作，请稍后重试。")
}
