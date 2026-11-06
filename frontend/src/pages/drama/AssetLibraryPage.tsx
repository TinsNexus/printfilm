/** 资产目录：项目素材、分镜与成片，以及无项目的独立生成结果。 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Pause, Play, Image } from 'lucide-react'
import { AssetBanner, AssetCard, AssetEmpty, AssetGrid, AssetSearch } from '../../components/assets/AssetLibrary'
import MediaLibraryFilters, { type MediaLibraryFilter } from '../../components/assets/MediaLibraryFilters'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import Button from '../../components/ui/Button'
import FilterSelect from '../../components/ui/FilterSelect'
import Pagination from '../../components/ui/Pagination'
import { api } from '../../api'
import { CharacterVoicePreviewButton } from '../../components/drama/CharacterVoicePreviewButton'
import { dramaApi, resolveDramaMediaUrl, type MediaLibraryItem, type MediaLibraryPage } from '../../api/drama'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import { AssetDetailDialog } from '../../components/assets/AssetDetailDialog'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import { pageCountOf } from '../../lib/pagination'
import { subscribeWorkspace, workspaceScope } from '../../features/teams/workspaceScope'
import RequireAuth from './RequireAuth'
import './drama.css'
import { tv } from '../../i18n/tv'

const PAGE_SIZE_OPTIONS = [12, 24, 36] as const
type LibraryProject = { id: number; title: string; kind: 'drama' | 'short_video' }

/** 漫剧与短视频使用独立项目编号空间，不能只传数字筛选。 */
function projectSelection(value: string): { unassigned: boolean; projectId?: number; projectKind?: LibraryProject['kind'] } {
  const [kind, rawId] = value.split(':')
  const id = Number(rawId)
  return {
    unassigned: value === 'unassigned',
    ...(Number.isInteger(id) && id > 0 && (kind === 'drama' || kind === 'short_video')
      ? { projectId: id, projectKind: kind } : {}),
  }
}

export default function AssetLibraryPage() {
  const workspaceEpoch = useSyncExternalStore(subscribeWorkspace, () => workspaceScope.epoch)
  return <RequireAuth><AssetLibraryInner key={workspaceEpoch} /></RequireAuth>
}

function previewAudio(asset: MediaLibraryItem): string {
  return asset.media_kind === 'audio' ? asset.url || '' : readAssetVoiceBinding(asset)?.url || ''
}

