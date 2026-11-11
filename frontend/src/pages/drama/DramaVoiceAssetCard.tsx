/** 资产库「音色」Tab 单卡：描述编辑、试听与合成 */
import { Trash2 } from 'lucide-react'
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { AssetCard } from '../../components/assets/AssetLibrary'
import { tv } from '../../i18n/tv'

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
      subtitle={tv(`项目 #${asset.project_id}`, `Dự án #${asset.project_id}`)}
      footer={tv("项目资产", "Tài sản dự án")}
      updatedAt={asset.updated_at}
      busy={synthBusy}
      status={synthBusy ? tv('合成中', 'Đang tổng hợp') : hasAudio ? tv('已合成', 'Đã tổng hợp') : tv('待合成', 'Chờ tổng hợp')}
      actions={<>
        {hasAudio && <CharacterVoicePreviewButton url={asset.url || ''} label={asset.name || undefined} variant="button" size="sm" onError={onError} />}
        {onSynth && <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" disabled={synthBusy || !promptValue.trim()} onClick={onSynth}>
          {synthBusy ? tv('合成中…', 'Đang tổng hợp…') : hasAudio ? tv('重新合成', 'Tổng hợp lại') : tv('按提示词合成', 'Tổng hợp theo prompt')}
        </button>}
        <button type="button" className="pf-btn pf-btn-sm drama-btn-danger-text" aria-label={tv(`删除 ${asset.name || '音色'}`, `Xóa ${asset.name || '音色'}`)} disabled={synthBusy} onClick={onDelete}><Trash2 size={14} />{tv("删除", "Xóa")}</button>
      </>}
    >
        <label className="pf-library-voice-field">
          <span>{tv("音色描述", "Mô tả giọng nói")}</span>
          <textarea
            rows={3}
            value={promptValue}
            disabled={synthBusy}
            onChange={(e) => onPromptChange(e.target.value)}
            onBlur={onPromptBlur}
            placeholder={tv("描述音色：年龄、性别、语气、语速…", "Mô tả giọng nói: tuổi, giới tính, giọng điệu, tốc độ…")}
          />
        </label>

        {hasAudio && <audio className="pf-library-audio" controls preload="none" src={audioSrc} />}
    </AssetCard>
  )
}
