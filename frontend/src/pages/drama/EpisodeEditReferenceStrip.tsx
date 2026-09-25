/** 分镜顶部：已关联资产缩略图条 */
import type { FragmentRefStripItem } from './dramaEpisodeEditUtils'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import { useI18n } from '../../i18n'

type Props = {
  items: FragmentRefStripItem[]
  onSelect?: (assetId: number) => void
}

// 渲染当前分镜关联资产条
export function EpisodeEditReferenceStrip({ items, onSelect }: Props) {
  const { t: tx } = useI18n()
  if (items.length === 0) {
    return (
      <div className="drama-ep-ref-strip is-empty">
        <span className="drama-ep-ref-strip-hint">{tx('refStrip.linkedAssetsClickCard')}</span>
      </div>
    )
  }

  return (
    <div className="drama-ep-ref-strip" aria-label={tx('refStrip.assetsLinkedShot')}>
      {items.map((item) => (
        <button
          key={item.assetId}
          type="button"
          className={`drama-ep-ref-chip${item.isCharacter ? ' is-character' : ''}${
            item.voiceUrl ? ' has-voice' : item.isCharacter ? ' no-voice' : ''
          }`}
          title={`${item.name}${item.type ? ` · ${item.type}` : ''}${
            DRAMA_VOICE_BINDING_ENABLED && item.isCharacter
              ? item.voiceLabel
                ? tx('refStrip.voice', { itemVoiceLabel: item.voiceLabel })
                : tx('refStrip.voiceBound')
              : ''
          }`}
          onClick={() => onSelect?.(item.assetId)}
        >
          {item.previewUrl ? (
            <img src={item.previewUrl} alt="" draggable={false} />
          ) : (
            <span className="drama-ep-ref-chip-fallback">{(item.name || '?')[0]}</span>
          )}
          {DRAMA_VOICE_BINDING_ENABLED && item.isCharacter ? (
            <span className={`drama-ep-ref-voice-badge${item.voiceUrl ? ' bound' : ''}`}>
              {item.voiceUrl ? tx('refStrip.voice2') : tx('refStrip.voice3')}
            </span>
          ) : null}
          <em>{item.name}</em>
        </button>
      ))}
    </div>
  )
}
