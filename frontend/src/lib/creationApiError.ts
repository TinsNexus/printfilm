import { tr } from '../i18n/translate.ts'
/** 框架的通用 404 表示接口未加载；业务 404 则保留会话不存在等真实原因。 */
export function creationApiErrorDetail(status: number, detail: unknown): unknown {
  if (status !== 404) return detail
  if (typeof detail === 'string' && detail.trim().toLowerCase() === 'not found')
    return tr('creationApiError.creationServiceApiNotLoaded')
  if (detail === '创作会话不存在')
    return tr('creationApiError.creationSessionDoesNotExist')
  return detail
}
