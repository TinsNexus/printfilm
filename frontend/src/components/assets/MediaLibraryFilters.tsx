import { AudioLines, Image, Video } from 'lucide-react'
import type { MediaLibraryGenerationStatus } from '../../api/drama'
import { AssetTypeFilter } from './AssetLibrary'
import { tr } from '../../i18n/translate.ts'

export type MediaLibraryFilter = {
  kind: 'image' | 'video' | 'audio'
  imageType: 'all' | 'character' | 'scene' | 'prop'
  generationStatus: MediaLibraryGenerationStatus
}

const MEDIA_TYPES = [
  { value: 'image', label: tr('mediaLibraryFilters.image'), icon: Image },
  { value: 'video', label: tr('mediaLibraryFilters.video'), icon: Video },
  { value: 'audio', label: tr('mediaLibraryFilters.audio'), icon: AudioLines },
] as const
const IMAGE_TYPES = [
  { value: 'all', label: tr('mediaLibraryFilters.allImages') },
  { value: 'character', label: tr('mediaLibraryFilters.character') },
  { value: 'scene', label: tr('mediaLibraryFilters.scene') },
  { value: 'prop', label: tr('mediaLibraryFilters.prop') },
] as const
const GENERATION_STATUSES = [
  { value: 'all', label: tr('mediaLibraryFilters.all') },
  { value: 'generated', label: tr('mediaLibraryFilters.generated') },
  { value: 'ungenerated', label: tr('mediaLibraryFilters.notGenerated') },
] as const

/** 先选媒体大类，业务分类仅用于图片；切换大类时清空图片分类。 */
export default function MediaLibraryFilters({ value, onChange }: {
  value: MediaLibraryFilter
  onChange: (value: MediaLibraryFilter) => void
}) {
  return <div className="pf-library-filter-stack">
    <div className="pf-library-media-tabs" role="group" aria-label={tr('mediaLibraryFilters.filterMediaType')}>
      {MEDIA_TYPES.map(({ value: kind, label, icon: Icon }) => <button key={kind} type="button"
        className={`pf-library-pill${value.kind === kind ? ' is-active' : ''}`}
        aria-pressed={value.kind === kind}
        onClick={() => { if (value.kind !== kind) onChange({ ...value, kind, imageType: 'all' }) }}>
        <Icon size={17} aria-hidden />{label}
      </button>)}
    </div>
    {value.kind === 'image' && <div className="pf-library-image-categories">
      <span>{tr('mediaLibraryFilters.imageCategory')}</span>
      <AssetTypeFilter options={IMAGE_TYPES} value={value.imageType} ariaLabel={tr('mediaLibraryFilters.filterImageCategory')}
        onChange={imageType => onChange({ ...value, kind: 'image', imageType })} />
    </div>}
    <div className="pf-library-generation-status">
      <span>{tr('mediaLibraryFilters.generationStatus')}</span>
      <AssetTypeFilter options={GENERATION_STATUSES} value={value.generationStatus} ariaLabel={tr('mediaLibraryFilters.filterGenerationStatus')}
        onChange={generationStatus => onChange({ ...value, generationStatus })} />
    </div>
  </div>
}
