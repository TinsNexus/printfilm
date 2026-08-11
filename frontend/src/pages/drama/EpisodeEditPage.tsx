/** 分集编辑：复刻原项目四栏布局（资产 / 脚本 / 预览 / 故事板） */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dramaApi,
  type DramaAsset,
  type DramaEpisode,
  type DramaFragment,
} from '../../api/drama'
import { IMAGE_STYLE_OPTIONS, type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  MODEL_OPTIONS,
  RATIO_OPTIONS,
  RES_OPTIONS,
  extractAssetIds,
  filterEpisodeAssets,
  formatFragLabel,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'
import { EpisodeEditAssetPanel } from './EpisodeEditAssetPanel'
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
  const pollRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const selected = fragments[selectedIndex] || null
  const selectedDuration = selected?.duration_sec ?? 8

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
  }

  useEffect(() => {
    if (!eid || !pid) return
    reload().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    dramaApi
      .listAssets(pid)
      .then(setAssets)
      .catch(() => setAssets([]))
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
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
          duration_sec: f.duration_sec,
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
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await dramaApi.generateStatus(eid)
          setStatus(`完成 ${st.done}/${st.total} · 进行中 ${st.running} · 失败 ${st.failed}`)
          if (st.running === 0 && st.done + st.failed >= st.total) {
            if (pollRef.current) window.clearInterval(pollRef.current)
            pollRef.current = null
            await reload()
            setBusy(false)
          }
        } catch {
          if (pollRef.current) window.clearInterval(pollRef.current)
          pollRef.current = null
          setBusy(false)
        }
      }, 3000)
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
    const content = selected.content ? `${selected.content} ${mention}` : mention
    const ids = Array.from(new Set([...(selected.asset_ids || []), asset.id]))
    updateSelected({ content, asset_ids: ids })
    setEditing(true)
  }

  if (!episode) {
    return (
      <div className="drama-ep-fullscreen drama-ep-center">
        {error || '加载中…'}
      </div>
    )
  }

  const previewUrl = selected?.video || ''
  const previewCover = selected?.cover || ''

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
          <label className="drama-ep-select">
            <span>风格</span>
            <select
              value={videoStyleId}
              onChange={(e) => setVideoStyleId(e.target.value as ImageStyleId | '')}
            >
              <option value="">视频风格</option>
              {IMAGE_STYLE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="drama-ep-select">
            <span>模型</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="drama-ep-select">
            <span>比例</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as (typeof RATIO_OPTIONS)[number])}
            >
              {RATIO_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="drama-ep-select">
            <span>分辨率</span>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as (typeof RES_OPTIONS)[number])}
            >
              {RES_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
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
          onScopeChange={setAssetScope}
          onTabChange={setAssetTab}
          onOpenCanvas={() => navigate(`/drama/projects/${pid}/canvas`)}
          onMention={mentionAsset}
        />

        <section className="drama-ep-editor">
          <div className="drama-ep-editor-head">
            <div>
              <strong>{formatFragLabel(selectedIndex, selectedDuration)}</strong>
              <p>键入 @asset:id 可引用资产；脚本可含旁白、字幕与 BGM 说明</p>
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

          <div className={`drama-ep-editor-box ${editing ? 'editing' : ''}`}>
            <textarea
              value={selected?.content || ''}
              readOnly={!editing}
              rows={16}
              placeholder="输入画面描述、对白、旁白或背景音乐提示…"
              onChange={(e) => updateSelected({ content: e.target.value })}
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
          {fragments.map((frag, index) => (
            <div key={`${frag.id}-${index}`} className="drama-ep-clip-wrap">
              <button
                type="button"
                className={`drama-ep-clip ${selectedIndex === index ? 'active' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                {frag.cover ? (
                  <img src={frag.cover} alt="" />
                ) : frag.video ? (
                  <video src={frag.video} muted />
                ) : (
                  <span className="drama-ep-clip-empty">+</span>
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
          ))}
        </div>
      </footer>
    </div>
  )
}