function AssetLibraryInner() {
  const [listing, setListing] = useState<MediaLibraryPage>({ items: [], meta: { total: 0, total_all: 0, page: 1, page_size: 12 } })
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [projectId, setProjectId] = useState('')
  const [mediaFilter, setMediaFilter] = useState<MediaLibraryFilter>({ kind: 'image', imageType: 'all', generationStatus: 'all' })
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<MediaLibraryItem | null>(null)
  const [error, setError] = useState('')
  const [playbackError, setPlaybackError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackEpoch = useRef(0)

  useEffect(() => {
    let active = true
    /** 分别读取两类项目，团队范围不列出个人短视频项目。 */
    async function loadProjects(kind: LibraryProject['kind']) {
      const rows: LibraryProject[] = []
      let page = 1
      while (active) {
        const result = kind === 'drama' ? await dramaApi.listProjects({ page, page_size: 50 }) : await api.listProjects({ page, page_size: 50 })
        if (!active) return []
        rows.push(...result.items.map((project) => ({ id: project.id, title: project.title || tv('未命名项目', 'Dự án chưa đặt tên'), kind })))
        if (rows.length >= result.meta.total || result.items.length === 0) break
        page += 1
      }
      return rows
    }
    const kinds: LibraryProject['kind'][] = workspaceScope.teamId === null ? ['drama', 'short_video'] : ['drama']
    void Promise.allSettled(kinds.map(loadProjects)).then((results) => {
      if (active) setProjects(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim().slice(0, 200)); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    dramaApi.listLibraryAssets({ type: mediaFilter.kind === 'image' && mediaFilter.imageType !== 'all' ? mediaFilter.imageType : mediaFilter.kind,
      mediaKind: mediaFilter.kind, generationStatus: mediaFilter.generationStatus, ...projectSelection(projectId), q: search, page, pageSize }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setListing(result) })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tv('加载失败', 'Tải thất bại')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mediaFilter, projectId, search, page, pageSize, revision])

  useEffect(() => {
    playbackEpoch.current += 1
    audioRef.current?.pause()
    setPlayingKey(null)
    setPlaybackError('')
    return () => { playbackEpoch.current += 1; audioRef.current?.pause() }
  }, [mediaFilter, projectId, search, page, pageSize])

  const projectOptions = useMemo(() => [
    { value: '', label: tv('全部项目', 'Tất cả dự án') }, { value: 'unassigned', label: tv('未关联项目', 'Chưa liên kết dự án') },
    ...projects.map((project) => ({ value: `${project.kind}:${project.id}`, label: `${project.kind === 'drama' ? tv('漫剧项目', 'Dự án phim truyện') : tv('AI短视频', 'Video ngắn AI')} · ${project.title}` })),
  ], [projects])
  const pageCount = pageCountOf(listing.meta.total, pageSize)

  async function toggleAudio(asset: MediaLibraryItem) {
    const epoch = ++playbackEpoch.current
    audioRef.current?.pause()
    setPlaybackError('')
    if (playingKey === asset.key) { setPlayingKey(null); return }
    const src = resolveDramaMediaUrl(previewAudio(asset))
    if (!src) return
    const audio = audioRef.current || new Audio()
    audioRef.current = audio
    audio.src = src
    audio.onended = () => { if (epoch === playbackEpoch.current) setPlayingKey(null) }
    setPlayingKey(asset.key)
    try { await audio.play() }
    catch { if (epoch === playbackEpoch.current) { setPlayingKey(null); setPlaybackError(tv('播放失败，请重试', 'Phát thất bại, vui lòng thử lại')) } }
  }

  return <AppShell active="assets">
    <div className="drama-page pf-library-panel">
      <header className="pf-library-page-head">
        <div className="pf-library-heading"><div><h1>{tv("数字资产库", "Thư viện tài sản số")}</h1><p className="pf-muted" style={{ margin: '0.35rem 0 0' }}>{tv("按图片、视频、音频浏览，可筛选已生成与未生成资产；图片可进一步筛选角色、场景与道具", "Duyệt theo hình ảnh, video, âm thanh, có thể lọc tài sản đã tạo và chưa tạo; hình ảnh có thể lọc thêm nhân vật, bối cảnh và đạo cụ")}</p></div>
          <span className="pf-library-count"><Image size={14} />{listing.meta.total} {tv("项资产", "tài sản")}</span>
        </div>
        <AssetBanner>{tv("项目素材、分镜视频与成片汇集在这里，按来源项目筛选；独立生成的素材也可直接预览与下载。", "Tư liệu dự án, video phân cảnh và phim hoàn chỉnh tập hợp ở đây, lọc theo dự án nguồn; tư liệu tạo độc lập cũng có thể xem trước và tải xuống trực tiếp.")}</AssetBanner>
        <div className="pf-library-toolbar pf-library-toolbar--hierarchical">
          <MediaLibraryFilters value={mediaFilter} onChange={value => { setMediaFilter(value); setPage(1) }} />
          <div className="pf-library-toolbar-end">
            <FilterSelect label={tv("按项目筛选", "Lọc theo dự án")} value={projectId} options={projectOptions} onChange={(value) => { setProjectId(value); setPage(1) }} />
            <AssetSearch value={query} onChange={setQuery} placeholder={tv("搜索资产名称或项目", "Tìm tên tài sản hoặc dự án")} />
          </div>
        </div>
      </header>
      {error && <div role="alert"><BillingErrorNotice message={error} className="drama-error" /><Button size="sm" onClick={() => setRevision((value) => value + 1)}>{tv("重新加载", "Tải lại")}</Button></div>}
      {playbackError && <p role="alert" className="drama-error">{playbackError}</p>}
      <div className="pf-library-meta"><p className="pf-muted" style={{ margin: 0 }} role="status">{loading ? tv('加载中…', 'Đang tải…') : tv(`共 ${listing.meta.total_all} 项 · 筛选后 ${listing.meta.total} 项 · 第 ${listing.meta.page}/${pageCount} 页`, `Tổng ${listing.meta.total_all} mục · Sau lọc ${listing.meta.total} mục · Trang ${listing.meta.page}/${pageCount}`)}</p></div>
      {loading ? <div className="pf-library-empty" aria-busy="true">{tv("正在加载资产…", "Đang tải tài sản…")}</div> : error ? null : listing.items.length === 0 ? <AssetEmpty /> : <>
        <AssetGrid>{listing.items.map((asset) => {
          const audio = asset.media_kind === 'audio'
          const preview = previewAudio(asset)
          const playing = playingKey === asset.key
          const sourceLabel = asset.source_kind === 'drama_fragment' ? tv('分镜视频', 'Video phân cảnh') : asset.source_kind === 'short_video' ? tv('AI短视频', 'Video ngắn AI') : asset.source_kind === 'task' ? tv('生成结果', 'Kết quả tạo') : asset.source_kind === 'tool' && !asset.project_id ? tv('独立生成', 'Tạo độc lập') : tv('项目素材', 'Tư liệu dự án')
          const workspaceLabel = workspaceScope.teamId === null ? tv('个人资产', 'Tài sản cá nhân') : tv('团队资产', 'Tài sản nhóm')
          return <AssetCard key={asset.key} asset={asset} subtitle={asset.project_title || (asset.project_id ? tv('项目素材', 'Tư liệu dự án') : tv('未关联项目', 'Chưa liên kết dự án'))} footer={`${sourceLabel} · ${workspaceLabel}`} updatedAt={asset.updated_at} onOpen={() => setSelectedAsset(asset)}
            status={audio ? playing ? tv('正在试听', 'Đang nghe thử') : preview ? tv('可试听', 'Có thể nghe thử') : tv('待合成', 'Chờ tổng hợp') : undefined}
            actions={<>
              {audio && preview && <button type="button" className="pf-btn pf-btn-sm" onClick={() => void toggleAudio(asset)} aria-label={playing ? tv('停止试听', 'Dừng nghe thử') : tv('试听音频', 'Nghe thử âm thanh')}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? tv('停止试听', 'Dừng nghe thử') : tv('试听', 'Nghe thử')}</button>}
              {!audio && DRAMA_VOICE_BINDING_ENABLED && preview && <CharacterVoicePreviewButton url={preview} label={asset.name || undefined} onError={setPlaybackError} />}
              {asset.project_url ? <Button to={asset.project_url} variant="ghost" size="sm">{tv("打开项目", "Mở dự án")}</Button> : <Button size="sm" onClick={() => setSelectedAsset(asset)}>{tv("查看素材", "Xem tư liệu")}</Button>}
            </>} />
        })}</AssetGrid>
        <Pagination page={listing.meta.page} pageCount={pageCount} total={listing.meta.total} pageSize={pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} onChange={setPage} ariaLabel={tv("数字资产库分页", "Phân trang thư viện tài sản số")} />
      </>}
      {selectedAsset && <AssetDetailDialog asset={selectedAsset} audioUrl={selectedAsset.media_kind !== 'audio' ? previewAudio(selectedAsset) : undefined} onClose={() => setSelectedAsset(null)} actions={selectedAsset.project_url ? <Button to={selectedAsset.project_url} variant="dark">{tv("打开来源项目", "Mở dự án nguồn")}</Button> : undefined} />}
    </div>
  </AppShell>
}
