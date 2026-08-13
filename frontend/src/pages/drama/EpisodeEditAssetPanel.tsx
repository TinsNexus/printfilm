/** 分集编辑：左侧资产栏（本集/全集 + 分类卡片） */
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import {
  ASSET_TABS,
  normalizeAssetTab,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'

type Props = {
  scope: AssetScope
  tab: AssetTab | null
  assets: DramaAsset[]
  activeIds?: Set<number>
  onScopeChange: (scope: AssetScope) => void
  onTabChange: (tab: AssetTab | null) => void
  onOpenCanvas: () => void
  onMention: (asset: DramaAsset) => void
  onGenerateVoice?: (asset: DramaAsset) => void
  voiceBusyIds?: ReadonlySet<number>
  onVoiceError?: (message: string) => void
}

// 渲染分集编辑左侧资产栏
export function EpisodeEditAssetPanel({
  scope,
  tab,
  assets,
  activeIds,
  onScopeChange,
  onTabChange,
  onOpenCanvas,
  onMention,
  onGenerateVoice,
  voiceBusyIds,
  onVoiceError,
}: Props) {
  return (
    <aside className="drama-ep-assets">
      <div className="drama-ep-assets-top">
        <div className="drama-ep-scope">
          <button
            type="button"
            className={scope === 'episode' ? 'active' : ''}
            onClick={() => onScopeChange('episode')}
          >
            本集
          </button>
          <button
            type="button"
            className={scope === 'series' ? 'active' : ''}
            onClick={() => onScopeChange('series')}
          >
            全集
          </button>
        </div>
        <button
          type="button"
          className="drama-ep-icon-btn solid"
          aria-label="打开分镜故事板画布"
          onClick={onOpenCanvas}
        >
          +
        </button>
      </div>
      <div className="drama-ep-asset-tabs">
        {ASSET_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'active' : ''}
            onClick={() => onTabChange(tab === item.key ? null : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="drama-ep-asset-grid">
        {assets.length === 0 ? (
          <p className="drama-ep-empty">
            {scope === 'episode'
              ? '本集暂无引用素材，可切换「全集」或点击资产插入脚本'
              : '暂无素材，可打开分镜画布或前往资产画布添加'}
          </p>
        ) : (
          assets.map((asset) => {
            const cover = resolveDramaMediaUrl(asset.cover || asset.url)
            const isScene = normalizeAssetTab(asset.type) === 'scene'
            const isCharacter = normalizeAssetTab(asset.type) === 'character'
            const voice = isCharacter ? readAssetVoiceBinding(asset) : null
            const isActive = activeIds?.has(asset.id)
            const voiceGenerating = voiceBusyIds?.has(asset.id) ?? false
            return (
              <div key={asset.id} className="drama-ep-asset-card-wrap">
                <button
                  type="button"
                  className={`drama-ep-asset-card ${isScene ? 'scene' : ''}${isActive ? ' is-linked' : ''}`}
                  onClick={() => onMention(asset)}
                  title={isActive ? '本镜已关联 · 点击再次插入' : '点击插入到当前分镜'}
                >
                  <div className="drama-ep-asset-thumb">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span>{(asset.name || '?')[0]}</span>
                    )}
                  </div>
                  <span className="drama-ep-asset-name">{asset.name || `资产 ${asset.id}`}</span>
                  {isActive ? <span className="drama-ep-asset-linked">已关联</span> : null}
                  {voice ? <span className="drama-ep-asset-voice">音色</span> : null}
                </button>
                {isCharacter && onGenerateVoice ? (
                  voice ? (
                    <CharacterVoicePreviewButton
                      url={voice.url}
                      label={voice.label}
                      variant="inline"
                      className="drama-ep-asset-voice-btn is-bound"
                      onError={onVoiceError}
                    />
                  ) : (
                    <button
                      type="button"
                      className="drama-ep-asset-voice-btn"
                      disabled={voiceGenerating}
                      onClick={(e) => {
                        e.stopPropagation()
                        onGenerateVoice(asset)
                      }}
                    >
                      {voiceGenerating ? '生成中…' : '生成音色'}
                    </button>
                  )
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
