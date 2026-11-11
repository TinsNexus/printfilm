/** 从团队共享资产提取的统一展示组件，数据与业务操作由调用方提供。 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, AudioLines, Check, Image, Layers3, Loader2, Search, Video } from 'lucide-react'
import { resolveDramaAssetPreviewUrl } from '../../api/drama'
import { isAudioUrl, isPlayableVideoUrl } from '../../lib/canvasNodeMedia'
import './asset-library.css'
import { tr } from '../../i18n/translate.ts'

export type AssetDisplay = {
  name?: string | null
  type: string
  asset_type?: string
  cover?: string | null
  url?: string | null
  updated_at?: string | null
  params?: Record<string, unknown> | null
}

type AssetCardProps = {
  asset: AssetDisplay
  subtitle?: string
  footer?: ReactNode
  updatedAt?: string | null
  onOpen?: () => void
  selected?: boolean
  busy?: boolean
  status?: string
  compact?: boolean
  children?: ReactNode
  actions?: ReactNode
}

// 展示标签统一使用中文，兼容画布中的图片与音频类型。
const ASSET_LABELS: Record<string, string> = { character: tr('assetLibrary.character'), scene: tr('assetLibrary.scene'), prop: tr('assetLibrary.prop'), voice: tr('assetLibrary.voice'), audio: tr('assetLibrary.audio'), image: tr('assetLibrary.image'), video: tr('assetLibrary.video') }

/** 日期缺失或无效时显示占位，不产生 Invalid Date。 */
function assetDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 兼容业务分类与媒体分类；音色仍然保留独立的展示名称。 */
function assetMediaType(asset: AssetDisplay): 'image' | 'video' | 'audio' {
  if (asset.type === 'voice' || asset.type === 'audio' || asset.asset_type === 'audio') return 'audio'
  const url = asset.url || asset.cover || ''
  if (asset.type === 'video' || asset.asset_type === 'video' || isPlayableVideoUrl(url) || /^data:video\//i.test(url)) return 'video'
  return isAudioUrl(url) || /^data:audio\//i.test(url) ? 'audio' : 'image'
}

/** 音视频只使用真实图片封面，无封面时不把媒体 URL 传给 img。 */
export function AssetVisual({ asset }: { asset: AssetDisplay }) {
  const kind = assetMediaType(asset)
  const cover = asset.cover || ''
  const coverIsMedia = isPlayableVideoUrl(cover) || isAudioUrl(cover) || /^data:(?:audio|video)\//i.test(cover)
  const src = resolveDramaAssetPreviewUrl({
    ...asset,
    cover: !coverIsMedia && (kind === 'image' || cover !== asset.url) ? cover : '',
    url: kind === 'image' ? asset.url : '',
  })
  const [failedSrc, setFailedSrc] = useState('')
  return src && failedSrc !== src ? (
    <img key={src} src={src} alt={asset.name || ''} loading="lazy" decoding="async" draggable={false} onError={() => setFailedSrc(src)} />
  ) : (
    <span className="pf-library-art">
      {kind === 'audio' ? <AudioLines size={48} aria-hidden="true" /> : kind === 'video' ? <Video size={46} aria-hidden="true" /> : <Image size={44} aria-hidden="true" />}
      <small>{kind === 'audio' ? asset.type === 'voice' ? tr('assetLibrary.voiceAsset') : tr('assetLibrary.audioAsset') : kind === 'video' ? tr('assetLibrary.videoAsset') : tr('assetLibrary.noPreviewImage')}</small>
    </span>
  )
}

/** 图片卡片与画布节点共用封面，画布可传入视频播放器或可编辑文本。 */
export function AssetCover({ asset, subtitle, onOpen, selected, busy, status, children, className = '', style, showLabels = true }: Pick<AssetCardProps, 'asset' | 'subtitle' | 'onOpen' | 'selected' | 'busy' | 'status' | 'children'> & { className?: string; style?: CSSProperties; showLabels?: boolean }) {
  const name = asset.name || tr('assetLibrary.untitledAsset')
  const cover = <>
    {children ?? <AssetVisual asset={asset} />}
    {showLabels && <><span className="pf-library-shade" />
    <span className="pf-library-type">{['character', 'scene', 'prop', 'voice'].includes(asset.type) ? ASSET_LABELS[asset.type] : asset.type === 'text' ? tr('assetLibrary.text') : ASSET_LABELS[assetMediaType(asset)]}</span>
    {(selected || busy || status) && <span className="pf-library-status" role={busy ? 'status' : undefined}>
      {busy ? <Loader2 size={13} className="pf-library-spinner" /> : selected ? <Check size={13} /> : null}
      {status || (busy ? tr('assetLibrary.generating') : tr('assetLibrary.selected'))}
    </span>}
    <span className="pf-library-name"><strong>{name}</strong>{subtitle && <small>{subtitle}</small>}</span>
    {onOpen && <span className="pf-library-open"><ArrowUpRight size={18} /></span>}</>}
  </>
  return onOpen ? <button type="button" className={`pf-library-cover ${className}`} style={style} onClick={onOpen} aria-label={tr('assetLibrary.open', { p: selected ? '已选择，' : '', name })} aria-pressed={selected === undefined ? undefined : selected}>{cover}</button> : <div className={`pf-library-cover ${className}`} style={style}>{cover}</div>
}

/** 方形封面、渐变标题与来源页脚；操作区独立于主按钮，支持键盘和选择态。 */
export function AssetCard({ asset, subtitle, footer, updatedAt, onOpen, selected, busy, status, compact, children, actions }: AssetCardProps) {
  return <article className={`pf-library-card${selected ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`}>
    <AssetCover asset={asset} subtitle={subtitle} onOpen={onOpen} selected={selected} busy={busy} status={status} />
    {(footer || updatedAt) && <div className="pf-library-card-foot"><span>{footer}</span>{updatedAt && <time dateTime={updatedAt}>{assetDate(updatedAt)}</time>}</div>}
    {children && <div className="pf-library-card-body">{children}</div>}
    {actions && <div className="pf-library-card-actions">{actions}</div>}
  </article>
}

/** 资产列表网格在普通页面、选择弹窗和窄侧栏中共用。 */
export function AssetGrid({ children, compact = false, picker = false }: { children: ReactNode; compact?: boolean; picker?: boolean }) {
  return <div className="pf-library-collection"><div className={`pf-library-grid${compact ? ' is-compact' : ''}${picker ? ' is-picker' : ''}`}>{children}</div></div>
}

/** 统一分类按钮；分类与数据筛选仍由调用方控制。 */
export function AssetTypeFilter<T extends string>({ options, value, onChange, disabled = false, ariaLabel = tr('assetLibrary.filterAssetType') }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (value: T) => void; disabled?: boolean; ariaLabel?: string }) {
  return <div className="pf-library-filters" role="group" aria-label={ariaLabel}>{options.map((item) => <button type="button" key={item.value} className={`pf-library-pill${value === item.value ? ' is-active' : ''}`} disabled={disabled} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}

/** 与共享资产一致的搜索框，保留原有查询与加载方式。 */
export function AssetSearch({ value, onChange, placeholder = tr('assetLibrary.searchAssetNamesDescriptions') }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="pf-library-search"><Search size={17} aria-hidden="true" /><input aria-label={tr('assetLibrary.searchAssets')} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

/** 共享资产的提示横幅，允许项目编辑页说明自己的操作方式。 */
export function AssetBanner({ title = tr('assetLibrary.createOnceLetIdeasSpark'), children }: { title?: string; children: ReactNode }) {
  return <div className="pf-library-banner" role="note"><span className="pf-library-banner-icon"><Layers3 size={23} aria-hidden="true" /></span><div><strong>{title}</strong><p>{children}</p></div></div>
}

/** 各资产入口共用的空态。 */
export function AssetEmpty({ children }: { children?: ReactNode }) {
  return <div className="pf-library-empty"><Image size={30} aria-hidden="true" /><strong>{tr('assetLibrary.noMatchingAssets')}</strong><p>{children || tr('assetLibrary.adjustFiltersAddNewAssets')}</p></div>
}
