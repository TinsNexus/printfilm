import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { listToolReferenceAssets, type ToolReferenceAsset } from '../../api/tools'
import { AssetBanner, AssetCard, AssetEmpty, AssetGrid, AssetSearch, AssetTypeFilter } from '../assets/AssetLibrary'
import BillingErrorNotice from '../billing/BillingErrorNotice'
import Modal from '../ui/Modal'
import { useGenerationText } from '../../lib/generationMedia'
import { toolReferenceAssetKind, type GenerationReferenceKind } from '../../lib/generationReferences'
import '../../styles/generation-references.css'
import { tr } from '../../i18n/translate.ts'

type Props = {
  open: boolean
  onClose: () => void
  allowedKinds: GenerationReferenceKind[]
  /** 允许多选时一次确认多份资料 */
  multiple?: boolean
  onPick: (assets: ToolReferenceAsset[]) => void | Promise<void>
}

/** 复用全局资产展示，参考资料的访问权限由工具 API 校验。 */
export default function ToolReferenceAssetPicker({ open, onClose, allowedKinds, multiple = false, onPick }: Props) {
  const text = useGenerationText()
  const [items, setItems] = useState<ToolReferenceAsset[]>([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<GenerationReferenceKind | 'all'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<ToolReferenceAsset[]>([])
  const allowedKey = allowedKinds.join(',')
  const pageSize = 12

  // 打开弹窗或模型支持类型变化时，重置筛选和选择。
  useEffect(() => {
    if (!open) return
    setQuery(''); setPage(1); setSelected([]); setError(''); setItems([])
    const kinds = allowedKey.split(',').filter(Boolean) as GenerationReferenceKind[]
    setKind(kinds.length === 3 ? 'all' : kinds[0] || 'image')
  }, [open, allowedKey])

  /** 单选直接替换；多选切换勾选，跨页保留已选。 */
  function toggle(asset: ToolReferenceAsset) {
    if (!multiple) { setSelected([asset]); return }
    setSelected(previous => previous.some(item => item.id === asset.id)
      ? previous.filter(item => item.id !== asset.id)
      : [...previous, asset])
  }

  // 搜索和分类均由服务端分页，取消已过期请求以防止旧结果回写。
  useEffect(() => {
    if (!open) return
    let active = true
    const controller = new AbortController()
    setLoading(true); setError('')
    const timer = window.setTimeout(() => {
      const requestKind = kind === 'all' ? undefined : kind
      void listToolReferenceAssets({ kind: requestKind, q: query, page, pageSize }, controller.signal).then(result => {
        if (!active) return
        setItems(result.items); setTotal(result.total)
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : text(tr('toolReferenceAssetPicker.failedLoadAssetLibrary'), 'Could not load assets')) })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [open, kind, query, page, text])

  const visibleItems = items.filter(asset => allowedKinds.includes(toolReferenceAssetKind(asset)))
  const labels = { image: text(tr('toolReferenceAssetPicker.image'), 'Images'), video: text(tr('toolReferenceAssetPicker.video'), 'Videos'), audio: text(tr('toolReferenceAssetPicker.audio'), 'Audio') }
  const options = [
    ...(allowedKinds.length === 3 ? [{ value: 'all' as const, label: text(tr('toolReferenceAssetPicker.all'), 'All') }] : []),
    ...allowedKinds.map(value => ({ value, label: labels[value] })),
  ]

  /** 确认已选资料，父组件校验通过后关闭弹窗。 */
  async function confirm() {
    if (!selected.length || busy || loading) return
    setBusy(true); setError('')
    try { await onPick(selected); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : text(tr('toolReferenceAssetPicker.selectionFailed'), 'Could not use these assets')) }
    finally { setBusy(false) }
  }

  // 多选时切换筛选/翻页保留已选，单选维持原行为。
  const resetSelection = () => { if (!multiple) setSelected([]) }

  return <Modal open={open} onClose={onClose} title={text(tr('toolReferenceAssetPicker.chooseReferencesAssetLibrary'), 'Choose reference assets')} size="lg" dismissible={!busy} className="gen-reference-picker"
    footer={<>
      <button type="button" className="pf-btn" disabled={busy} onClick={onClose}>{text(tr('toolReferenceAssetPicker.cancel'), 'Cancel')}</button>
      <button type="button" className="pf-btn pf-btn-lime" disabled={!selected.length || loading || busy} onClick={() => void confirm()}>{busy ? text(tr('toolReferenceAssetPicker.selecting'), 'Selecting…') : multiple && selected.length > 1 ? text(tr('toolReferenceAssetPicker.useFiles', { length: selected.length }), `Use ${selected.length} assets`) : text(tr('toolReferenceAssetPicker.useSelected'), 'Use asset')}</button>
    </>}>
    <AssetBanner title={text(tr('toolReferenceAssetPicker.putExistingMaterialWorkAgain'), 'Create with your existing assets')}>{multiple ? text(tr('toolReferenceAssetPicker.selectSeveralImagesVideosAudio'), 'Pick several images, videos or audio clips at once; all of them join this generation as references.') : text(tr('toolReferenceAssetPicker.chooseImageVideoAudioClip'), 'Choose an image, video or audio asset available in this workspace.')}</AssetBanner>
    <div className="pf-library-toolbar">
      <AssetTypeFilter options={options} value={kind} disabled={busy} onChange={value => { setKind(value); setPage(1); resetSelection() }} />
      <AssetSearch value={query} onChange={value => { setQuery(value); setPage(1); resetSelection() }} placeholder={text(tr('toolReferenceAssetPicker.searchAssetNamesDescriptions'), 'Search assets')} />
    </div>
    {error && <BillingErrorNotice message={error} />}
    {loading ? <div className="gen-reference-picker-loading" role="status"><Loader2 size={20} className="gen-spin" />{text(tr('toolReferenceAssetPicker.loadingAssets'), 'Loading assets…')}</div> : <AssetGrid picker>
      {visibleItems.map(asset => <AssetCard key={asset.id} asset={{ ...asset, type: toolReferenceAssetKind(asset) }} selected={selected.some(item => item.id === asset.id)}
        subtitle={asset.project_id ? text(tr('toolReferenceAssetPicker.project', { project_id: asset.project_id }), `Project #${asset.project_id}`) : text(tr('toolReferenceAssetPicker.assetLibrary'), 'Asset library')}
        footer={labels[toolReferenceAssetKind(asset)]} onOpen={() => { if (!busy) toggle(asset) }} />)}
    </AssetGrid>}
    {!loading && !visibleItems.length && !error && <AssetEmpty>{text(tr('toolReferenceAssetPicker.nothingChooseHereTryAnother'), 'No assets found. Try another type or upload a local file.')}</AssetEmpty>}
    {total > pageSize && <div className="gen-reference-picker-pagination">
      <span>{text(tr('toolReferenceAssetPicker.itemsPage', { total, page, ceil: Math.ceil(total / pageSize) }), `${total} assets · Page ${page} of ${Math.ceil(total / pageSize)}`)}{multiple && selected.length ? text(tr('toolReferenceAssetPicker.selected', { length: selected.length }), ` · ${selected.length} selected`) : ''}</span>
      <button type="button" className="pf-btn pf-btn-sm" disabled={loading || busy || page <= 1} onClick={() => { setPage(value => value - 1); resetSelection() }}><ChevronLeft size={14} />{text(tr('toolReferenceAssetPicker.previous'), 'Previous')}</button>
      <button type="button" className="pf-btn pf-btn-sm" disabled={loading || busy || page * pageSize >= total} onClick={() => { setPage(value => value + 1); resetSelection() }}>{text(tr('toolReferenceAssetPicker.next'), 'Next')}<ChevronRight size={14} /></button>
    </div>}
  </Modal>
}
