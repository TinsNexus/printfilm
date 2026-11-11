/** 全局资产库选择弹窗：跨项目挑选图片资产（导入或应用到节点） */
import { useEffect, useMemo, useState } from 'react'
import { dramaApi, type DramaAsset } from '../../api/drama'
import { filterDramaLibraryAssets, isDramaLibraryAsset } from '../../lib/dramaLibraryAssets'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import Modal from '../../components/ui/Modal'
import { AssetBanner, AssetCard, AssetEmpty, AssetGrid, AssetSearch, AssetTypeFilter } from '../../components/assets/AssetLibrary'
import { teamsApi } from '../../api/teams'
import { projectTeam } from '../../features/teams/editLocks'
import { TeamPagination } from '../../features/teams/TeamPagination'
import './drama.css'
import { tv } from '../../i18n/tv'

export type GlobalAssetTabKey = 'character' | 'scene' | 'prop' | 'voice' | 'all'

type Props = {
  open: boolean
  onClose: () => void
  /** 当前项目 ID，用于标注来源与可选排除本项 */
  projectId: number
  /** 默认 Tab；canvas 场景可传 all */
  defaultTab?: GlobalAssetTabKey
  /** 限定可选资产 type 列表；不传则按 Tab 筛选 */
  allowedTypes?: string[]
  /** 标题 */
  title?: string
  /** 确认按钮文案 */
  confirmLabel?: string
  onPick: (asset: DramaAsset) => void | Promise<void>
}

const TABS: Array<{ key: GlobalAssetTabKey; label: string }> = [
  { key: 'character', label: tv('角色', 'Nhân vật') },
  { key: 'scene', label: tv('场景', 'Bối cảnh') },
  { key: 'prop', label: tv('道具', 'Đạo cụ') },
  ...(DRAMA_VOICE_BINDING_ENABLED ? [{ key: 'voice' as const, label: tv('音色', 'Giọng nói') }] : []),
]

// 资产是否匹配 Tab
function matchAssetTab(asset: DramaAsset, tab: GlobalAssetTabKey): boolean {
  if (!isDramaLibraryAsset(asset)) return false
  if (tab === 'all') return true
  const t = (asset.type || '').toLowerCase()
  if (tab === 'voice') return t === 'voice'
  return t === tab
}

// asset visible in picker (voice/audio with url; image needs cover/url)
function hasMedia(asset: DramaAsset): boolean {
  const t = (asset.type || '').toLowerCase()
  if (t === 'voice' || t === 'audio') return Boolean(asset.url || asset.cover)
  return Boolean(asset.url || asset.cover)
}

