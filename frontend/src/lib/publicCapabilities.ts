import { tv } from '../i18n/tv'
export type PublicCapabilities = { drama_voice_generation_enabled: boolean }

export const VOICE_GENERATION_DISABLED_MESSAGE = tv('音色生成暂时停用，可选择已有音色或上传音频。', 'Tạo giọng nói tạm thời bị dừng, có thể chọn giọng có sẵn hoặc tải âm thanh lên.')

export function characterVoiceGenerationEnabled(value: unknown): boolean {
  return value !== null && typeof value === 'object' &&
    'drama_voice_generation_enabled' in value && value.drama_voice_generation_enabled === true
}

/** Failed or older capability responses must never enable a paid generation call. */
export async function requireCharacterVoiceGeneration(load: () => Promise<unknown>): Promise<void> {
  const capabilities = await load().catch(() => null)
  if (!characterVoiceGenerationEnabled(capabilities)) throw new Error(VOICE_GENERATION_DISABLED_MESSAGE)
}
