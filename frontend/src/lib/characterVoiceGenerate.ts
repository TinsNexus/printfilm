/** 按角色设定 AI 生成音色并绑定到 voiceAudio（无弹窗，供卡片一键生成） */
import { dramaApi, type DramaAsset } from '../api/drama'
import { buildBoundParams } from '../pages/drama/CharacterVoiceBindModal'
import { tr } from '../i18n/translate'

export type CharacterVoiceGenerateResult = {
  character: DramaAsset
  voice: DramaAsset
}

// 根据角色资产生成音色描述、合成试听并写回绑定
export async function generateAndBindCharacterVoice(
  projectId: number,
  asset: DramaAsset,
): Promise<CharacterVoiceGenerateResult> {
  const promptResult = await dramaApi.suggestVoicePrompt({
    project_id: projectId,
    asset_id: asset.id,
  })
  const voicePrompt = (promptResult.voice_prompt || '').trim()
  if (!voicePrompt) {
    throw new Error(tr('lib.voiceDescriptionEmpty'))
  }

  const voiceResult = await dramaApi.generateVoice({
    project_id: projectId,
    name: tr('dramaVoiceBind.defaultVoiceName', { name: asset.name || tr('dramaVoiceBind.roleFallback') }),
    voice_prompt: voicePrompt,
    speaker: promptResult.speaker || undefined,
    sample_text: promptResult.sample_text || undefined,
    character_asset_id: asset.id,
  })
  const voice = voiceResult.asset
  if (!voice?.url) {
    throw new Error(tr('lib.voiceSynthesisFailed'))
  }

  const character = await dramaApi.updateAsset(asset.id, {
    params: buildBoundParams(asset, voice),
  })
  return { character, voice }
}
