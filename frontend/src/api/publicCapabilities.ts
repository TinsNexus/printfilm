import { createJsonRequester } from './client'
import { requireCharacterVoiceGeneration, type PublicCapabilities } from '../lib/publicCapabilities'
import { tv } from '../i18n/tv'

const request = createJsonRequester(() => { throw new Error(tv('无法读取功能状态', 'Không đọc được trạng thái chức năng')) })

export function getPublicCapabilities(): Promise<PublicCapabilities> {
  return request('/api/capabilities')
}

/** Check the server again at action time; a previously opened form is not authorization. */
export function ensureCharacterVoiceGenerationEnabled(): Promise<void> {
  return requireCharacterVoiceGeneration(getPublicCapabilities)
}
