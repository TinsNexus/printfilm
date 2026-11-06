/** 分集编辑：左侧资产栏（本集/全集 + 分类卡片） */
import { type DramaAsset } from '../../api/drama'
import { AssetCard, AssetEmpty, AssetGrid, AssetTypeFilter } from '../../components/assets/AssetLibrary'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import { useCharacterVoiceGenerationEnabled } from '../../hooks/usePublicCapabilities'
import {
  ASSET_TABS,
  normalizeAssetTab,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'
import { tv } from '../../i18n/tv'

type Props = {
  readOnly?: boolean
  scope: AssetScope
  tab: AssetTab | null
  assets: DramaAsset[]
  activeIds?: Set<number>
  imageBusyIds?: ReadonlySet<number>
  createBusy?: boolean
  onScopeChange: (scope: AssetScope) => void
  onTabChange: (tab: AssetTab | null) => void
  onOpenCanvas: () => void
  /** 打开资产详情：编辑提示词 / 重新生成 / 上传 */
  onOpenAsset: (asset: DramaAsset) => void
  /** 插入 @asset 到当前分镜脚本 */
  onMention: (asset: DramaAsset) => void
  /** 取消当前分镜对该资产的关联（不删除资产） */
  onUnlinkAsset?: (assetId: number) => void
  onGenerateVoice?: (asset: DramaAsset) => void
  voiceBusyIds?: ReadonlySet<number>
  onVoiceError?: (message: string) => void
  /** 自定义新建当前分类资产 */
  onCreateAsset?: () => void
  /** 从全局资产库导入 */
  onImportAsset?: () => void
}

// 当前分类新建按钮文案
function createLabel(tab: AssetTab | null): string {
  if (tab === 'scene') return tv('新建场景', 'Tạo bối cảnh mới')
  if (tab === 'prop') return tv('新建道具', 'Tạo đạo cụ mới')
  return tv('新建角色', 'Tạo nhân vật mới')
}

// 渲染分集编辑左侧资产栏
export function EpisodeEditAssetPanel({
  readOnly = false,
  scope,
  tab,
  assets,
  activeIds,
  imageBusyIds,
  createBusy,
  onScopeChange,
  onTabChange,
  onOpenCanvas,
  onOpenAsset,
  onMention,
  onUnlinkAsset,
  onGenerateVoice,
  voiceBusyIds,
  onVoiceError,
  onCreateAsset,
  onImportAsset,
}: Props) {
  const voiceGenerationEnabled = useCharacterVoiceGenerationEnabled()
  return (
    <aside className="drama-ep-assets">
      <div className="drama-ep-assets-top">
        <div className="drama-ep-scope">
          <button
            type="button"
            className={scope === 'episode' ? 'active' : ''}
            onClick={() => onScopeChange('episode')}
          >
            {tv("本集", "Tập này")}
          </button>
          <button
            type="button"
            className={scope === 'series' ? 'active' : ''}
            onClick={() => onScopeChange('series')}
          >
            {tv("全集", "Toàn phim")}
          </button>
        </div>
        <button
          type="button"
          className="drama-ep-icon-btn solid"
          aria-label={tv("打开分镜故事板画布", "Mở canvas storyboard phân cảnh")}
          onClick={onOpenCanvas}
        >
          +
        </button>
      </div>
      <div className="drama-ep-asset-filters"><AssetTypeFilter options={ASSET_TABS.map((item) => ({ value: item.key, label: item.label }))} value={tab} onChange={(value) => onTabChange(tab === value ? null : value)} /></div>
      {onCreateAsset || onImportAsset ? (
        <div className="drama-ep-asset-actions">
          {onCreateAsset ? (
            <button
              type="button"
              className="drama-ep-asset-action-btn"
              disabled={readOnly || createBusy}
              onClick={onCreateAsset}
            >
              {createBusy ? tv('创建中…', 'Đang tạo…') : createLabel(tab)}
            </button>
          ) : null}
          {onImportAsset ? (
            <button
              type="button"
              className="drama-ep-asset-action-btn is-ghost"
              disabled={readOnly || createBusy}
              onClick={onImportAsset}
            >
              {tv("导入", "Nhập")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="drama-ep-asset-list"><AssetGrid compact>
        {assets.length === 0 ? (
          <AssetEmpty>
            {scope === 'episode'
              ? tv('本集暂无引用资产，可点上方「新建」加入，或切换「全集」查看项目资产', 'Tập này chưa có tài sản tham chiếu, có thể bấm “Tạo mới” phía trên để thêm, hoặc chuyển sang “Toàn phim” xem tài sản dự án')
              : tv('暂无资产，可点上方「新建 / 导入」添加', 'Chưa có tài sản, có thể bấm “Tạo mới / Nhập” phía trên để thêm')}
          </AssetEmpty>
        ) : (
          assets.map((asset) => {
            const isCharacter = normalizeAssetTab(asset.type) === 'character'
            const voice = isCharacter ? readAssetVoiceBinding(asset) : null
            const isActive = activeIds?.has(asset.id)
            const voiceGenerating = voiceBusyIds?.has(asset.id) ?? false
            const imageBusy = imageBusyIds?.has(asset.id) ?? false
            return (
              <AssetCard
                key={asset.id}
                asset={asset}
                compact
                busy={imageBusy}
                selected={Boolean(isActive)}
                status={imageBusy ? tv('生成中', 'Đang tạo') : isActive ? tv('已关联', 'Đã liên kết') : undefined}
                subtitle={voice ? tv('已绑定音色', 'Đã gắn giọng nói') : undefined}
                onOpen={() => onOpenAsset(asset)}
                actions={<>
                  {isActive && onUnlinkAsset ? (
                    <button
                      type="button"
                      className="drama-ep-asset-op-btn"
                      disabled={readOnly}
                      onClick={() => onUnlinkAsset(asset.id)}
                      title={tv("仅取消当前分镜关联，不会删除资产", "Chỉ bỏ liên kết với phân cảnh hiện tại, không xóa tài sản")}
                    >
                      {tv("取消关联", "Bỏ liên kết")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="drama-ep-asset-op-btn"
                      disabled={readOnly}
                      onClick={() => onMention(asset)}
                      title={tv("插入到当前分镜脚本", "Chèn vào kịch bản phân cảnh hiện tại")}
                    >
                      {tv("插入", "Chèn")}
                    </button>
                  )}
                  {isCharacter ? (
                    voice ? (
                      <CharacterVoicePreviewButton
                        url={voice.url}
                        label={voice.label}
                        variant="inline"
                        className="drama-ep-asset-voice-btn is-bound"
                        onError={onVoiceError}
                      />
                    ) : voiceGenerationEnabled && onGenerateVoice ? (
                      <button
                        type="button"
                        className="drama-ep-asset-voice-btn"
                        disabled={readOnly || voiceGenerating}
                        onClick={() => onGenerateVoice(asset)}
                      >
                        {voiceGenerating ? tv('生成中…', 'Đang tạo…') : tv('生成音色', 'Tạo giọng nói')}
                      </button>
                    ) : null
                  ) : null}
                </>}
              />
            )
          })
        )}
      </AssetGrid></div>
    </aside>
  )
}
