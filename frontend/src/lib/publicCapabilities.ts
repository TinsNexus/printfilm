import { tr } from '../i18n/translate.ts'
export type PublicCapabilities = { drama_voice_generation_enabled: boolean; registration_enabled?: boolean }

/** 自助注册是否开放；旧版服务端未返回该字段时视为开放 */
export function registrationEnabled(value: unknown): boolean {
  return !(value !== null && typeof value === 'object' && 'registration_enabled' in value && value.registration_enabled === false)
}

export const VOICE_GENERATION_DISABLED_MESSAGE = tr('publicCapabilities.voiceGenerationTemporarilyUnavailableChoose')

export function characterVoiceGenerationEnabled(value: unknown): boolean {
  return value !== null && typeof value === 'object' &&
    'drama_voice_generation_enabled' in value && value.drama_voice_generation_enabled === true
}

/** Failed or older capability responses must never enable a paid generation call. */
export async function requireCharacterVoiceGeneration(load: () => Promise<unknown>): Promise<void> {
  const capabilities = await load().catch(() => null)
  if (!characterVoiceGenerationEnabled(capabilities)) throw new Error(VOICE_GENERATION_DISABLED_MESSAGE)
}
