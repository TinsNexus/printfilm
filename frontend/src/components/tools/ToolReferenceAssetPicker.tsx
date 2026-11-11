import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { listToolReferenceAssets, type ToolReferenceAsset } from '../../api/tools'
import { AssetBanner, AssetCard, AssetEmpty, AssetGrid, AssetSearch, AssetTypeFilter } from '../assets/AssetLibrary'
import BillingErrorNotice from '../billing/BillingErrorNotice'
import Modal from '../ui/Modal'
import { useGenerationText } from '../../lib/generationMedia'
import { toolReferenceAssetKind, type GenerationReferenceKind } from '../../lib/generationReferences'
import '../../styles/generation-references.css'
import { tv } from '../../i18n/tv'

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
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : text(tv('资产库加载失败', 'Tải thư viện tài sản thất bại'), 'Could not load assets')) })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [open, kind, query, page, text])

  const visibleItems = items.filter(asset => allowedKinds.includes(toolReferenceAssetKind(asset)))
  const labels = { image: text(tv('图片', 'Hình ảnh'), 'Images'), video: text(tv('视频', 'Video'), 'Videos'), audio: text(tv('音频', 'Âm thanh'), 'Audio') }
  const options = [
    ...(allowedKinds.length === 3 ? [{ value: 'all' as const, label: text(tv('全部', 'Tất cả'), 'All') }] : []),
    ...allowedKinds.map(value => ({ value, label: labels[value] })),
  ]

  /** 确认已选资料，父组件校验通过后关闭弹窗。 */
  async function confirm() {
    if (!selected.length || busy || loading) return
    setBusy(true); setError('')
    try { await onPick(selected); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : text(tv('选择失败', 'Chọn thất bại'), 'Could not use these assets')) }
    finally { setBusy(false) }
  }

  // 多选时切换筛选/翻页保留已选，单选维持原行为。
  const resetSelection = () => { if (!multiple) setSelected([]) }

  return <Modal open={open} onClose={onClose} title={text(tv('从资产库选择参考资料', 'Chọn tài liệu tham chiếu từ thư viện tài sản'), 'Choose reference assets')} size="lg" dismissible={!busy} className="gen-reference-picker"
    footer={<>
      <button type="button" className="pf-btn" disabled={busy} onClick={onClose}>{text(tv('取消', 'Hủy'), 'Cancel')}</button>
      <button type="button" className="pf-btn pf-btn-lime" disabled={!selected.length || loading || busy} onClick={() => void confirm()}>{busy ? text(tv('选择中…', 'Đang chọn…'), 'Selecting…') : multiple && selected.length > 1 ? text(tv(`确认使用 ${selected.length} 份`, `Xác nhận dùng ${selected.length} tài liệu`), `Use ${selected.length} assets`) : text(tv('确认使用', 'Xác nhận sử dụng'), 'Use asset')}</button>
    </>}>
    <AssetBanner title={text(tv('让已有素材继续参与创作', 'Để tư liệu có sẵn tiếp tục tham gia sáng tạo'), 'Create with your existing assets')}>{multiple ? text(tv('可一次勾选多份图片、视频或音频，确认后同时加入本次生成的参考资料。', 'Có thể chọn nhiều hình ảnh, video hoặc âm thanh một lần, sau khi xác nhận sẽ cùng thêm vào tài liệu tham chiếu cho lần tạo này.'), 'Pick several images, videos or audio clips at once; all of them join this generation as references.') : text(tv('选择当前空间内可使用的图片、视频或音频，作为本次生成的参考资料。', 'Chọn hình ảnh, video hoặc âm thanh dùng được trong không gian hiện tại làm tài liệu tham chiếu cho lần tạo này.'), 'Choose an image, video or audio asset available in this workspace.')}</AssetBanner>
    <div className="pf-library-toolbar">
      <AssetTypeFilter options={options} value={kind} disabled={busy} onChange={value => { setKind(value); setPage(1); resetSelection() }} />
      <AssetSearch value={query} onChange={value => { setQuery(value); setPage(1); resetSelection() }} placeholder={text(tv('搜索资产名称或描述', 'Tìm tên hoặc mô tả tài sản'), 'Search assets')} />
    </div>
    {error && <BillingErrorNotice message={error} />}
    {loading ? <div className="gen-reference-picker-loading" role="status"><Loader2 size={20} className="gen-spin" />{text(tv('正在加载资产…', 'Đang tải tài sản…'), 'Loading assets…')}</div> : <AssetGrid picker>
      {visibleItems.map(asset => <AssetCard key={asset.id} asset={{ ...asset, type: toolReferenceAssetKind(asset) }} selected={selected.some(item => item.id === asset.id)}
        subtitle={asset.project_id ? text(tv(`项目 #${asset.project_id}`, `Dự án #${asset.project_id}`), `Project #${asset.project_id}`) : text(tv('资产库', 'Thư viện tài sản'), 'Asset library')}
        footer={labels[toolReferenceAssetKind(asset)]} onOpen={() => { if (!busy) toggle(asset) }} />)}
    </AssetGrid>}
    {!loading && !visibleItems.length && !error && <AssetEmpty>{text(tv('当前没有可选资料，试试其他分类或上传本地文件。', 'Hiện không có tài liệu để chọn, hãy thử danh mục khác hoặc tải tệp cục bộ lên.'), 'No assets found. Try another type or upload a local file.')}</AssetEmpty>}
    {total > pageSize && <div className="gen-reference-picker-pagination">
      <span>{text(tv(`共 ${total} 项 · 第 ${page} / ${Math.ceil(total / pageSize)} 页`, `Tổng ${total} mục · Trang ${page} / ${Math.ceil(total / pageSize)}`), `${total} assets · Page ${page} of ${Math.ceil(total / pageSize)}`)}{multiple && selected.length ? text(tv(` · 已选 ${selected.length} 份`, ` · Đã chọn ${selected.length} tài liệu`), ` · ${selected.length} selected`) : ''}</span>
      <button type="button" className="pf-btn pf-btn-sm" disabled={loading || busy || page <= 1} onClick={() => { setPage(value => value - 1); resetSelection() }}><ChevronLeft size={14} />{text(tv('上一页', 'Trang trước'), 'Previous')}</button>
      <button type="button" className="pf-btn pf-btn-sm" disabled={loading || busy || page * pageSize >= total} onClick={() => { setPage(value => value + 1); resetSelection() }}>{text(tv('下一页', 'Trang sau'), 'Next')}<ChevronRight size={14} /></button>
    </div>}
  </Modal>
}
