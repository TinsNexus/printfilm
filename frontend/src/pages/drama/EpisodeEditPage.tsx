/** 分集编辑：复刻原项目四栏布局（资产 / 脚本 / 预览 / 故事板） */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dramaApi,
  resolveDramaMediaUrl,
  type DramaAsset,
  type DramaEpisode,
  type DramaFragment,
} from '../../api/drama'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  RATIO_OPTIONS,
  RES_OPTIONS,
  buildFragmentRefStripItems,
  collectFragmentAssetIds,
  extractAssetIds,
  filterEpisodeAssets,
  formatFragLabel,
  normalizeAssetTab,
  readFragmentGenerationStatus,
  resolveFragmentDurationSec,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { EpisodeEditAssetPanel } from './EpisodeEditAssetPanel'
import { EpisodeEditHeaderControls } from './EpisodeEditHeaderControls'
import { EpisodeEditPromptEditor } from './EpisodeEditPromptEditor'
import { EpisodeEditReferenceStrip } from './EpisodeEditReferenceStrip'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function EpisodeEditPage() {
  return (
    <RequireAuth>
      <EpisodeEditInner />
    </RequireAuth>
  )
}

// 分集编辑页主体
function EpisodeEditInner() {
  const { projectId, episodeId } = useParams()
  const pid = Number(projectId)
  const eid = Number(episodeId)
  const navigate = useNavigate()
  /*
   * episode 分集
   * fragments 分镜
   * assets 资产
   * selectedIndex 当前分镜
   * assetScope / assetTab 侧栏筛选
   * editing 是否编辑模式
   * videoStyleId / modelId / aspectRatio / resolution 生成参数（UI）
   * busy / status / error 状态
   */
  const [episode, setEpisode] = useState<DramaEpisode | null>(null)
  const [fragments, setFragments] = useState<DramaFragment[]>([])
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [assetScope, setAssetScope] = useState<AssetScope>('episode')
  const [assetTab, setAssetTab] = useState<AssetTab | null>('character')
  const [editing, setEditing] = useState(false)
  const [videoStyleId, setVideoStyleId] = useState<ImageStyleId | ''>('')
  const [modelId, setModelId] = useState('seedance-2.5')
  const [aspectRatio, setAspectRatio] = useState<(typeof RATIO_OPTIONS)[number]>('9:16')
  const [resolution, setResolution] = useState<(typeof RES_OPTIONS)[number]>('480p')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [genProgress, setGenProgress] = useState<Record<number, string>>({})
  const pollRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const selected = fragments[selectedIndex] || null
  const selectedDuration = selected?.duration_sec ?? 8
  const selectedRefIds = useMemo(
    () => new Set(collectFragmentAssetIds(selected)),
    [selected],
  )
  const selectedRefItems = useMemo(
    () => buildFragmentRefStripItems(selected, assets, resolveDramaMediaUrl),
    [selected, assets],
  )

  const referencedIds = useMemo(() => {
    const set = new Set<number>()
    for (const f of fragments) {
      for (const id of extractAssetIds(f.content || '')) set.add(id)
      for (const id of f.asset_ids || []) set.add(id)
    }
    return set
  }, [fragments])

  const filteredAssets = useMemo(
    () => filterEpisodeAssets(assets, assetScope, assetTab, referencedIds),
    [assets, assetScope, assetTab, referencedIds],
  )

  // 停止轮询
  function stopGeneratePolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // 应用后端生成进度并同步分镜状态
  function applyGenerateStatus(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) {
    setStatus(`完成 ${st.done}/${st.total} · 进行中 ${st.running} · 失败 ${st.failed}`)
    const byId = new Map(st.fragments.map((f) => [f.fragment_id, f.status]))
    setGenProgress(Object.fromEntries(byId))
    setFragments((prev) =>
      prev.map((f) => {
        if (!f.id) return f
        const genStatus = byId.get(f.id)
        if (!genStatus) return f
        const item = st.fragments.find((x) => x.fragment_id === f.id)
        return {
          ...f,
          video: item?.video || f.video,
          cover: item?.cover || f.cover,
          params: {
            ...(f.params || {}),
            generation: { status: genStatus, video: item?.video, cover: item?.cover },
          },
        }
      }),
    )
    return st
  }

  // 启动生成进度轮询（刷新页面后也会恢复）
  function startGeneratePolling() {
    stopGeneratePolling()
    setBusy(true)
    pollRef.current = window.setInterval(async () => {
      try {
        const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
        if (st.running === 0 && st.done + st.failed >= st.total) {
          stopGeneratePolling()
          await reload()
          setBusy(false)
        }
      } catch {
        stopGeneratePolling()
        setBusy(false)
      }
    }, 3000)
  }

  // 进页检查是否有进行中的生成任务
  async function resumeGenerateIfNeeded() {
    try {
      const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
      if (st.running > 0) startGeneratePolling()
    } catch {
      /* ignore */
    }
  }

  // 重新加载分集
  async function reload() {
    const ep = await dramaApi.getEpisode(eid)
    setEpisode(ep)
    setFragments(ep.fragments || [])
    if ((ep.fragments || []).length === 0) {
      setFragments([
        {
          id: 0,
          episode_id: eid,
          sort_order: 0,
          content: '',
          cover: '',
          video: '',
          duration_sec: 8,
          asset_ids: [],
        },
      ])
    }
    await resumeGenerateIfNeeded()
  }

  useEffect(() => {
    if (!eid || !pid) return
    reload().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    dramaApi
      .listAssets(pid)
      .then(setAssets)
      .catch(() => setAssets([]))
    // 加载项目默认画面风格到顶栏
    dramaApi
      .getProject(pid)
      .then((project) => {
        const styleId = getImageStyleId(project.script, project)
        if (styleId) setVideoStyleId(styleId as ImageStyleId)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      stopGeneratePolling()
    }
  }, [eid, pid])

  // 更新当前分镜
  function updateSelected(patch: Partial<DramaFragment>) {
    setFragments((prev) =>
      prev.map((f, i) => (i === selectedIndex ? { ...f, ...patch } : f)),
    )
  }

  // 插入空白分镜
  function insertFrag(at: number) {
    setFragments((prev) => {
      const next = [...prev]
      next.splice(at, 0, {
        id: 0,
        episode_id: eid,
        sort_order: at,
        content: '',
        cover: '',
        video: '',
        duration_sec: 8,
        asset_ids: [],
      })
      return next
    })
    setSelectedIndex(at)
    setEditing(true)
  }

  // 复制分镜
  function duplicateFrag(index: number) {
    const source = fragments[index]
    if (!source) return
    setFragments((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, {
        ...source,
        id: 0,
        sort_order: index + 1,
      })
      return next
    })
    setSelectedIndex(index + 1)
  }

  // 删除分镜
  function deleteFrag(index: number) {
    if (fragments.length <= 1) return
    setFragments((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndex((cur) => {
      if (cur === index) return Math.max(0, index - 1)
      if (cur > index) return cur - 1
      return cur
    })
  }

  // 保存全部分镜
  async function save() {
    setBusy(true)
    setError('')
    try {
      const ep = await dramaApi.saveFragments(
        eid,
        fragments.map((f, i) => ({
          sort_order: i,
          content: f.content,
          cover: f.cover,
          video: f.video,
          duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
          params: f.params,
          asset_ids: f.asset_ids || [],
        })),
      )
      setEpisode(ep)
      setFragments(ep.fragments || [])
      setStatus('已保存')
      setEditing(false)
      return ep
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      throw err
    } finally {
      setBusy(false)
    }
  }

  // 保存后生成并轮询
  async function generate() {
    if (!window.confirm('将基于当前分镜脚本生成视频，是否继续？')) return
    setBusy(true)
    setError('')
    setStatus('保存并排队生成…')
    try {
      await save()
      setBusy(true)
      await dramaApi.generateEpisode(eid)
      startGeneratePolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      setBusy(false)
    }
  }

  // 返回分集步骤
  function handleBack() {
    navigate(`/drama/projects/${pid}`, { state: { returnStep: 'episodes' } })
  }

  // 点击资产插入 @ 引用
  function mentionAsset(asset: DramaAsset) {
    if (!selected) return
    const mention = `@asset:${asset.id}`
    const raw = selected.content || ''
    const already = new RegExp(`@asset:${asset.id}(?!\\d)`).test(raw)
    const content = already ? raw : raw ? `${raw.trimEnd()}\n${mention}` : mention
    const ids = Array.from(new Set([...(selected.asset_ids || []), asset.id]))
    updateSelected({ content, asset_ids: ids })
    setEditing(true)
  }

  // 从关联条跳到对应分类
  function focusLinkedAsset(assetId: number) {
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) return
    const tab = normalizeAssetTab(asset.type)
    if (tab) setAssetTab(tab)
    setAssetScope('series')
  }

  if (!episode) {
    return (
      <div className="drama-ep-fullscreen drama-ep-center">
        {error || '加载中…'}
      </div>
    )
  }

  const previewUrl = selected?.video ? resolveDramaMediaUrl(selected.video) : ''
  const previewCover = selected?.cover ? resolveDramaMediaUrl(selected.cover) : ''

  return (
    <div className="drama-ep-fullscreen">
      <header className="drama-ep-header">
        <div className="drama-ep-header-left">
          <button type="button" className="drama-ep-icon-btn" aria-label="返回" onClick={handleBack}>
            ‹
          </button>
          <h1>{episode.name}</h1>
        </div>
        <div className="drama-ep-header-controls">
          <EpisodeEditHeaderControls
            styleId={videoStyleId}
            modelId={modelId}
            aspectRatio={aspectRatio}
            resolution={resolution}
            onStyleChange={setVideoStyleId}
            onModelChange={setModelId}
            onAspectRatioChange={setAspectRatio}
            onResolutionChange={setResolution}
            disabled={busy}
          />
        </div>
      </header>

      {(status || error) && (
        <div className="drama-ep-banner">
          {error ? <span className="drama-ep-banner-error">{error}</span> : null}
          {!error && status ? <span>{status}</span> : null}
        </div>
      )}

      <div className="drama-ep-body">
        <EpisodeEditAssetPanel
          scope={assetScope}
          tab={assetTab}
          assets={filteredAssets}
          activeIds={selectedRefIds}
          onScopeChange={setAssetScope}
          onTabChange={setAssetTab}
          onOpenCanvas={() => navigate(`/drama/projects/${pid}/canvas`)}
          onMention={mentionAsset}
        />

        <section className="drama-ep-editor">
          <div className="drama-ep-editor-head">
            <div>
              <strong>{formatFragLabel(selectedIndex, selectedDuration)}</strong>
              <p>顶部显示本镜关联；键入 @ 可引用资产或插入时长标签</p>
            </div>
            <label className="drama-ep-duration">
              时长
              <input
                type="number"
                min={4}
                max={30}
                value={selectedDuration}
                disabled={!editing && !selected}
                onChange={(e) =>
                  updateSelected({ duration_sec: Number(e.target.value) || 8 })
                }
              />
              s
            </label>
          </div>

          <EpisodeEditReferenceStrip items={selectedRefItems} onSelect={focusLinkedAsset} />

          <div className={`drama-ep-editor-box ${editing ? 'editing' : ''}`}>
            <EpisodeEditPromptEditor
              content={selected?.content || ''}
              assets={assets}
              referencedIds={referencedIds}
              editing={editing}
              onOpenAsset={focusLinkedAsset}
              onContentChange={(nextContent) => {
                const fromContent = extractAssetIds(nextContent)
                const ids = Array.from(new Set([...(selected?.asset_ids || []), ...fromContent]))
                updateSelected({ content: nextContent, asset_ids: ids })
              }}
            />
          </div>

          <div className="drama-ep-editor-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false)
                    void reload()
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? '保存中…' : '保存'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={!selected}
                  onClick={() => setEditing(true)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={busy || !selected}
                  onClick={() => void generate()}
                >
                  {busy ? '处理中…' : '生成'}
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="drama-ep-preview">
          {!selected ? (
            <p className="drama-ep-empty">请选择底部分镜</p>
          ) : (
            <div className={`drama-ep-player ratio-${aspectRatio.replace(':', 'x')}`}>
              {previewUrl ? (
                <video
                  ref={videoRef}
                  key={previewUrl}
                  src={previewUrl}
                  poster={previewCover || undefined}
                  controls
                  playsInline
                />
              ) : previewCover ? (
                <img src={previewCover} alt="" />
              ) : (
                <div className="drama-ep-player-placeholder">
                  <span>暂无预览</span>
                  <small>生成后将在此播放</small>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="drama-ep-storyboard">
        <div className="drama-ep-storyboard-row">
          <button
            type="button"
            className="drama-ep-insert"
            aria-label="在开头插入分镜"
            onClick={() => insertFrag(0)}
          >
            +
          </button>
          {fragments.map((frag, index) => {
            const fragStatus =
              (frag.id ? genProgress[frag.id] : undefined) ||
              readFragmentGenerationStatus(frag).status
            const clipVideo = frag.video ? resolveDramaMediaUrl(frag.video) : ''
            const clipCover = frag.cover ? resolveDramaMediaUrl(frag.cover) : ''
            return (
            <div key={`${frag.id}-${index}`} className="drama-ep-clip-wrap">
              <button
                type="button"
                className={`drama-ep-clip ${selectedIndex === index ? 'active' : ''}${
                  fragStatus === 'running' || fragStatus === 'queued' ? ' is-generating' : ''
                }${fragStatus === 'failed' ? ' is-failed' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                {clipCover ? (
                  <img src={clipCover} alt="" />
                ) : clipVideo ? (
                  <video src={clipVideo} muted />
                ) : (
                  <span className="drama-ep-clip-empty">
                    {fragStatus === 'running' || fragStatus === 'queued' ? '…' : '+'}
                  </span>
                )}
                <em>{formatFragLabel(index, frag.duration_sec)}</em>
              </button>
              <div className="drama-ep-clip-ops">
                <button type="button" aria-label="插入" onClick={() => insertFrag(index + 1)}>
                  +
                </button>
                <button type="button" aria-label="复制" onClick={() => duplicateFrag(index)}>
                  ⧉
                </button>
                <button
                  type="button"
                  aria-label="删除"
                  disabled={fragments.length <= 1}
                  onClick={() => deleteFrag(index)}
                >
                  ⌫
                </button>
              </div>
            </div>
            )
          })}
        </div>
      </footer>
    </div>
  )
}
