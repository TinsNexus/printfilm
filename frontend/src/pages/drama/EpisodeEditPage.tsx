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
import { enqueueEpisodeVideoJobs, syncEpisodeVideoJobs } from '../../lib/dramaGenQueue'
import {
  collectDramaGenerateGateIssues,
  formatDramaGateMessage,
} from '../../lib/dramaEpisodeScriptValidate'
import { dialog } from '../../lib/dialog'
import { StoryboardGridImportModal } from '../../components/drama/StoryboardGridImportModal'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { EpisodeEditAssetPanel } from './EpisodeEditAssetPanel'
import { EpisodeEditHeaderControls } from './EpisodeEditHeaderControls'
import { EpisodeEditPromptEditor } from './EpisodeEditPromptEditor'
import { EpisodeEditReferenceStrip } from './EpisodeEditReferenceStrip'
import { EpisodeEditSidePane } from './EpisodeEditSidePane'
import { readAssetVoiceBinding } from './CharacterVoiceBindModal'
import { generateAndBindCharacterVoice } from '../../lib/characterVoiceGenerate'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function EpisodeEditPage() {
  return (
    <RequireAuth>
      <EpisodeEditInner />
    </RequireAuth>
  )
}

function readFragmentPlanStatus(ep: DramaEpisode | null): string {
  // 读取 episode.params 上的 AI 分镜状态
  const st = ep?.params?.fragment_plan_status
  return typeof st === 'string' ? st : ''
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
  // linkLastFrame 是否用上一镜尾帧作本镜首帧（写入 project.params）
  const [linkLastFrame, setLinkLastFrame] = useState(true)
  // projectParams 项目 params 缓存，切换衔接开关时合并写回
  const [projectParams, setProjectParams] = useState<Record<string, unknown>>({})
  // storyboardImportOpen 分镜板多宫格导入弹窗
  const [storyboardImportOpen, setStoryboardImportOpen] = useState(false)
  // planModalOpen AI 重新分镜确认（含 Skill 勾选）
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [characterVoiceBusyIds, setCharacterVoiceBusyIds] = useState<Set<number>>(() => new Set())
  const pollRef = useRef<number | null>(null)

  const selected = fragments[selectedIndex] || null
  const selectedDuration = selected?.duration_sec ?? 8
  // generatingIds 当前排队/生成中的分镜 id
  const generatingIds = useMemo(() => {
    const ids = new Set<number>()
    for (const frag of fragments) {
      if (!frag.id) continue
      const status = readFragmentGenerationStatus(frag).status
      if (status === 'queued' || status === 'running') ids.add(frag.id)
    }
    return ids
  }, [fragments])
  // anyFragmentGenerating 本集是否有分镜在排队/生成（不锁编辑，仅锁批量生成）
  const anyFragmentGenerating = generatingIds.size > 0
  // selectedIsGenerating 当前选中镜是否正在生成
  const selectedIsGenerating = Boolean(selected?.id && generatingIds.has(selected.id))
  // selectedGenerateLocked 仅锁当前镜的「生成」按钮
  const selectedGenerateLocked = busy || selectedIsGenerating
  // generateAllLocked 全部生成：有任务进行中时禁止
  const generateAllLocked = busy || anyFragmentGenerating
  // planFragmentsLocked AI 重新分镜与视频生成互斥
  const planFragmentsLocked = busy || anyFragmentGenerating
  const selectedRefIds = useMemo(
    () => new Set(collectFragmentAssetIds(selected)),
    [selected],
  )
  const selectedRefItems = useMemo(
    () =>
      buildFragmentRefStripItems(selected, assets, resolveDramaMediaUrl, (asset) => {
        const voice = readAssetVoiceBinding(asset)
        return voice ? { label: voice.label, url: voice.url } : null
      }),
    [selected, assets],
  )
  // selectedGateIssues 当前镜脚本/资产门禁（编辑区即时提示）
  const selectedGateIssues = useMemo(() => {
    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    return [...blocking, ...warnings]
  }, [selected, assets])

  // prevLastFrameUrl 上一镜已落盘尾帧（衔接触发条件）
  const prevLastFrameUrl = useMemo(() => {
    if (selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    const params = prev?.params
    if (!params || typeof params !== 'object') return ''
    const raw = (params as Record<string, unknown>).lastFrameUrl
    return typeof raw === 'string' ? raw.trim() : ''
  }, [fragments, selectedIndex])

  // 持久化镜间衔接开关到项目 params
  async function handleLinkLastFrameChange(enabled: boolean) {
    setLinkLastFrame(enabled)
    const nextParams = { ...projectParams, linkLastFrame: enabled }
    setProjectParams(nextParams)
    try {
      const updated = await dramaApi.updateProject(pid, { params: nextParams })
      if (updated.params && typeof updated.params === 'object') {
        setProjectParams(updated.params as Record<string, unknown>)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存衔接设置失败')
    }
  }

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

  // 应用后端生成进度并同步分镜状态 + 全局队列
  function applyGenerateStatus(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) {
    setStatus(`完成 ${st.done}/${st.total} · 进行中 ${st.running} · 失败 ${st.failed}`)
    const byId = new Map(st.fragments.map((f) => [f.fragment_id, f.status]))
    setFragments((prev) => {
      const next = prev.map((f) => {
        if (!f.id) return f
        const genStatus = byId.get(f.id)
        if (!genStatus) return f
        const item = st.fragments.find((x) => x.fragment_id === f.id) as
          | {
              fragment_id: number
              status: string
              video?: string
              cover?: string
              message?: string
              phase?: string
              error?: string
            }
          | undefined
        return {
          ...f,
          video: item?.video || f.video,
          cover: item?.cover || f.cover,
          params: {
            ...(f.params || {}),
            generation: {
              status: genStatus,
              video: item?.video,
              cover: item?.cover,
              message: item?.message,
              phase: item?.phase,
              error: item?.error,
            },
          },
        }
      })
      syncEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: episode?.name,
        fragments: next.map((f) => ({
          id: f.id,
          sort_order: f.sort_order,
          content: f.content,
        })),
        statusItems: st.fragments.map((f) => {
          const row = f as {
            fragment_id: number
            status: string
            message?: string
            phase?: string
            error?: string
            video?: string
            cover?: string
          }
          return {
            fragment_id: row.fragment_id,
            status: row.status,
            message: row.message,
            phase: row.phase,
            error: row.error,
            video: row.video,
            cover: row.cover,
          }
        }),
      })
      return next
    })
    return st
  }

  // 启动生成进度轮询（立刻拉一次，再每 3s）
  function startGeneratePolling() {
    stopGeneratePolling()
    const tick = async () => {
      try {
        const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
        // 仅按「进行中/排队」判断；单条生成时 total 仍是全集数量
        if (st.running === 0) {
          stopGeneratePolling()
          await reload()
        }
      } catch {
        stopGeneratePolling()
      }
    }
    void tick()
    pollRef.current = window.setInterval(() => {
      void tick()
    }, 3000)
  }

  // 进页检查是否有进行中的生成任务或 AI 分镜
  async function resumeGenerateIfNeeded() {
    try {
      const ep = await dramaApi.getEpisode(eid)
      if (readFragmentPlanStatus(ep) === 'generating') {
        setBusy(true)
        setStatus('AI 分镜规划中…')
        const started = Date.now()
        while (Date.now() - started < 10 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 2500))
          const cur = await dramaApi.getEpisode(eid)
          const st = readFragmentPlanStatus(cur)
          if (st === 'completed') {
            setEpisode(cur)
            setFragments(cur.fragments || [])
            setSelectedIndex(0)
            setStatus(`AI 分镜完成 · ${(cur.fragments || []).length} 条`)
            setBusy(false)
            return
          }
          if (st === 'failed') {
            setError(String(cur.params?.fragment_plan_error || 'AI 分镜失败'))
            setBusy(false)
            return
          }
        }
        setBusy(false)
        return
      }
      const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
      if (st.running > 0) startGeneratePolling()
    } catch {
      /* ignore */
    }
  }

  // 打开全屏分镜故事板画布
  function openEpisodeStoryboard() {
    navigate(`/drama/projects/${pid}/episodes/${eid}/canvas`)
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
    // 加载项目默认画面风格 / 镜间衔接等到顶栏
    dramaApi
      .getProject(pid)
      .then((project) => {
        const styleId = getImageStyleId(project.script, project)
        if (styleId) setVideoStyleId(styleId as ImageStyleId)
        const params =
          project.params && typeof project.params === 'object' && !Array.isArray(project.params)
            ? (project.params as Record<string, unknown>)
            : {}
        setProjectParams(params)
        const linkRaw = params.linkLastFrame ?? params.link_last_frame
        if (typeof linkRaw === 'boolean') setLinkLastFrame(linkRaw)
        const ratio = String(params.aspect_ratio || '')
        if ((RATIO_OPTIONS as readonly string[]).includes(ratio)) {
          setAspectRatio(ratio as (typeof RATIO_OPTIONS)[number])
        }
        const res = String(params.resolution || '')
        if ((RES_OPTIONS as readonly string[]).includes(res)) {
          setResolution(res as (typeof RES_OPTIONS)[number])
        }
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

  // 保存全部分镜（标记为用户已编辑，避免自动重切覆盖）
  async function save() {
    setBusy(true)
    setError('')
    try {
      const ep = await dramaApi.saveFragments(
        eid,
        fragments.map((f, i) => {
          const prevParams =
            f.params && typeof f.params === 'object' && !Array.isArray(f.params)
              ? (f.params as Record<string, unknown>)
              : {}
          return {
            sort_order: i,
            content: f.content,
            cover: f.cover,
            video: f.video,
            duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
            params: { ...prevParams, user_edited: true },
            asset_ids: f.asset_ids || [],
          }
        }),
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

  // 仅生成当前选中分镜（save 会重建分镜 id，必须用保存后的 id）
  async function generateSelected() {
    if (!selected) {
      setError('请先选择一条分镜')
      return
    }
    if (selectedGenerateLocked) {
      if (selectedIsGenerating) {
        setError('当前分镜正在生成，请等待完成后再试')
      } else {
        setError('请等待当前操作完成后再试')
      }
      return
    }

    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    if (blocking.length > 0) {
      setError(blocking.map((i) => i.message).join('；'))
      await dialog.alert({
        title: '无法生成',
        message: formatDramaGateMessage(blocking, warnings, '请先按分集规则修复脚本后再生成。'),
      })
      return
    }

    const fragLabel = formatFragLabel(selectedIndex, selectedDuration)
    const ok = await dialog.confirm({
      title: '生成分镜视频',
      message: formatDramaGateMessage(
        [],
        warnings,
        `将保存当前编辑并排队生成「${fragLabel}」的视频，通常需要数分钟。是否继续？`,
      ),
      confirmText: warnings.length > 0 ? '仍要生成' : '开始生成',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setStatus('保存并排队生成当前分镜…')
    try {
      const ep = await save()
      setBusy(true)
      const frag = (ep.fragments || [])[selectedIndex]
      if (!frag?.id) {
        throw new Error('保存后未找到当前分镜，请刷新后重试')
      }
      await dramaApi.generateEpisode(eid, [frag.id])
      enqueueEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: ep.name || episode?.name,
        fragments: (ep.fragments || []).map((f, i) => ({
          id: f.id,
          sort_order: f.sort_order ?? i,
        })),
        fragmentIds: [frag.id],
      })
      setBusy(false)
      startGeneratePolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      setBusy(false)
    }
  }

  // 全部生成：入队本集所有分镜（用保存后的新 id）
  async function generateAll() {
    if (fragments.length === 0) {
      setError('没有可生成的分镜')
      return
    }
    if (generateAllLocked) {
      setError('已有分镜正在生成，请等待完成后再试')
      return
    }

    const allBlocking: string[] = []
    const allWarnings: string[] = []
    for (let i = 0; i < fragments.length; i++) {
      const { blocking, warnings } = collectDramaGenerateGateIssues(fragments[i], assets)
      const label = formatFragLabel(i, fragments[i]?.duration_sec)
      for (const issue of blocking) allBlocking.push(`${label}：${issue.message}`)
      for (const issue of warnings) allWarnings.push(`${label}：${issue.message}`)
    }
    if (allBlocking.length > 0) {
      setError(allBlocking[0] || '分镜脚本校验未通过')
      await dialog.alert({
        title: '无法全部生成',
        message: ['请先修复以下问题：', '', ...allBlocking.slice(0, 8).map((m) => `· ${m}`)].join(
          '\n',
        ),
      })
      return
    }

    const ok = await dialog.confirm({
      title: '生成全部分镜视频',
      message: formatDramaGateMessage(
        [],
        allWarnings.slice(0, 8).map((message) => ({ level: 'warn' as const, message })),
        `将保存当前编辑并排队生成本集全部 ${fragments.length} 条分镜视频，耗时较长且会覆盖已有视频。是否继续？`,
      ),
      confirmText: allWarnings.length > 0 ? '仍要全部生成' : '全部生成',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setStatus(`保存并排队生成全部 ${fragments.length} 条…`)
    try {
      const ep = await save()
      setBusy(true)
      const ids = (ep.fragments || [])
        .map((f) => f.id)
        .filter((id): id is number => typeof id === 'number' && id > 0)
      if (ids.length === 0) {
        throw new Error('保存后没有可生成的分镜')
      }
      await dramaApi.generateEpisode(eid, ids)
      enqueueEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: ep.name || episode?.name,
        fragments: (ep.fragments || []).map((f, i) => ({
          id: f.id,
          sort_order: f.sort_order ?? i,
        })),
        fragmentIds: ids,
      })
      setBusy(false)
      startGeneratePolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : '全部生成失败')
      setBusy(false)
    }
  }

  // 返回分集步骤
  function handleBack() {
    navigate(`/drama/projects/${pid}`, { state: { returnStep: 'episodes' } })
  }

  // 单集 LLM 重新分镜：确认并勾选 Skill 后入队
  function planFragmentsWithLlm() {
    if (planFragmentsLocked) {
      setError('当前有视频生成任务进行中，请稍候再重新分镜')
      return
    }
    setPlanModalOpen(true)
  }

  // 入队后轮询至完成
  async function startPlanFragments(skillIds: number[]) {
    setPlanModalOpen(false)
    setBusy(true)
    setError('')
    setStatus('AI 分镜规划中…')
    try {
      await dramaApi.planEpisodeFragments(eid, {
        force: true,
        fallback_rules: true,
        skill_ids: skillIds,
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500))
        const ep = await dramaApi.getEpisode(eid)
        const st = readFragmentPlanStatus(ep)
        if (st === 'completed') {
          setEpisode(ep)
          setFragments(ep.fragments || [])
          setSelectedIndex(0)
          setEditing(false)
          const mode = String(ep.params?.fragment_plan_mode || 'llm')
          const count = Number(ep.params?.fragment_plan_count) || (ep.fragments || []).length
          setStatus(
            mode === 'rules_fallback'
              ? `分镜完成（模型失败已回退规则切分）· ${count} 条`
              : `AI 分镜完成 · ${count} 条`,
          )
          setBusy(false)
          return
        }
        if (st === 'failed') {
          const msg = String(ep.params?.fragment_plan_error || 'AI 分镜失败')
          setError(msg)
          setBusy(false)
          return
        }
        setStatus('AI 分镜规划中…')
      }
      throw new Error('AI 分镜超时，请稍后刷新查看')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 分镜失败')
      setBusy(false)
    }
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

  // 更新角色资产（音色绑定后刷新列表）
  function handleCharacterUpdated(updated: DramaAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  // 一键 AI 生成角色音色并绑定（各角色独立 busy，互不阻塞）
  async function handleGenerateCharacterVoice(asset: DramaAsset) {
    if (characterVoiceBusyIds.has(asset.id)) return
    setCharacterVoiceBusyIds((prev) => new Set(prev).add(asset.id))
    setError('')
    try {
      const { character, voice } = await generateAndBindCharacterVoice(pid, asset)
      handleCharacterUpdated(character)
      setAssets((prev) => (prev.some((a) => a.id === voice.id) ? prev : [...prev, voice]))
    } catch (err) {
      setError(err instanceof Error ? err.message : '音色生成失败')
    } finally {
      setCharacterVoiceBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    }
  }

  if (!episode) {
    return (
      <div className="drama-ep-fullscreen drama-ep-center">
        {error || '加载中…'}
      </div>
    )
  }

  // 当前预览/选中分镜 id（与底部分镜条、脚本编辑联动）
  const playingFragmentId = selected?.id ?? null

  // 切换预览分镜时同步底部分镜选中态
  function handlePlayingFragmentChange(fragmentId: number) {
    const index = fragments.findIndex((f) => f.id === fragmentId)
    if (index >= 0) {
      setSelectedIndex(index)
    }
  }

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
            linkLastFrame={linkLastFrame}
            onStyleChange={setVideoStyleId}
            onModelChange={setModelId}
            onAspectRatioChange={setAspectRatio}
            onResolutionChange={setResolution}
            onLinkLastFrameChange={(enabled) => void handleLinkLastFrameChange(enabled)}
            disabled={busy}
          />
          <button
            type="button"
            className="drama-ep-btn-ghost"
            disabled={busy}
            onClick={() => setStoryboardImportOpen(true)}
          >
            导入分镜板
          </button>
          <button
            type="button"
            className="drama-ep-btn-ghost"
            disabled={planFragmentsLocked}
            onClick={() => void planFragmentsWithLlm()}
          >
            {busy && status.includes('分镜') ? '分镜中…' : 'AI 重新分镜'}
          </button>
          <button
            type="button"
            className="drama-ep-btn-dark drama-ep-header-gen-all"
            disabled={generateAllLocked || fragments.length === 0}
            onClick={() => void generateAll()}
          >
            {generateAllLocked ? '处理中…' : '全部生成'}
          </button>
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
          onOpenCanvas={openEpisodeStoryboard}
          onMention={mentionAsset}
          onGenerateVoice={(asset) => void handleGenerateCharacterVoice(asset)}
          voiceBusyIds={characterVoiceBusyIds}
          onVoiceError={(message) => setError(message)}
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

          {selectedGateIssues.length > 0 ? (
            <ul className="drama-ep-script-issues" aria-live="polite">
              {selectedGateIssues.map((issue) => (
                <li
                  key={`${issue.level}:${issue.message}`}
                  className={
                    issue.level === 'error'
                      ? 'drama-ep-script-issue is-error'
                      : 'drama-ep-script-issue is-warn'
                  }
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {linkLastFrame && selectedIndex > 0 ? (
            <p
              className={`drama-ep-continuity-hint${prevLastFrameUrl ? ' is-ready' : ' is-wait'}`}
            >
              {prevLastFrameUrl
                ? '将使用上一镜尾帧作为衔接参考（与角色参考图一并提交）'
                : '已开启镜间衔接：请先生成上一镜以获取尾帧'}
            </p>
          ) : null}

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
                  disabled={!selected || selectedIsGenerating || busy}
                  onClick={() => setEditing(true)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={selectedGenerateLocked || !selected}
                  title={selectedIsGenerating ? '当前分镜正在生成' : undefined}
                  onClick={() => void generateSelected()}
                >
                  {selectedIsGenerating ? '生成中…' : busy ? '处理中…' : '生成'}
                </button>
              </>
            )}
          </div>
        </section>

        <EpisodeEditSidePane
          fragments={fragments}
          playingFragmentId={playingFragmentId}
          onPlayingFragmentChange={handlePlayingFragmentChange}
          aspectRatio={aspectRatio}
          episodeName={episode?.name || '本集'}
          onOpenStoryboard={openEpisodeStoryboard}
        />
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
            const fragStatus = readFragmentGenerationStatus(frag).status
            const fragBusy = fragStatus === 'running' || fragStatus === 'queued'
            const clipVideo = frag.video ? resolveDramaMediaUrl(frag.video) : ''
            const clipCover = frag.cover ? resolveDramaMediaUrl(frag.cover) : ''
            return (
            <div key={`${frag.id}-${index}`} className="drama-ep-clip-wrap">
              <button
                type="button"
                className={`drama-ep-clip ${selectedIndex === index ? 'active' : ''}${
                  fragBusy ? ' is-generating' : ''
                }${fragStatus === 'failed' ? ' is-failed' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                {clipCover ? (
                  <img src={clipCover} alt="" />
                ) : clipVideo ? (
                  <video src={clipVideo} muted />
                ) : (
                  <span className="drama-ep-clip-empty">
                    {fragBusy ? '…' : '+'}
                  </span>
                )}
                <em>{formatFragLabel(index, frag.duration_sec)}</em>
              </button>
              <div className="drama-ep-clip-ops">
                <button type="button" aria-label="插入" onClick={() => insertFrag(index + 1)} disabled={busy}>
                  +
                </button>
                <button type="button" aria-label="复制" onClick={() => duplicateFrag(index)} disabled={busy}>
                  ⧉
                </button>
                <button
                  type="button"
                  aria-label="删除"
                  disabled={busy || fragments.length <= 1}
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

      <FragmentPlanSkillModal
        open={planModalOpen}
        message="将调用大模型按本集剧本重新规划分镜（覆盖现有分镜与已生成视频），通常需要数十秒。可勾选本次使用的 Skill。"
        onCancel={() => setPlanModalOpen(false)}
        onConfirm={(skillIds) => void startPlanFragments(skillIds)}
      />
      <StoryboardGridImportModal
        open={storyboardImportOpen}
        onClose={() => setStoryboardImportOpen(false)}
        projectId={pid}
        episodeId={eid}
        fragments={fragments}
        onImported={(next, uploaded) => {
          setFragments(next)
          setSelectedIndex(0)
          setEditing(false)
          setAssets((prev) => {
            const byId = new Map(prev.map((a) => [a.id, a]))
            for (const asset of uploaded) byId.set(asset.id, asset)
            return Array.from(byId.values())
          })
          setStatus(
            `分镜板已导入 · ${next.length} 镜 · 新增素材 ${uploaded.length}`,
          )
        }}
      />
    </div>
  )
}
