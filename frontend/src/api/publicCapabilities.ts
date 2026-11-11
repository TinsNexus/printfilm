import { createJsonRequester } from './client'
import { requireCharacterVoiceGeneration, type PublicCapabilities } from '../lib/publicCapabilities'
import { tr } from '../i18n/translate.ts'

const request = createJsonRequester(() => { throw new Error(tr('apiPublicCapabilities.couldNotReadFeatureStatus')) })

export function getPublicCapabilities(): Promise<PublicCapabilities> {
  return request('/api/capabilities')
}

/** Check the server again at action time; a previously opened form is not authorization. */
export function ensureCharacterVoiceGenerationEnabled(): Promise<void> {
  return requireCharacterVoiceGeneration(getPublicCapabilities)
}
