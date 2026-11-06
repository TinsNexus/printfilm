import { AudioLines, Image, Video } from 'lucide-react'
import type { MediaLibraryGenerationStatus } from '../../api/drama'
import { AssetTypeFilter } from './AssetLibrary'
import { tv } from '../../i18n/tv'

export type MediaLibraryFilter = {
  kind: 'image' | 'video' | 'audio'
  imageType: 'all' | 'character' | 'scene' | 'prop'
  generationStatus: MediaLibraryGenerationStatus
}

const MEDIA_TYPES = [
  { value: 'image', label: tv('图片', 'Hình ảnh'), icon: Image },
  { value: 'video', label: tv('视频', 'Video'), icon: Video },
  { value: 'audio', label: tv('音频', 'Âm thanh'), icon: AudioLines },
] as const
const IMAGE_TYPES = [
  { value: 'all', label: tv('全部图片', 'Tất cả hình ảnh') },
  { value: 'character', label: tv('角色', 'Nhân vật') },
  { value: 'scene', label: tv('场景', 'Bối cảnh') },
  { value: 'prop', label: tv('道具', 'Đạo cụ') },
] as const
const GENERATION_STATUSES = [
  { value: 'all', label: tv('全部', 'Tất cả') },
  { value: 'generated', label: tv('已生成', 'Đã tạo') },
  { value: 'ungenerated', label: tv('未生成', 'Chưa tạo') },
] as const

/** 先选媒体大类，业务分类仅用于图片；切换大类时清空图片分类。 */
export default function MediaLibraryFilters({ value, onChange }: {
  value: MediaLibraryFilter
  onChange: (value: MediaLibraryFilter) => void
}) {
  return <div className="pf-library-filter-stack">
    <div className="pf-library-media-tabs" role="group" aria-label={tv("按媒体大类筛选", "Lọc theo nhóm phương tiện")}>
      {MEDIA_TYPES.map(({ value: kind, label, icon: Icon }) => <button key={kind} type="button"
        className={`pf-library-pill${value.kind === kind ? ' is-active' : ''}`}
        aria-pressed={value.kind === kind}
        onClick={() => { if (value.kind !== kind) onChange({ ...value, kind, imageType: 'all' }) }}>
        <Icon size={17} aria-hidden />{label}
      </button>)}
    </div>
    {value.kind === 'image' && <div className="pf-library-image-categories">
      <span>{tv("图片分类", "Phân loại ảnh")}</span>
      <AssetTypeFilter options={IMAGE_TYPES} value={value.imageType} ariaLabel={tv("按图片分类筛选", "Lọc theo phân loại ảnh")}
        onChange={imageType => onChange({ ...value, kind: 'image', imageType })} />
    </div>}
    <div className="pf-library-generation-status">
      <span>{tv("生成状态", "Trạng thái tạo")}</span>
      <AssetTypeFilter options={GENERATION_STATUSES} value={value.generationStatus} ariaLabel={tv("按生成状态筛选", "Lọc theo trạng thái tạo")}
        onChange={generationStatus => onChange({ ...value, generationStatus })} />
    </div>
  </div>
}
