/** 资产库「音色」Tab 单卡：描述编辑、试听与合成 */
import { Trash2 } from 'lucide-react'
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { AssetCard } from '../../components/assets/AssetLibrary'
import { tr } from '../../i18n/translate.ts'

type Props = {
  asset: DramaAsset
  promptValue: string
  synthBusy: boolean
  onPromptChange: (value: string) => void
  onPromptBlur: () => void
  onSynth?: () => void
  onDelete: () => void
  onError: (message: string) => void
}

// 渲染音色资产卡片
export function DramaVoiceAssetCard({
  asset,
  promptValue,
  synthBusy,
  onPromptChange,
  onPromptBlur,
  onSynth,
  onDelete,
  onError,
}: Props) {
  const audioSrc = resolveDramaMediaUrl(asset.url)
  const hasAudio = Boolean(audioSrc)

  return (
    <AssetCard
      asset={asset}
      subtitle={tr('dramaVoiceAssetCard.project', { project_id: asset.project_id })}
      footer={tr('dramaVoiceAssetCard.projectAssets')}
      updatedAt={asset.updated_at}
      busy={synthBusy}
      status={synthBusy ? tr('dramaVoiceAssetCard.synthesizing') : hasAudio ? tr('dramaVoiceAssetCard.synthesized') : tr('dramaVoiceAssetCard.notSynthesized')}
      actions={<>
        {hasAudio && <CharacterVoicePreviewButton url={asset.url || ''} label={asset.name || undefined} variant="button" size="sm" onError={onError} />}
        {onSynth && <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" disabled={synthBusy || !promptValue.trim()} onClick={onSynth}>
          {synthBusy ? tr('dramaVoiceAssetCard.synthesizing2') : hasAudio ? tr('dramaVoiceAssetCard.synthesizeAgain') : tr('dramaVoiceAssetCard.synthesizePrompt')}
        </button>}
        <button type="button" className="pf-btn pf-btn-sm drama-btn-danger-text" aria-label={tr('dramaVoiceAssetCard.delete', { name: asset.name || '音色' })} disabled={synthBusy} onClick={onDelete}><Trash2 size={14} />{tr('dramaVoiceAssetCard.delete2')}</button>
      </>}
    >
        <label className="pf-library-voice-field">
          <span>{tr('dramaVoiceAssetCard.voiceDescription')}</span>
          <textarea
            rows={3}
            value={promptValue}
            disabled={synthBusy}
            onChange={(e) => onPromptChange(e.target.value)}
            onBlur={onPromptBlur}
            placeholder={tr('dramaVoiceAssetCard.describeVoiceAgeGenderTone')}
          />
        </label>

        {hasAudio && <audio className="pf-library-audio" controls preload="none" src={audioSrc} />}
    </AssetCard>
  )
}