// 渲染全局资产库选择弹窗（使用全局 Modal）
export function GlobalAssetPickerModal({
  open,
  onClose,
  projectId,
  defaultTab = 'character',
  allowedTypes,
  title = tv('从资产库选择', 'Chọn từ thư viện tài sản'),
  confirmLabel = tv('确认使用', 'Xác nhận sử dụng'),
  onPick,
}: Props) {
  /*
   * allAssets 用户全部项目资产
   * tab 当前分类
   * query 搜索词
   * selectedId 选中资产
   * loading 加载中
   * busy 提交中
   * error 错误文案
   */
  const [allAssets, setAllAssets] = useState<DramaAsset[]>([])
  const [tab, setTab] = useState<GlobalAssetTabKey>(
    defaultTab === 'voice' && !DRAMA_VOICE_BINDING_ENABLED ? 'character' : defaultTab,
  )
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const allowedTypesKey = allowedTypes?.join(',') || ''

  useEffect(() => {
    if (!open) return
    setTab(
      defaultTab === 'voice' && !DRAMA_VOICE_BINDING_ENABLED ? 'character' : defaultTab,
    )
    setQuery('')
    setSelectedId(null)
    setError('')
    setPage(1)
  }, [open, defaultTab])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let active = true
    setLoading(true); setError('')
    const timer = window.setTimeout(() => {
      void projectTeam(projectId).then(async (teamId) => {
        if (teamId === null) { const rows = await dramaApi.listAssets(undefined, { libraryOnly: true }); if (active) { setAllAssets(filterDramaLibraryAssets(rows)); setTotal(0) }; return }
        const kind = allowedTypesKey && !allowedTypesKey.includes(',') ? allowedTypesKey : tab === 'all' ? undefined : tab
        const result = await teamsApi.assets(String(teamId), { page, page_size: 12, q: query, type: kind }, controller.signal)
        if (active) { setAllAssets(result.items.map((asset) => ({ id: Number(asset.id), name: asset.name, type: asset.type, asset_type: asset.type === 'voice' ? 'audio' : 'image', url: asset.url, cover: asset.cover, project_id: Number(asset.projectId) }))); setTotal(result.meta.total) }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : tv('资产库加载失败', 'Tải thư viện tài sản thất bại')) }).finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [open, projectId, query, tab, page, allowedTypesKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allAssets.filter((asset) => {
      if (!hasMedia(asset)) return false
      if (allowedTypes?.length) {
        const t = (asset.type || '').toLowerCase()
        if (!allowedTypes.includes(t)) {
          return false
        }
      } else if (!matchAssetTab(asset, tab)) {
        return false
      }
      if (!q) return true
      const name = (asset.name || '').toLowerCase()
      return name.includes(q) || String(asset.project_id).includes(q)
    })
  }, [allAssets, allowedTypes, query, tab])

  // 确认选用资产
  async function handleConfirm() {
    const picked = allAssets.find((a) => a.id === selectedId)
    if (!picked || busy) return
    setBusy(true)
    setError('')
    try {
      await onPick(picked)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('应用失败', 'Áp dụng thất bại'))
    } finally {
      setBusy(false)
    }
  }

  const showTabs = !allowedTypes?.length && defaultTab !== 'all'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      dismissible={!busy}
      className="drama-global-picker-modal"
      footer={
        <>
          <button type="button" className="pf-btn" onClick={onClose} disabled={busy}>
            {tv("取消", "Hủy")}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            disabled={!selectedId || busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? tv('处理中…', 'Đang xử lý…') : confirmLabel}
          </button>
        </>
      }
    >
      <AssetBanner>{tv("展示当前空间内的可用资产，跨项目复用会复制到当前项目。", "Hiển thị tài sản dùng được trong không gian hiện tại, dùng lại giữa các dự án sẽ sao chép vào dự án hiện tại.")}</AssetBanner>
      <div className="pf-library-toolbar">
        {showTabs && <AssetTypeFilter options={TABS.map((item) => ({ value: item.key, label: item.label }))} value={tab} onChange={(value) => { setTab(value); setPage(1); setSelectedId(null) }} />}
        <AssetSearch value={query} onChange={(value) => { setQuery(value); setPage(1); setSelectedId(null) }} placeholder={tv("搜索名称或项目 ID", "Tìm tên hoặc ID dự án")} />
      </div>

      {error ? <BillingErrorNotice message={error} className="drama-error" /> : null}
      {loading ? <p className="drama-muted">{tv("加载资产库…", "Đang tải thư viện tài sản…")}</p> : null}

      <AssetGrid picker>
        {filtered.map((asset) => <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedId === asset.id}
          subtitle={asset.project_id === projectId ? tv('本项目', 'Dự án này') : tv(`项目 #${asset.project_id}`, `Dự án #${asset.project_id}`)}
          footer={asset.type === 'voice' ? asset.url ? tv('已合成音色', 'Giọng đã tổng hợp') : tv('未合成音色', 'Giọng chưa tổng hợp') : tv('可复制到当前项目', 'Có thể sao chép vào dự án hiện tại')}
          onOpen={() => setSelectedId(asset.id)}
        />)}
      </AssetGrid>
      <TeamPagination page={page} total={total} onChange={setPage} />
      {!loading && filtered.length === 0 ? (
        <AssetEmpty>{tv("当前分类下暂无可用媒体，请先在项目中生成资产。", "Danh mục hiện tại chưa có phương tiện dùng được, vui lòng tạo tài sản trong dự án trước.")}</AssetEmpty>
      ) : null}
    </Modal>
  )
}

// 将外部资产复制到当前项目（导入）
export async function importGlobalAssetToProject(
  projectId: number,
  source: DramaAsset,
): Promise<DramaAsset> {
  if (!source.url && !source.cover) {
    throw new Error(tv('所选资产没有可用图片', 'Tài sản đã chọn không có ảnh dùng được'))
  }
  return dramaApi.copyAsset(source, projectId)
}

// 画布 kind → 资产 type 筛选
export function canvasKindToLibraryTypes(kind: string): string[] {
  if (kind === 'character') return ['character']
  if (kind === 'scene') return ['scene']
  if (kind === 'audio') return DRAMA_VOICE_BINDING_ENABLED ? ['audio', 'voice'] : ['audio']
  return ['prop', 'image']
}
