import { useTeamReadOnly } from '../../features/teams/readOnlyContext'
import { tv } from '../../i18n/tv'
import { TeamEpisodeEditingBoundary } from '../../features/teams/TeamEditingBoundary'
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
  buildFragmentRefStripItems,
  collectFragmentAssetIds,
  extractAssetIds,
  filterEpisodeAssets,
  formatFragLabel,
  fragmentQueueBadgeLabel,
  isFragmentGenerationBusy,
  normalizeAssetTab,
  readFragmentGenerationStatus,
  readFragmentVideoVersions,
  resolveFragmentDurationSec,
  type AssetScope,
  type AssetTab,
} from './dramaEpisodeEditUtils'
import {
  enqueueEpisodeVideoJobs,
  ensureEpisodeVideoStatusPoll,
  subscribeEpisodeGenerateStatus,
  syncEpisodeVideoJobs,
  useDramaGenQueue,
  videoJobId,
  type DramaGenJob,
} from '../../lib/dramaGenQueue'
import {
  collectDramaGenerateGateIssues,
  formatDramaGateMessage,
} from '../../lib/dramaEpisodeScriptValidate'
import { isMinimaxH3Model } from '../../lib/dramaMediaModelMeta'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../lib/dramaVoiceBinding'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import { dialog } from '../../lib/dialog'
import {
  formatProjectOutputLabel,
  readEpisodeAspectRatio,
  readEpisodeResolution,
} from '../../lib/dramaProjectOutputSettings'
import { DramaFragmentClipSpec } from '../../components/drama/DramaFragmentClipSpec'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { DramaGenTaskDetail } from '../../components/drama/DramaGenTaskDetail'
import { CircleAlert } from 'lucide-react'
import { useDramaImageGenQueue } from '../../hooks/useDramaImageGenQueue'
import { resolveCatalogModelSelection, useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { enqueueDramaImageGen } from '../../lib/dramaImageGenQueue'
import { defaultOptionsForAssetKind } from '../../lib/dramaGenerationOptions'
import { dramaAssetImageGenButtonLabel } from '../../lib/dramaAssetImage'
import { readVisualPrompt } from '../../lib/dramaVisualPrompt'
import { generateAndBindCharacterVoice } from '../../lib/characterVoiceGenerate'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { EpisodeEditAssetPanel } from './EpisodeEditAssetPanel'
import { EpisodeEditHeaderControls } from './EpisodeEditHeaderControls'
import { EpisodeEditPromptEditor } from './EpisodeEditPromptEditor'
import { EpisodeEditReferenceStrip } from './EpisodeEditReferenceStrip'
import { EpisodeEditSidePane } from './EpisodeEditSidePane'
import {
  GlobalAssetPickerModal,
  importGlobalAssetToProject,
} from './GlobalAssetPickerModal'
import {
  applySubtitleModeToFragments,
  subtitleModeUsesModelOutput,
  type DramaSubtitleMode,
} from '../../lib/dramaSubtitleSettings'
import {
  applyCharacterIntroModeToFragments,
  characterIntroModeEnabled,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'
import {
  readEffectiveCharacterIntroMode,
  readEffectiveSubtitleMode,
} from '../../lib/dramaProjectGlobalSettings'
import {
  CharacterVoiceBindModal,
  readAssetVoiceBinding,
} from './CharacterVoiceBindModal'
import { EditableAssetDetailDialog } from '../../components/assets/EditableAssetDetailDialog'
import { buildEpisodeDirItems, DramaEpisodeDir } from './DramaEpisodeDir'
import RequireAuth from './RequireAuth'
import './drama.css'

export default function EpisodeEditPage() {
  return (
    <RequireAuth>
      <TeamEpisodeEditingBoundary><EpisodeEditInner /></TeamEpisodeEditingBoundary>
    </RequireAuth>
  )
}

function readFragmentPlanStatus(ep: DramaEpisode | null): string {
  // 优先读取统一任务中心中的分镜规划任务；旧 params 状态作为兜底
  const active = (ep?.active_tasks || []).find((task) => task.task_type === 'fragment_plan')
  if (
    active &&
    !active.cancel_requested &&
    ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(active.status)
  ) {
    return 'generating'
  }
  const st = ep?.params?.fragment_plan_status
  return typeof st === 'string' ? st : ''
}

// 统一解析项目参数里的布尔值，兼容历史字符串/数字写法。
function coerceProjectBool(value: unknown, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

// 分集编辑页主体
function EpisodeEditInner() {
  const readOnly = useTeamReadOnly()
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
   * videoStyleId / modelId / aspectRatio 生成参数（UI）
   * busy / status / error 状态
   */
  const [episode, setEpisode] = useState<DramaEpisode | null>(null)
  const [episodeList, setEpisodeList] = useState<DramaEpisode[]>([])
  const [fragments, setFragments] = useState<DramaFragment[]>([])
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [assetScope, setAssetScope] = useState<AssetScope>('episode')
  const [assetTab, setAssetTab] = useState<AssetTab | null>('character')
  const [editing, setEditing] = useState(false)
  const [videoStyleId, setVideoStyleId] = useState<ImageStyleId | ''>('')
  const [modelId, setModelId] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [aspectRatio, setAspectRatio] = useState<(typeof RATIO_OPTIONS)[number]>('9:16')
  // subtitleMode 本集字幕方式：模型自出 / 后期拼接（默认后期）
  const [subtitleMode, setSubtitleMode] = useState<DramaSubtitleMode>('post')
  // characterIntroMode 本集人物介绍叠字：模型叠字 / 关闭（默认关闭）
  const [characterIntroMode, setCharacterIntroMode] = useState<DramaCharacterIntroMode>('off')
  // linkLastFrame 是否用上一镜尾帧作本镜首帧（写入 project.params，默认开启）
  const [linkLastFrame, setLinkLastFrame] = useState(true)
  // projectParams 项目 params 缓存（镜间衔接 + 分集输出规格回退）
  const [projectParams, setProjectParams] = useState<Record<string, unknown>>({})
  // episodeParams 分集 params 缓存（画幅 / 清晰度写入此处）
  const [episodeParams, setEpisodeParams] = useState<Record<string, unknown>>({})
  // planModalOpen AI 重新分镜确认（含 Skill 勾选）
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [characterVoiceBusyIds, setCharacterVoiceBusyIds] = useState<Set<number>>(() => new Set())
  /*
   * detailAsset 左侧资产详情（编辑/重新生成/上传）
   * voiceBindAsset 音色绑定弹窗目标
   * imageGenQueue 全局生图队列快照
   */
  const [detailAsset, setDetailAsset] = useState<DramaAsset | null>(null)
  const [voiceBindAsset, setVoiceBindAsset] = useState<DramaAsset | null>(null)
  /** failReasonJob 底部分镜感叹号打开的失败原因 */
  const [failReasonJob, setFailReasonJob] = useState<DramaGenJob | null>(null)
  // assetCreateBusy / libraryPickerOpen 侧栏新建与导入
  const [assetCreateBusy, setAssetCreateBusy] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const imageGenQueue = useDramaImageGenQueue()
  const dramaGenQueue = useDramaGenQueue()
  const applyStatusRef = useRef<(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) => Awaited<
    ReturnType<typeof dramaApi.generateStatus>
  >>(() => ({ episode_id: 0, done: 0, failed: 0, running: 0, total: 0, tasks: [], fragments: [] }))
  const reloadRef = useRef<() => Promise<void>>(async () => {})
  const projectParamsRef = useRef<Record<string, unknown>>({})
  const episodeParamsRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    // 目录到达后，把旧 Kie/方舟 id 换成后台默认视频模型
    if (!mediaCatalog) return
    setModelId(previous => resolveCatalogModelSelection(mediaCatalog, 'video', previous))
  }, [mediaCatalog])

  const selected = fragments[selectedIndex] || null
  const selectedDuration = selected?.duration_sec ?? 8
  // generatingIds 当前分集排队/生成中的分镜 id
  const generatingIds = useMemo(() => {
    const ids = new Set<number>()
    for (const task of episode?.active_tasks || []) {
      if (
        typeof task.episode_id === 'number' &&
        task.episode_id > 0 &&
        task.episode_id !== eid
      ) {
        continue
      }
      if (
        task.task_type === 'fragment_video' &&
        typeof task.fragment_id === 'number' &&
        !task.cancel_requested &&
        ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(task.status)
      ) {
        // 成片已 done：忽略残留活跃任务，避免徽标长期「生成中」
        const frag = fragments.find((f) => f.id === task.fragment_id)
        if (frag && readFragmentGenerationStatus(frag).status === 'done') continue
        if (!frag) continue
        ids.add(task.fragment_id)
      }
    }
    for (const frag of fragments) {
      if (!frag.id) continue
      const st = readFragmentGenerationStatus(frag).status
      if (st === 'done') continue
      if (isFragmentGenerationBusy(st)) ids.add(frag.id)
    }
    return ids
  }, [eid, fragments, episode?.active_tasks])
  // anyFragmentGenerating 本集是否有分镜在排队/生成（不锁编辑，仅锁批量生成）
  const anyFragmentGenerating = generatingIds.size > 0
  // selectedIsGenerating 当前选中镜是否正在生成
  const selectedIsGenerating = Boolean(selected?.id && generatingIds.has(selected.id))
  // selectedHasVideo 当前镜是否已有成片（用于「重新生成」文案）
  const selectedHasVideo = Boolean(selected?.video)
  // selectedVersions 当前镜历史成片
  const selectedVersions = useMemo(() => readFragmentVideoVersions(selected), [selected])
  // previewVersion 当前选中待预览的历史成片
  const previewVersion = useMemo(
    () => selectedVersions.find((ver) => ver.id === previewVersionId) ?? null,
    [previewVersionId, selectedVersions],
  )
  const previewVideoUrl = previewVersion ? resolveDramaMediaUrl(previewVersion.video) : null
  const previewPosterUrl = previewVersion?.cover ? resolveDramaMediaUrl(previewVersion.cover) : null
  // generateAllLocked 仅提交入队时锁定，生成过程不阻塞编辑
  const generateAllLocked = readOnly || busy
  // planFragmentsLocked 仅本集有视频生成或 AI 分镜进行中时锁定
  const planFragmentsLocked =
    readOnly || busy || anyFragmentGenerating || readFragmentPlanStatus(episode) === 'generating'
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
  // selectedGateBlocking / selectedGateIssues 当前镜脚本/资产门禁
  const selectedGateBlocking = useMemo(
    () => collectDramaGenerateGateIssues(selected, assets).blocking,
    [selected, assets],
  )
  const selectedGateIssues = useMemo(() => {
    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    return [...blocking, ...warnings]
  }, [selected, assets])

  // prevLastFrameUrl 上一镜已落盘尾帧（衔接触发条件；兼容 generation / 历史版本字段）
  const prevLastFrameUrl = useMemo(() => {
    if (selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    const params = prev?.params
    if (!params || typeof params !== 'object') return ''
    const rec = params as Record<string, unknown>
    const fromTop = rec.lastFrameUrl
    if (typeof fromTop === 'string' && fromTop.trim()) return fromTop.trim()
    const gen = rec.generation
    if (gen && typeof gen === 'object') {
      const fromGen = (gen as Record<string, unknown>).lastFrameUrl
      if (typeof fromGen === 'string' && fromGen.trim()) return fromGen.trim()
    }
    const versions = readFragmentVideoVersions(prev)
    for (const ver of versions) {
      if (ver.lastFrameUrl && ver.lastFrameUrl.trim()) return ver.lastFrameUrl.trim()
    }
    return ''
  }, [fragments, selectedIndex])

  // 开启尾帧衔接时：仅上一镜从未生成过才禁止；上一镜在生成/排队时本镜可入队等待
  const continuityBlockedReason = useMemo(() => {
    if (!linkLastFrame || selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    if (!prev) return tv('缺少上一镜，无法衔接', 'Thiếu cảnh trước, không thể nối')
    if (prev.id && generatingIds.has(prev.id)) {
      return ''
    }
    const prevDone =
      Boolean((prev.video || '').trim()) ||
      readFragmentGenerationStatus(prev).status === 'done' ||
      Boolean(prevLastFrameUrl)
    if (!prevDone) {
      return tv('请先生成上一镜并等待尾帧就绪', 'Vui lòng tạo cảnh trước và chờ khung cuối sẵn sàng')
    }
    return ''
  }, [linkLastFrame, selectedIndex, fragments, generatingIds, prevLastFrameUrl])

  const continuityQueueHint = useMemo(() => {
    if (!linkLastFrame || selectedIndex <= 0) return ''
    const prev = fragments[selectedIndex - 1]
    if (!prev?.id || !generatingIds.has(prev.id)) return ''
    return tv('上一镜仍在生成，本镜将入队等待上一镜完成后再开始', 'Cảnh trước vẫn đang tạo, cảnh này sẽ vào hàng đợi và bắt đầu sau khi cảnh trước hoàn tất')
  }, [linkLastFrame, selectedIndex, fragments, generatingIds])

  // selectedGenerateLocked 锁当前镜「生成」：忙/生成中/衔接/缺参考图等硬门禁
  const selectedGenerateLocked =
    readOnly ||
    busy ||
    selectedIsGenerating ||
    Boolean(continuityBlockedReason) ||
    selectedGateBlocking.length > 0

  // 持久化镜间衔接开关到项目 params，并让后端重排未开始任务
  async function handleLinkLastFrameChange(enabled: boolean) {
    if (readOnly) return
    const prevEnabled = linkLastFrame
    const prevParams = projectParams
    const nextParams = { ...projectParams, linkLastFrame: enabled }
    setLinkLastFrame(enabled)
    setProjectParams(nextParams)
    try {
      const updated = await dramaApi.updateProject(pid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object'
          ? (updated.params as Record<string, unknown>)
          : (nextParams as Record<string, unknown>)
      setProjectParams(updatedParams)
      setLinkLastFrame(coerceProjectBool(updatedParams.linkLastFrame ?? updatedParams.link_last_frame, enabled))
      // 刷新本集任务态，让底部分镜条立刻反映串行/并行调整
      try {
        const ep = await dramaApi.getEpisode(eid)
        setEpisode(ep)
        if (Array.isArray(ep.fragments)) setFragments(ep.fragments)
      } catch {
        /* ignore refresh errors */
      }
      setStatus(
        enabled
          ? tv('已开启尾帧衔接：未开始的任务已改成按镜序排队，进行中的任务不受影响', 'Đã bật nối khung cuối: các tác vụ chưa bắt đầu đã đổi thành xếp hàng theo thứ tự cảnh, tác vụ đang chạy không bị ảnh hưởng')
          : tv('已关闭尾帧衔接：未开始的任务已恢复并可并发生成，进行中的任务不受影响', 'Đã tắt nối khung cuối: các tác vụ chưa bắt đầu đã khôi phục và có thể tạo đồng thời, tác vụ đang chạy không bị ảnh hưởng'),
      )
    } catch (err) {
      setLinkLastFrame(prevEnabled)
      setProjectParams(prevParams)
      setError(err instanceof Error ? err.message : tv('保存衔接设置失败', 'Lưu cài đặt nối cảnh thất bại'))
    }
  }

  // 持久化本集画幅 / 清晰度到 episode.params；已有成片时提示重新生成（quiet=模型自动钳制时静默）
  async function handleEpisodeOutputChange(
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) {
    if (readOnly) return
    const prevRatio = readEpisodeAspectRatio(episodeParams, projectParams)
    const prevRes = readEpisodeResolution(episodeParams, projectParams)
    const nextRatio = readEpisodeAspectRatio(nextParams, projectParams)
    const nextRes = readEpisodeResolution(nextParams, projectParams)
    if (prevRatio === nextRatio && prevRes === nextRes) return

    const prevLabel = formatProjectOutputLabel(prevRatio, prevRes)
    const nextLabel = formatProjectOutputLabel(nextRatio, nextRes)
    const generatedCount = fragments.filter((frag) => Boolean(frag.video)).length
    const quiet = Boolean(opts?.quiet)

    if (!quiet) {
      const ok = await dialog.confirm({
        title: tv('切换画幅 / 清晰度', 'Đổi tỷ lệ khung / độ nét'),
        message:
          generatedCount > 0
            ? tv(`将本集从 ${prevLabel} 改为 ${nextLabel}。已生成的 ${generatedCount} 镜不会自动更新，需要重新生成才会按新规格出片。`, `Sẽ đổi tập này từ ${prevLabel} sang ${nextLabel}. ${generatedCount} cảnh đã tạo sẽ không tự cập nhật, cần tạo lại mới ra phim theo quy cách mới.`)
            : tv(`将本集从 ${prevLabel} 改为 ${nextLabel}。之后生成的分镜将使用该规格。`, `Sẽ đổi tập này từ ${prevLabel} sang ${nextLabel}. Các phân cảnh tạo sau đó sẽ dùng quy cách này.`),
        confirmText: generatedCount > 0 ? tv('保存并重新生成', 'Lưu và tạo lại') : tv('保存', 'Lưu'),
        cancelText: tv('取消', 'Hủy'),
        tone: generatedCount > 0 ? 'danger' : 'default',
      })
      if (!ok) return
    }

    const prevParams = episodeParams
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setAspectRatio(nextRatio)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setAspectRatio(readEpisodeAspectRatio(updatedParams, projectParams))
      if (!quiet) {
        setStatus(
          generatedCount > 0
            ? tv(`已更新本集规格为 ${nextLabel}，正在按新规格重新入队…`, `Đã cập nhật quy cách tập này thành ${nextLabel}, đang xếp hàng lại theo quy cách mới…`)
            : tv(`已更新本集规格为 ${nextLabel}`, `Đã cập nhật quy cách tập này thành ${nextLabel}`),
        )
        setError('')
        if (generatedCount > 0) {
          await generateAll({ forceRegen: true, skipConfirm: true })
        }
      } else if (generatedCount > 0) {
        // 模型能力自动钳制：不弹确认、不重入队，但提示已生成镜头需手动重生成
        setStatus(tv(`规格已按当前模型调整为 ${nextLabel}，已生成镜头需重生成才会按新规格出片`, `Quy cách đã được điều chỉnh thành ${nextLabel} theo model hiện tại, các cảnh đã tạo cần tạo lại mới ra phim theo quy cách mới`))
      }
    } catch (err) {
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setAspectRatio(readEpisodeAspectRatio(prevParams, projectParams))
      setError(err instanceof Error ? err.message : tv('本集输出规格保存失败', 'Lưu quy cách đầu ra của tập này thất bại'))
      throw err
    }
  }

  // 持久化本集字幕方式，并动态改写当前分镜里的字幕提示词
  async function handleEpisodeSubtitleChange(mode: DramaSubtitleMode) {
    if (readOnly) return
    if (mode === subtitleMode) return
    const prevParams = episodeParams
    const prevFragments = fragments
    const nextParams = {
      ...episodeParams,
      subtitleMode: mode,
      subtitleEnabled: subtitleModeUsesModelOutput(mode),
    }
    const nextFragments = applySubtitleModeToFragments(fragments, mode)
    setSubtitleMode(mode)
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setFragments(nextFragments)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setSubtitleMode(readEffectiveSubtitleMode(updatedParams, projectParamsRef.current))
      const contentChanged = nextFragments.some(
        (frag, index) => frag.content !== prevFragments[index]?.content,
      )
      if (contentChanged) {
        const ep = await dramaApi.saveFragments(
          eid,
          nextFragments.map((f, i) => {
            const prevFragParams =
              f.params && typeof f.params === 'object' && !Array.isArray(f.params)
                ? (f.params as Record<string, unknown>)
                : {}
            return {
              id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
              sort_order: i,
              content: f.content,
              cover: f.cover,
              video: f.video,
              duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
              params: { ...prevFragParams, user_edited: true },
              asset_ids: f.asset_ids || [],
            }
          }),
        )
        setEpisode(ep)
        setFragments(ep.fragments || nextFragments)
      }
      setStatus(
        mode === 'model'
          ? tv('已切换为模型自出字幕，并补回分镜字幕提示词', 'Đã chuyển sang model tự tạo phụ đề, và bổ sung lại prompt phụ đề cho phân cảnh')
          : tv('已切换为后期拼接字幕，并去掉分镜里的字幕提示词', 'Đã chuyển sang ghép phụ đề hậu kỳ, và bỏ prompt phụ đề trong phân cảnh'),
      )
      setError('')
    } catch (err) {
      setSubtitleMode(readEffectiveSubtitleMode(prevParams, projectParamsRef.current))
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setFragments(prevFragments)
      setError(err instanceof Error ? err.message : tv('本集字幕方式保存失败', 'Lưu cách làm phụ đề của tập này thất bại'))
    }
  }

  // 持久化本集人物介绍叠字开关，并动态去掉当前分镜里的介绍行
  async function handleEpisodeCharacterIntroChange(mode: DramaCharacterIntroMode) {
    if (readOnly) return
    if (mode === characterIntroMode) return
    const prevParams = episodeParams
    const prevFragments = fragments
    const nextParams = {
      ...episodeParams,
      characterIntroMode: mode,
      characterIntroEnabled: characterIntroModeEnabled(mode),
    }
    const nextFragments = applyCharacterIntroModeToFragments(fragments, mode)
    setCharacterIntroMode(mode)
    setEpisodeParams(nextParams)
    episodeParamsRef.current = nextParams
    setFragments(nextFragments)
    try {
      const updated = await dramaApi.updateEpisode(eid, { params: nextParams })
      const updatedParams =
        updated.params && typeof updated.params === 'object' && !Array.isArray(updated.params)
          ? (updated.params as Record<string, unknown>)
          : nextParams
      setEpisode(updated)
      setEpisodeParams(updatedParams)
      episodeParamsRef.current = updatedParams
      setCharacterIntroMode(readEffectiveCharacterIntroMode(updatedParams, projectParamsRef.current))
      const contentChanged = nextFragments.some(
        (frag, index) => frag.content !== prevFragments[index]?.content,
      )
      if (contentChanged) {
        const ep = await dramaApi.saveFragments(
          eid,
          nextFragments.map((f, i) => {
            const prevFragParams =
              f.params && typeof f.params === 'object' && !Array.isArray(f.params)
                ? (f.params as Record<string, unknown>)
                : {}
            return {
              id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
              sort_order: i,
              content: f.content,
              cover: f.cover,
              video: f.video,
              duration_sec: resolveFragmentDurationSec(f.content, f.duration_sec),
              params: { ...prevFragParams, user_edited: true },
              asset_ids: f.asset_ids || [],
            }
          }),
        )
        setEpisode(ep)
        setFragments(ep.fragments || nextFragments)
      }
      setStatus(
        mode === 'model'
          ? tv('已开启人物介绍叠字；重新规划分镜时会重新注入介绍行', 'Đã bật chữ giới thiệu nhân vật; khi lập kế hoạch lại phân cảnh sẽ chèn lại dòng giới thiệu')
          : tv('已关闭人物介绍，并去掉分镜里的介绍叠字行', 'Đã tắt giới thiệu nhân vật, và bỏ dòng chữ giới thiệu trong phân cảnh'),
      )
      setError('')
    } catch (err) {
      setCharacterIntroMode(readEffectiveCharacterIntroMode(prevParams, projectParamsRef.current))
      setEpisodeParams(prevParams)
      episodeParamsRef.current = prevParams
      setFragments(prevFragments)
      setError(err instanceof Error ? err.message : tv('本集人物介绍设置保存失败', 'Lưu cài đặt giới thiệu nhân vật của tập này thất bại'))
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

  // 应用后端生成进度并同步分镜状态 + 全局队列
  function applyGenerateStatus(st: Awaited<ReturnType<typeof dramaApi.generateStatus>>) {
    setStatus(tv(`完成 ${st.done}/${st.total} · 进行中 ${st.running} · 失败 ${st.failed}`, `Hoàn tất ${st.done}/${st.total} · Đang chạy ${st.running} · Thất bại ${st.failed}`))
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
        taskItems: st.tasks,
      })
      return next
    })
    return st
  }

  applyStatusRef.current = applyGenerateStatus

  // 进页检查是否有进行中的生成任务或 AI 分镜
  async function resumeGenerateIfNeeded() {
    let resumingPlan = false
    try {
      const ep = await dramaApi.getEpisode(eid)
      if (readFragmentPlanStatus(ep) === 'generating') {
        resumingPlan = true
        setPlanning(true)
        setBusy(true)
        setStatus(tv('AI 分镜中 · 正在等待文字模型返回…', 'AI đang chia phân cảnh · Đang chờ model văn bản trả về…'))
        const started = Date.now()
        while (Date.now() - started < 10 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 2500))
          const cur = await dramaApi.getEpisode(eid)
          const st = readFragmentPlanStatus(cur)
          if (st === 'completed') {
            setEpisode(cur)
            setFragments(cur.fragments || [])
            setSelectedIndex(0)
            setStatus(tv(`分镜完成 · ${(cur.fragments || []).length} 条`, `Chia phân cảnh xong · ${(cur.fragments || []).length} mục`))
            setBusy(false)
            return
          }
          if (st === 'failed') {
            setError(String(cur.params?.fragment_plan_error || tv('AI 分镜失败', 'AI chia phân cảnh thất bại')))
            setBusy(false)
            return
          }
          setStatus(tv('AI 分镜中 · 正在等待文字模型返回…', 'AI đang chia phân cảnh · Đang chờ model văn bản trả về…'))
        }
        setBusy(false)
        return
      }
      const st = applyGenerateStatus(await dramaApi.generateStatus(eid))
      if (st.running > 0) ensureEpisodeVideoStatusPoll()
    } catch {
      /* ignore */
    } finally {
      if (resumingPlan) { setPlanning(false); setBusy(false) }
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
    const epParams =
      ep.params && typeof ep.params === 'object' && !Array.isArray(ep.params)
        ? (ep.params as Record<string, unknown>)
        : {}
    setEpisodeParams(epParams)
    episodeParamsRef.current = epParams
    setSubtitleMode(readEffectiveSubtitleMode(epParams, projectParamsRef.current))
    setCharacterIntroMode(readEffectiveCharacterIntroMode(epParams, projectParamsRef.current))
    setAspectRatio(readEpisodeAspectRatio(epParams, projectParamsRef.current))
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

  reloadRef.current = reload

  // 复用全局 generate_status 轮询，避免与 dramaGenQueue 重复请求
  useEffect(() => {
    return subscribeEpisodeGenerateStatus(async (episodeId, st) => {
      if (episodeId !== eid) return
      const result = applyStatusRef.current(st)
      if (result.running === 0) {
        await reloadRef.current()
      }
    })
  }, [eid])

  // 切换分镜时退出历史版本预览
  useEffect(() => {
    setPreviewVersionId(null)
  }, [selectedIndex, selected?.id])

  useEffect(() => {
    if (!eid || !pid) return
    setBusy(false)
    setStatus('')
    setError('')
    reload().catch((err) => setError(err instanceof Error ? err.message : tv('加载失败', 'Tải thất bại')))
    dramaApi
      .listAssets(pid)
      .then(setAssets)
      .catch(() => setAssets([]))
    dramaApi
      .listEpisodes(pid)
      .then((rows) => setEpisodeList(rows))
      .catch(() => setEpisodeList([]))
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
        projectParamsRef.current = params
        const linkRaw = params.linkLastFrame ?? params.link_last_frame
        setLinkLastFrame(coerceProjectBool(linkRaw, true))
        setSubtitleMode(readEffectiveSubtitleMode(episodeParamsRef.current, params))
        setCharacterIntroMode(readEffectiveCharacterIntroMode(episodeParamsRef.current, params))
        setAspectRatio(readEpisodeAspectRatio(episodeParamsRef.current, params))
      })
      .catch(() => {
        /* ignore */
      })
  }, [eid, pid])

  // 更新当前分镜
  function updateSelected(patch: Partial<DramaFragment>) {
    if (readOnly) return
    setFragments((prev) =>
      prev.map((f, i) => (i === selectedIndex ? { ...f, ...patch } : f)),
    )
  }

  // 插入空白分镜
  function insertFrag(at: number) {
    if (readOnly) return
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
    if (readOnly) return
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
    if (readOnly) return
    if (fragments.length <= 1) return
    setFragments((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndex((cur) => {
      if (cur === index) return Math.max(0, index - 1)
      if (cur > index) return cur - 1
      return cur
    })
  }

  // 保存全部分镜（带 id 更新，避免每次重建 id 打断在途生成；标记 user_edited 防自动重切覆盖）
  async function save() {
    if (readOnly) throw new Error(tv('当前只读，无法保存分镜', 'Hiện chỉ đọc, không lưu được phân cảnh'))
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
            id: typeof f.id === 'number' && f.id > 0 ? f.id : undefined,
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
      setStatus(tv('已保存', 'Đã lưu'))
      setEditing(false)
      return ep
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('保存失败', 'Lưu thất bại'))
      throw err
    } finally {
      setBusy(false)
    }
  }

  // 判断「批量生成」时是否可安全跳过：仅跳过未改动且已有成片的旧分镜
  function shouldSkipGenerateAllFragment(frag: DramaFragment): boolean {
    if (!frag.video || !frag.id) return false
    const prev = (episode?.fragments || []).find((item) => item.id === frag.id)
    if (!prev?.video) return false
    const sameContent = (prev.content || '') === (frag.content || '')
    const sameCover = (prev.cover || '') === (frag.cover || '')
    const sameDuration =
      resolveFragmentDurationSec(prev.content || '', prev.duration_sec) ===
      resolveFragmentDurationSec(frag.content || '', frag.duration_sec)
    const prevAssetIds = [...(prev.asset_ids || [])].sort((a, b) => a - b)
    const nextAssetIds = [...(frag.asset_ids || [])].sort((a, b) => a - b)
    const sameAssets =
      prevAssetIds.length === nextAssetIds.length &&
      prevAssetIds.every((id, index) => id === nextAssetIds[index])
    return sameContent && sameCover && sameDuration && sameAssets
  }

  // 仅生成当前选中分镜（保存按 id 更新，生成前仍用保存后返回的 id）
  async function generateSelected() {
    if (readOnly) return
    if (!selected) {
      setError(tv('请先选择一条分镜', 'Vui lòng chọn một phân cảnh trước'))
      return
    }
    if (selectedGenerateLocked) {
      if (selectedGateBlocking.length > 0) {
        setError(selectedGateBlocking.map((i) => i.message).join('；'))
        await dialog.alert({
          title: tv('无法生成', 'Không thể tạo'),
          message: formatDramaGateMessage(
            selectedGateBlocking,
            [],
            tv('请先为关联角色/场景/道具生成或上传参考图。', 'Vui lòng tạo hoặc tải ảnh tham chiếu cho nhân vật/bối cảnh/đạo cụ liên quan trước.'),
          ),
        })
      } else if (continuityBlockedReason) {
        setError(continuityBlockedReason)
        await dialog.alert({
          title: tv('无法生成', 'Không thể tạo'),
          message: tv(`${continuityBlockedReason}。开启「尾帧衔接」后须先有上一镜成片，再按镜序生成本镜。`, `${continuityBlockedReason}. Sau khi bật “Nối khung cuối”, phải có phim của cảnh trước rồi mới tạo cảnh này theo thứ tự cảnh.`),
        })
      } else if (selectedIsGenerating) {
        setError(tv('当前分镜正在生成，请等待完成后再试', 'Phân cảnh hiện tại đang tạo, vui lòng chờ hoàn tất rồi thử lại'))
      } else {
        setError(tv('请等待当前操作完成后再试', 'Vui lòng chờ thao tác hiện tại hoàn tất rồi thử lại'))
      }
      return
    }

    const { blocking, warnings } = collectDramaGenerateGateIssues(selected, assets)
    if (blocking.length > 0) {
      setError(blocking.map((i) => i.message).join('；'))
      await dialog.alert({
        title: tv('无法生成', 'Không thể tạo'),
        message: formatDramaGateMessage(blocking, warnings, tv('请先按分集规则修复脚本后再生成。', 'Vui lòng sửa kịch bản theo quy tắc của tập rồi mới tạo.')),
      })
      return
    }

    const fragLabel = formatFragLabel(selectedIndex, selectedDuration)
    const isRegen = Boolean(selected.video)
    const ok = await dialog.confirm({
      title: isRegen ? tv('重新生成分镜视频', 'Tạo lại video phân cảnh') : tv('生成分镜视频', 'Tạo video phân cảnh'),
      message: formatDramaGateMessage(
        [],
        warnings,
        isRegen
          ? tv(`将保存并重新生成「${fragLabel}」。当前成片会清空并改存为历史版本，入队后可在右下角队列查看进度。`, `Sẽ lưu và tạo lại “${fragLabel}”. Phim hiện tại sẽ bị xóa và lưu thành phiên bản lịch sử, sau khi vào hàng đợi có thể xem tiến độ ở hàng đợi góc dưới bên phải.`)
          : linkLastFrame
            ? continuityQueueHint
              ? tv(`将保存「${fragLabel}」并入队。${continuityQueueHint}。`, `Sẽ lưu “${fragLabel}” và đưa vào hàng đợi. ${continuityQueueHint}.`)
              : tv(`将保存并按镜序生成「${fragLabel}」。入队后可继续编辑；本镜会使用上一镜尾帧作衔接参考。`, `Sẽ lưu và tạo “${fragLabel}” theo thứ tự cảnh. Sau khi vào hàng đợi vẫn có thể tiếp tục chỉnh sửa; cảnh này sẽ dùng khung cuối cảnh trước làm tham chiếu nối.`)
            : tv(`将保存并生成「${fragLabel}」。入队后可继续编辑；当前未开启尾帧衔接，本镜会独立生成。`, `Sẽ lưu và tạo “${fragLabel}”. Sau khi vào hàng đợi vẫn có thể tiếp tục chỉnh sửa; hiện chưa bật nối khung cuối, cảnh này sẽ tạo độc lập.`),
      ),
      confirmText: warnings.length > 0 ? tv('仍要生成', 'Vẫn tạo') : isRegen ? tv('重新生成', 'Tạo lại') : tv('开始生成', 'Bắt đầu tạo'),
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setStatus(isRegen ? tv('保存并重新排队生成…', 'Lưu và xếp hàng tạo lại…') : tv('保存并排队生成当前分镜…', 'Lưu và xếp hàng tạo phân cảnh hiện tại…'))
    try {
      const ep = await save()
      setBusy(true)
      const frag = (ep.fragments || [])[selectedIndex]
      if (!frag?.id) {
        throw new Error(tv('保存后未找到当前分镜，请刷新后重试', 'Sau khi lưu không tìm thấy phân cảnh hiện tại, vui lòng làm mới rồi thử lại'))
      }
      await dramaApi.generateEpisode(eid, [frag.id], modelId)
      // 乐观写入排队态，避免旧 video 把状态盖成已完成
      setFragments((prev) =>
        prev.map((f) =>
          f.id === frag.id
            ? {
                ...f,
                params: {
                  ...(f.params || {}),
                  generation: { status: 'queued', message: tv('已入队', 'Đã vào hàng đợi') },
                },
              }
            : f,
        ),
      )
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
      setStatus(isRegen ? tv(`「${fragLabel}」已重新入队，可在右下角查看队列`, `“${fragLabel}” đã vào hàng đợi lại, có thể xem hàng đợi ở góc dưới bên phải`) : tv(`「${fragLabel}」已入队，可在右下角查看队列`, `“${fragLabel}” đã vào hàng đợi, có thể xem hàng đợi ở góc dưới bên phải`))
      ensureEpisodeVideoStatusPoll()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : tv('生成失败', 'Tạo thất bại'))
    }
  }

  // 切换历史成片为当前预览视频
  async function activateVideoVersion(versionId: string) {
    if (readOnly) return
    if (!selected?.id || selectedIsGenerating) return
    const ok = await dialog.confirm({
      title: tv('切换历史版本', 'Chuyển phiên bản lịch sử'),
      message: tv('将用该历史成片替换当前预览；当前成片会进入历史版本列表。', 'Sẽ dùng phim lịch sử này thay cho bản xem trước hiện tại; phim hiện tại sẽ vào danh sách phiên bản lịch sử.'),
      confirmText: tv('切换', 'Chuyển'),
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const result = await dramaApi.activateFragmentVideoVersion(selected.id, versionId)
      setFragments((prev) =>
        prev.map((f) =>
          f.id === selected.id
            ? {
                ...f,
                video: result.video,
                cover: result.cover || '',
                params: {
                  ...(f.params || {}),
                  video_versions: result.video_versions,
                  lastFrameUrl: result.lastFrameUrl || undefined,
                  generation: {
                    status: 'done',
                    video: result.video,
                    cover: result.cover,
                    lastFrameUrl: result.lastFrameUrl,
                  },
                },
              }
            : f,
        ),
      )
      setPreviewVersionId(null)
      setStatus(tv('已切换历史版本', 'Đã chuyển phiên bản lịch sử'))
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('切换版本失败', 'Chuyển phiên bản thất bại'))
    } finally {
      setBusy(false)
    }
  }

  // 批量生成：入队本集分镜（forceRegen 覆盖已有成片；入口仅 MiniMax-H3）
  async function generateAll(opts?: { forceRegen?: boolean; skipConfirm?: boolean }) {
    if (readOnly) return
    if (fragments.length === 0) {
      setError(tv('没有可生成的分镜', 'Không có phân cảnh nào để tạo'))
      return
    }
    if (generateAllLocked) {
      setError(tv('正在提交，请稍候', 'Đang gửi, vui lòng chờ'))
      return
    }

    const allBlocking: string[] = []
    const allWarnings: string[] = []
    const doneIndices: number[] = []
    for (let i = 0; i < fragments.length; i++) {
      if (!opts?.forceRegen && shouldSkipGenerateAllFragment(fragments[i])) {
        doneIndices.push(i)
        continue
      }
      const { blocking, warnings } = collectDramaGenerateGateIssues(fragments[i], assets)
      const label = formatFragLabel(i, fragments[i]?.duration_sec)
      for (const issue of blocking) allBlocking.push(`${label}：${issue.message}`)
      for (const issue of warnings) allWarnings.push(`${label}：${issue.message}`)
    }
    const pendingCount = fragments.length - doneIndices.length
    if (pendingCount <= 0) {
      setStatus(tv('本集分镜已全部生成，已自动跳过', 'Các phân cảnh của tập này đã tạo hết, tự động bỏ qua'))
      return
    }
    if (allBlocking.length > 0) {
      setError(allBlocking[0] || tv('分镜脚本校验未通过', 'Kiểm tra kịch bản phân cảnh không qua'))
      await dialog.alert({
        title: tv('无法批量生成', 'Không thể tạo hàng loạt'),
        message: [tv('请先修复以下问题：', 'Vui lòng sửa các vấn đề sau trước:'), '', ...allBlocking.slice(0, 8).map((m) => `· ${m}`)].join(
          '\n',
        ),
      })
      return
    }

    if (!opts?.skipConfirm) {
      const ok = await dialog.confirm({
        title: opts?.forceRegen ? tv('按新规格重新生成', 'Tạo lại theo quy cách mới') : tv('批量生成分镜视频', 'Tạo hàng loạt video phân cảnh'),
        message: formatDramaGateMessage(
          [],
          allWarnings.slice(0, 8).map((message) => ({ level: 'warn' as const, message })),
          opts?.forceRegen
            ? tv(`将按当前画幅/清晰度重新生成 ${pendingCount} 镜。当前成片会保留为历史版本。`, `Sẽ tạo lại ${pendingCount} cảnh theo tỷ lệ khung/độ nét hiện tại. Phim hiện tại sẽ được giữ thành phiên bản lịch sử.`)
            : linkLastFrame
              ? tv(`将按镜序排队生成剩余 ${pendingCount} 镜（已生成的 ${doneIndices.length} 镜会跳过）。入队后可继续编辑；后一镜会等待上一镜尾帧写好再开始。`, `Sẽ xếp hàng tạo ${pendingCount} cảnh còn lại theo thứ tự cảnh (${doneIndices.length} cảnh đã tạo sẽ bỏ qua). Sau khi vào hàng đợi vẫn có thể tiếp tục chỉnh sửa; cảnh sau sẽ chờ khung cuối cảnh trước ghi xong mới bắt đầu.`)
              : tv(`将并发生成剩余 ${pendingCount} 镜（已生成的 ${doneIndices.length} 镜会跳过）。入队后可继续编辑；各镜互不等待。`, `Sẽ tạo đồng thời ${pendingCount} cảnh còn lại (${doneIndices.length} cảnh đã tạo sẽ bỏ qua). Sau khi vào hàng đợi vẫn có thể tiếp tục chỉnh sửa; các cảnh không chờ nhau.`),
        ),
        confirmText: allWarnings.length > 0 ? tv('仍要批量生成', 'Vẫn tạo hàng loạt') : opts?.forceRegen ? tv('全部重新生成', 'Tạo lại tất cả') : tv('批量生成', 'Tạo hàng loạt'),
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(true)
    setError('')
    setStatus(tv(`保存并排队生成剩余 ${pendingCount} 条…`, `Lưu và xếp hàng tạo ${pendingCount} mục còn lại…`))
    try {
      const ep = await save()
      setBusy(true)
      const ids = (ep.fragments || [])
        .filter((_, index) => !doneIndices.includes(index))
        .map((f) => f.id)
        .filter((id): id is number => typeof id === 'number' && id > 0)
      if (ids.length === 0) {
        setStatus(tv('保存后检测到分镜已全部生成，已自动跳过', 'Sau khi lưu phát hiện các phân cảnh đã tạo hết, tự động bỏ qua'))
        setBusy(false)
        return
      }
      const genResult = await dramaApi.generateEpisode(eid, ids, modelId)
      const queuedIds =
        Array.isArray(genResult.fragment_ids) && genResult.fragment_ids.length > 0
          ? genResult.fragment_ids
          : ids
      enqueueEpisodeVideoJobs({
        projectId: pid,
        episodeId: eid,
        episodeName: ep.name || episode?.name,
        fragments: (ep.fragments || []).map((f, i) => ({
          id: f.id,
          sort_order: f.sort_order ?? i,
        })),
        fragmentIds: queuedIds,
      })
      const deferred = Number(genResult.deferred_count || 0)
      const limit = Number(genResult.user_job_limit || 0)
      if (deferred > 0 && limit > 0) {
        setStatus(
          tv(`已入队 ${queuedIds.length} 镜：最多同时生成 ${limit} 镜，另有 ${deferred} 镜排队等待`, `Đã vào hàng đợi ${queuedIds.length} cảnh: tạo đồng thời tối đa ${limit} cảnh, còn ${deferred} cảnh xếp hàng chờ`),
        )
      } else {
        setStatus(tv(`已入队 ${queuedIds.length} 镜，生成中…`, `Đã vào hàng đợi ${queuedIds.length} cảnh, đang tạo…`))
      }
      setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('批量生成失败', 'Tạo hàng loạt thất bại'))
      setBusy(false)
    }
  }

  // 返回剧情大纲
  function handleBack() {
    navigate(`/drama/projects/${pid}`, { state: { activeStep: 'outline' } })
  }

  // 左侧目录切换分集
  function handleSelectEpisode(nextId: number) {
    if (nextId === eid) return
    navigate(`/drama/projects/${pid}/episodes/${nextId}`)
  }

  // 单集 LLM 重新分镜：确认并勾选 Skill 后入队
  function planFragmentsWithLlm() {
    if (readOnly) return
    if (planFragmentsLocked) {
      setError(tv('当前有视频生成任务进行中，请稍候再重新分镜', 'Hiện có tác vụ tạo video đang chạy, vui lòng chờ rồi mới chia lại phân cảnh'))
      return
    }
    setPlanModalOpen(true)
  }

  // 文字 LLM 立即执行，页面轮询规划进度（字幕方式沿用顶栏当前设置）。
  async function startPlanFragments(skillIds: number[]) {
    if (readOnly) return
    setPlanModalOpen(false)
    setBusy(true)
    setPlanning(true)
    setError('')
    setStatus(tv('AI 分镜中 · 正在等待文字模型返回…', 'AI đang chia phân cảnh · Đang chờ model văn bản trả về…'))
    try {
      await dramaApi.planEpisodeFragments(eid, {
        force: true,
        fallback_rules: true,
        skill_ids: skillIds,
        subtitle_enabled: subtitleModeUsesModelOutput(subtitleMode),
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500))
        const ep = await dramaApi.getEpisode(eid)
        const st = readFragmentPlanStatus(ep)
        if (st === 'completed') {
          setEpisode(ep)
          const nextParams = (ep.params as Record<string, unknown>) || {}
          setEpisodeParams(nextParams)
          episodeParamsRef.current = nextParams
          setFragments(ep.fragments || [])
          setSelectedIndex(0)
          setEditing(false)
          const mode = String(ep.params?.fragment_plan_mode || 'llm')
          const count = Number(ep.params?.fragment_plan_count) || (ep.fragments || []).length
          setStatus(
            mode === 'rules_fallback'
              ? tv(`分镜完成（模型失败已回退规则切分）· ${count} 条`, `Chia phân cảnh xong (model thất bại, đã lùi về chia theo quy tắc) · ${count} mục`)
              : tv(`分镜完成 · ${count} 条`, `Chia phân cảnh xong · ${count} mục`),
          )
          setBusy(false)
          return
        }
        if (st === 'failed') {
          const msg = String(ep.params?.fragment_plan_error || tv('AI 分镜失败', 'AI chia phân cảnh thất bại'))
          setError(msg)
          setBusy(false)
          return
        }
        setStatus(tv('AI 分镜中 · 正在等待文字模型返回…', 'AI đang chia phân cảnh · Đang chờ model văn bản trả về…'))
      }
      throw new Error(tv('AI 分镜超时，请稍后刷新查看', 'AI chia phân cảnh quá thời gian, vui lòng làm mới xem lại sau'))
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('AI 分镜失败', 'AI chia phân cảnh thất bại'))
      setBusy(false)
    } finally {
      setPlanning(false)
      setBusy(false)
    }
  }

  // 点击资产插入 @ 引用
  function mentionAsset(asset: DramaAsset) {
    if (readOnly) return
    if (!selected) return
    const mention = `@asset:${asset.id}`
    const raw = selected.content || ''
    const already = new RegExp(`@asset:${asset.id}(?!\\d)`).test(raw)
    const content = already ? raw : raw ? `${raw.trimEnd()}\n${mention}` : mention
    const ids = Array.from(new Set([...(selected.asset_ids || []), asset.id]))
    updateSelected({ content, asset_ids: ids })
    setEditing(true)
  }

  // 解析侧栏当前要新建的资产类型（未选分类时默认角色）
  function resolveCreateAssetTab(): AssetTab {
    return assetTab || 'character'
  }

  // 新建后挂到当前分镜并打开详情，便于本集列表立刻可见
  function adoptCreatedAsset(created: DramaAsset, kind: AssetTab) {
    setAssets((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
    setAssetTab(kind)
    mentionAsset(created)
    if ((created.type || '').toLowerCase() !== 'voice') {
      setDetailAsset(created)
    }
  }

  // 自定义新建角色 / 场景 / 道具
  async function handleCreateSideAsset() {
    if (readOnly) return
    const kind = resolveCreateAssetTab()
    const label = kind === 'scene' ? tv('场景', 'Bối cảnh') : kind === 'prop' ? tv('道具', 'Đạo cụ') : tv('角色', 'Nhân vật')
    const name = await dialog.prompt({
      title: tv(`新建${label}`, `Tạo ${label} mới`),
      message: tv(`输入${label}名称，创建后会插入当前分镜，并可继续生成或上传形象。`, `Nhập tên ${label}, sau khi tạo sẽ chèn vào phân cảnh hiện tại, và có thể tiếp tục tạo hoặc tải hình tượng.`),
      placeholder: kind === 'scene' ? tv('例如：深宫御花园', 'Ví dụ: Ngự hoa viên trong thâm cung') : kind === 'prop' ? tv('例如：玉佩', 'Ví dụ: Ngọc bội') : tv('例如：白龙', 'Ví dụ: Bạch long'),
      confirmText: tv('创建', 'Tạo'),
    })
    if (!name?.trim()) return
    setAssetCreateBusy(true)
    setError('')
    try {
      const created = await dramaApi.createAsset({
        project_id: pid,
        type: kind,
        asset_type: 'image',
        name: name.trim(),
        params: { kind },
      })
      adoptCreatedAsset(created, kind)
      setStatus(tv(`已新建${label}「${created.name}」并插入当前分镜`, `Đã tạo ${label} “${created.name}” mới và chèn vào phân cảnh hiện tại`))
    } catch (err) {
      setError(err instanceof Error ? err.message : tv(`创建${label}失败`, `Tạo ${label} thất bại`))
    } finally {
      setAssetCreateBusy(false)
    }
  }

  // 从全局资产库导入到本项目并挂到当前分镜
  async function handleImportSideAsset(source: DramaAsset) {
    if (readOnly) return
    const kind = normalizeAssetTab(source.type) || resolveCreateAssetTab()
    setAssetCreateBusy(true)
    setError('')
    try {
      const created = await importGlobalAssetToProject(pid, source)
      adoptCreatedAsset(created, kind)
      setLibraryPickerOpen(false)
      setStatus(tv(`已导入「${created.name}」并插入当前分镜`, `Đã nhập “${created.name}” và chèn vào phân cảnh hiện tại`))
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('导入资产失败', 'Nhập tài sản thất bại'))
      throw err
    } finally {
      setAssetCreateBusy(false)
    }
  }

  // 仅取消当前分镜对该资产的关联（不删除项目资产）
  function unlinkSelectedAsset(assetId: number) {
    if (readOnly) return
    if (!selected) return
    const content = (selected.content || '')
      .replace(new RegExp(`\\s*@asset:${assetId}(?!\\d)`, 'g'), ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    const asset_ids = (selected.asset_ids || []).filter((id) => id !== assetId)
    updateSelected({ content, asset_ids })
    setEditing(true)
    const name = assets.find((a) => a.id === assetId)?.name
    setStatus(
      name
        ? tv(`已取消本镜对「${name}」的关联，资产仍在项目中（可切到「全集」查看）`, `Đã bỏ liên kết của cảnh này với “${name}”, tài sản vẫn ở trong dự án (có thể chuyển sang “Toàn phim” để xem)`)
        : tv('已取消本镜关联，资产仍在项目中（可切到「全集」查看）', 'Đã bỏ liên kết của cảnh này, tài sản vẫn ở trong dự án (có thể chuyển sang “Toàn phim” để xem)'),
    )
  }

  // 从关联条跳到对应分类并打开资产详情
  function focusLinkedAsset(assetId: number) {
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) return
    const tab = normalizeAssetTab(asset.type)
    if (tab) setAssetTab(tab)
    setAssetScope('series')
    if ((asset.type || '').toLowerCase() !== 'voice') {
      setDetailAsset(asset)
    }
  }

  // 更新资产（音色绑定 / 上传 / 生图后刷新列表与详情）
  function handleCharacterUpdated(updated: DramaAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setDetailAsset((prev) => (prev?.id === updated.id ? updated : prev))
  }

  // 当前排队/生成中的资产生图 id
  const imageBusyIds = useMemo(() => {
    const ids = new Set<number>()
    for (const job of imageGenQueue) {
      if (job.status === 'queued' || job.status === 'running') ids.add(job.assetId)
    }
    return ids
  }, [imageGenQueue])

  // 详情弹窗生图按钮文案
  function assetImageGenLabel(asset: DramaAsset): string {
    const job = imageGenQueue.find(
      (j) =>
        j.assetId === asset.id && (j.status === 'queued' || j.status === 'running'),
    )
    let queueLabel: string | null = null
    if (job) {
      if (job.status === 'running') queueLabel = tv('生成中…', 'Đang tạo…')
      else {
        const queuedOnly = imageGenQueue.filter(
          (j) => j.status === 'queued' || j.status === 'running',
        )
        const pos = queuedOnly.findIndex((j) => j.id === job.id) + 1
        queueLabel = pos > 1 ? tv(`排队 #${pos}`, `Xếp hàng #${pos}`) : tv('排队中…', 'Đang xếp hàng…')
      }
    }
    return dramaAssetImageGenButtonLabel(asset, queueLabel)
  }

  // 将资产生图加入全局队列
  function enqueueAssetImage(asset: DramaAsset) {
    if (readOnly) return
    if (imageBusyIds.has(asset.id)) return
    const options = {
      ...defaultOptionsForAssetKind(asset.type),
      image_style_id: videoStyleId || undefined,
    }
    void enqueueDramaImageGen({
      projectId: pid,
      assetId: asset.id,
      assetName: asset.name || undefined,
      assetType: asset.type,
      prompt: readVisualPrompt(asset),
      options,
      onAssetUpdate: handleCharacterUpdated,
    })
      .then((updated) => handleCharacterUpdated(updated))
      .catch((err) => setError(err instanceof Error ? err.message : tv('生图失败', 'Tạo ảnh thất bại')))
  }

  // 打开分镜失败原因（优先队列任务，否则用分镜 params.generation.error）
  function openFragmentFailReason(frag: DramaFragment, index: number) {
    if (!frag.id) return
    const fromQueue = dramaGenQueue.find(
      (j) => j.id === videoJobId(frag.id!) || (j.kind === 'video' && j.targetId === frag.id),
    )
    const gen = readFragmentGenerationStatus(frag)
    const title = `${episode?.name || tv('本集', 'Tập này')} · ${formatFragLabel(index, frag.duration_sec)}`
    setFailReasonJob({
      id: fromQueue?.id || videoJobId(frag.id),
      kind: 'video',
      projectId: pid,
      targetId: frag.id,
      episodeId: eid || undefined,
      taskId: fromQueue?.taskId,
      title: fromQueue?.title || title,
      subtype: tv('分镜视频', 'Video phân cảnh'),
      status: 'failed',
      error: fromQueue?.error || gen.error || tv('生成失败', 'Tạo thất bại'),
      createdAt: fromQueue?.createdAt || Date.now(),
    })
  }

  // 一键 AI 生成角色音色并绑定（各角色独立 busy，互不阻塞）
  async function handleGenerateCharacterVoice(asset: DramaAsset) {
    if (readOnly) return
    if (characterVoiceBusyIds.has(asset.id)) return
    setCharacterVoiceBusyIds((prev) => new Set(prev).add(asset.id))
    setError('')
    try {
      const { character, voice } = await generateAndBindCharacterVoice(pid, asset)
      handleCharacterUpdated(character)
      setAssets((prev) => (prev.some((a) => a.id === voice.id) ? prev : [...prev, voice]))
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('音色生成失败', 'Tạo giọng nói thất bại'))
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
        {error || tv('加载中…', 'Đang tải…')}
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
          <button type="button" className="drama-ep-icon-btn" aria-label={tv("返回", "Quay lại")} onClick={handleBack}>
            ‹
          </button>
          <h1>{episode.name}</h1>
        </div>
        <div className="drama-ep-header-controls">
          <button
            type="button"
            className="drama-ep-btn-ghost"
            onClick={openEpisodeStoryboard}
          >
            {tv("进入画布", "Vào canvas")}
          </button>
          <EpisodeEditHeaderControls
            styleId={videoStyleId}
            modelId={modelId}
            episodeParams={episodeParams}
            projectParams={projectParams}
            linkLastFrame={linkLastFrame}
            subtitleMode={subtitleMode}
            characterIntroMode={characterIntroMode}
            onStyleChange={setVideoStyleId}
            onModelChange={setModelId}
            onEpisodeOutputChange={handleEpisodeOutputChange}
            onLinkLastFrameChange={(enabled) => void handleLinkLastFrameChange(enabled)}
            onSubtitleModeChange={(mode) => void handleEpisodeSubtitleChange(mode)}
            onCharacterIntroModeChange={(mode) => void handleEpisodeCharacterIntroChange(mode)}
            disabled={readOnly || busy}
            globalSettingsReadOnly
          />
          <button
            type="button"
            className="drama-ep-btn-ghost"
            disabled={planFragmentsLocked}
            onClick={() => void planFragmentsWithLlm()}
          >
            {planning
              ? tv('AI 分镜中…', 'AI đang chia phân cảnh…')
              : tv('AI 重新分镜', 'AI chia lại phân cảnh')}
          </button>
          {/* MiniMax-H3 支持一次入队本集剩余分镜；其它视频模型仍只走单镜生成 */}
          {isMinimaxH3Model(modelId) ? (
            <button
              type="button"
              className="drama-ep-btn-dark drama-ep-header-gen-all"
              disabled={generateAllLocked || fragments.length === 0}
              onClick={() => void generateAll()}
            >
              {busy && !planning ? tv('入队中…', 'Đang vào hàng đợi…') : tv('批量生成', 'Tạo hàng loạt')}
            </button>
          ) : null}
        </div>
      </header>

      {(status || error) && (
        <div className="drama-ep-banner">
          {error ? <BillingErrorNotice message={error} className="drama-ep-banner-error" inline /> : null}
          {!error && status ? <span>{status}</span> : null}
        </div>
      )}

      <div className="drama-ep-body">
        <DramaEpisodeDir
          items={buildEpisodeDirItems(episodeList.length ? episodeList : episode ? [episode] : [])}
          activeId={eid}
          onSelect={handleSelectEpisode}
        />
        <div className="drama-ep-workspace">
        <EpisodeEditAssetPanel
          readOnly={readOnly}
          scope={assetScope}
          tab={assetTab}
          assets={filteredAssets}
          activeIds={selectedRefIds}
          imageBusyIds={imageBusyIds}
          createBusy={assetCreateBusy}
          onScopeChange={setAssetScope}
          onTabChange={setAssetTab}
          onOpenCanvas={openEpisodeStoryboard}
          onOpenAsset={setDetailAsset}
          onMention={mentionAsset}
          onUnlinkAsset={unlinkSelectedAsset}
          onGenerateVoice={
            DRAMA_VOICE_BINDING_ENABLED
              ? (asset) => void handleGenerateCharacterVoice(asset)
              : undefined
          }
          voiceBusyIds={characterVoiceBusyIds}
          onVoiceError={(message) => setError(message)}
          onCreateAsset={() => void handleCreateSideAsset()}
          onImportAsset={() => setLibraryPickerOpen(true)}
        />

        <section className="drama-ep-editor">
          <div className="drama-ep-editor-head">
            <div>
              <strong>{formatFragLabel(selectedIndex, selectedDuration)}</strong>
              <MediaCostNotice modelId={modelId} resolution={readEpisodeResolution(episodeParams, projectParams)} seconds={selectedDuration} />
              <p>
                {tv("顶部显示本镜关联；键入 @ 可引用资产或插入时长标签 ·", "Phía trên hiển thị liên kết của cảnh này; gõ @ để tham chiếu tài sản hoặc chèn nhãn thời lượng ·")}{' '}
                {formatProjectOutputLabel(
                  readEpisodeAspectRatio(episodeParams, projectParams),
                  readEpisodeResolution(episodeParams, projectParams),
                )}
              </p>
            </div>
            <label className="drama-ep-duration">
              {tv("时长", "Thời lượng")}
              <input
                type="number"
                min={mediaCatalog?.video_models.find(item => item.id === modelId)?.duration_min ?? 4}
                max={mediaCatalog?.video_models.find(item => item.id === modelId)?.duration_max ?? 30}
                value={selectedDuration}
                disabled={readOnly || (!editing && !selected)}
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
              editing={editing && !readOnly}
              onOpenAsset={focusLinkedAsset}
              onContentChange={(nextContent) => {
                const fromContent = extractAssetIds(nextContent)
                const prevContentIds = extractAssetIds(selected?.content || '')
                const removed = prevContentIds.filter((id) => !fromContent.includes(id))
                /* 正文删掉的引用同步移出 asset_ids；仅存在于 asset_ids 的额外关联保留 */
                const prevContentIdSet = new Set(prevContentIds)
                const keptExtra = (selected?.asset_ids || []).filter(
                  (id) => !prevContentIdSet.has(id) || fromContent.includes(id),
                )
                updateSelected({
                  content: nextContent,
                  asset_ids: Array.from(new Set([...keptExtra, ...fromContent])),
                })
                if (removed.length > 0) {
                  setStatus(tv('已取消本镜关联，资产仍保留在项目中（可切到「全集」查看）', 'Đã bỏ liên kết của cảnh này, tài sản vẫn được giữ trong dự án (có thể chuyển sang “Toàn phim” để xem)'))
                }
              }}
            />

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
              className={`drama-ep-continuity-hint${
                !continuityBlockedReason ? ' is-ready' : ' is-wait'
              }`}
            >
              {continuityBlockedReason
                ? tv(`已开启尾帧衔接：${continuityBlockedReason}`, `Đã bật nối khung cuối: ${continuityBlockedReason}`)
                : continuityQueueHint
                  ? continuityQueueHint
                  : prevLastFrameUrl
                    ? tv('将使用上一镜尾帧作为衔接参考（与角色参考图一并提交）', 'Sẽ dùng khung cuối cảnh trước làm tham chiếu nối (gửi cùng ảnh tham chiếu nhân vật)')
                    : tv('上一镜已成片：生成时将自动抽取尾帧作衔接参考', 'Cảnh trước đã có phim: khi tạo sẽ tự động trích khung cuối làm tham chiếu nối')}
            </p>
          ) : !linkLastFrame ? (
            <p className="drama-ep-continuity-hint">
              {tv("当前未开启尾帧衔接：分镜会独立并发生成，适合快速批量出片。", "Hiện chưa bật nối khung cuối: các phân cảnh sẽ tạo độc lập đồng thời, phù hợp ra phim hàng loạt nhanh.")}
            </p>
          ) : null}

          <div className="drama-ep-editor-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={readOnly || busy}
                  onClick={() => {
                    setEditing(false)
                    void reload()
                  }}
                >
                  {tv("取消", "Hủy")}
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={readOnly || busy}
                  onClick={() => void save()}
                >
                  {busy ? tv('保存中…', 'Đang lưu…') : tv('保存', 'Lưu')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="drama-ep-btn-ghost"
                  disabled={readOnly || !selected || selectedIsGenerating || busy}
                  onClick={() => setEditing(true)}
                >
                  {tv("编辑", "Chỉnh sửa")}
                </button>
                <button
                  type="button"
                  className="drama-ep-btn-dark"
                  disabled={selectedGenerateLocked || !selected}
                  title={
                    selectedGateBlocking[0]?.message ||
                    continuityBlockedReason ||
                    continuityQueueHint ||
                    (selectedIsGenerating ? tv('当前分镜正在生成', 'Phân cảnh hiện tại đang tạo') : undefined)
                  }
                  onClick={() => void generateSelected()}
                >
                  {selectedIsGenerating
                    ? tv('生成中…', 'Đang tạo…')
                    : busy
                      ? tv('处理中…', 'Đang xử lý…')
                      : selectedGateBlocking.length > 0
                        ? tv('先补参考图', 'Bổ sung ảnh tham chiếu trước')
                        : continuityQueueHint
                          ? tv('排队生成', 'Xếp hàng tạo')
                          : continuityBlockedReason
                            ? tv('待上一镜', 'Chờ cảnh trước')
                            : selectedHasVideo
                              ? tv('重新生成', 'Tạo lại')
                              : tv('生成', 'Tạo')}
                </button>
              </>
            )}
          </div>
          </div>

          {selectedVersions.length > 0 && selected?.id ? (
            <div className="drama-ep-versions">
              <span className="drama-ep-versions-label">{tv("历史版本", "Phiên bản lịch sử")}</span>
              <div className="drama-ep-versions-list">
                {selectedHasVideo && selected.video ? (
                  <button
                    type="button"
                    className={`drama-ep-version is-active${!previewVersionId ? ' is-current' : ''}`}
                    disabled={busy || selectedIsGenerating}
                    title={tv("当前成片", "Phim hiện tại")}
                    onClick={() => setPreviewVersionId(null)}
                  >
                    {selected.cover ? (
                      <img src={resolveDramaMediaUrl(selected.cover)} alt="" />
                    ) : (
                      <video src={resolveDramaMediaUrl(selected.video)} muted />
                    )}
                    <em>{tv("当前", "Hiện tại")}</em>
                  </button>
                ) : null}
                {selectedVersions.map((ver, index) => {
                  const cover = ver.cover ? resolveDramaMediaUrl(ver.cover) : ''
                  const video = resolveDramaMediaUrl(ver.video)
                  const versionNo = selectedVersions.length - index
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      className={`drama-ep-version${previewVersionId === ver.id ? ' is-previewing' : ''}`}
                      disabled={busy || selectedIsGenerating}
                      title={tv("点击预览；右侧可设为当前", "Bấm để xem trước; bên phải có thể đặt làm hiện tại")}
                      onClick={() => setPreviewVersionId(ver.id)}
                    >
                      {cover ? <img src={cover} alt="" /> : <video src={video} muted />}
                      <em>v{versionNo}</em>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>

        <EpisodeEditSidePane
          fragments={fragments}
          playingFragmentId={playingFragmentId}
          onPlayingFragmentChange={handlePlayingFragmentChange}
          aspectRatio={aspectRatio}
          episodeId={episode?.id}
          projectId={projectId}
          episodeName={episode?.name || tv('本集', 'Tập này')}
          onOpenStoryboard={openEpisodeStoryboard}
          previewVideoUrl={previewVideoUrl}
          previewPosterUrl={previewPosterUrl}
          previewLabel={
            previewVersion
              ? `v${
                  selectedVersions.length -
                  selectedVersions.findIndex((ver) => ver.id === previewVersion.id)
                }`
              : ''
          }
          onClearPreview={() => setPreviewVersionId(null)}
          onActivatePreview={
            previewVersionId && !readOnly
              ? () => {
                  void activateVideoVersion(previewVersionId)
                }
              : undefined
          }
        />
        </div>
      </div>

      <footer className="drama-ep-storyboard">
        <div className="drama-ep-storyboard-row">
          <button
            type="button"
            className="drama-ep-insert"
            aria-label={tv("在开头插入分镜", "Chèn phân cảnh ở đầu")}
            disabled={readOnly}
            onClick={() => insertFrag(0)}
          >
            +
          </button>
          {fragments.map((frag, index) => {
            const genInfo = readFragmentGenerationStatus(frag)
            const fragStatus = genInfo.status
            const activeVideoTask = (episode?.active_tasks || []).find(
              (task) =>
                task.task_type === 'fragment_video' &&
                task.fragment_id === frag.id &&
                !task.cancel_requested &&
                ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(
                  task.status,
                ),
            )
            // 终态优先；仅在进行中时才用平台任务态覆盖（避免 done 仍被僵尸任务刷成生成中）
            const displayStatus =
              fragStatus === 'done' ||
              fragStatus === 'failed' ||
              fragStatus === 'cancelled'
                ? fragStatus
                : activeVideoTask
                  ? activeVideoTask.status === 'pending' || activeVideoTask.status === 'leased'
                    ? 'queued'
                    : 'running'
                  : fragStatus
            const fragBusy =
              Boolean(frag.id && generatingIds.has(frag.id)) &&
              displayStatus !== 'done' &&
              displayStatus !== 'failed' &&
              displayStatus !== 'cancelled'
            const badge = fragmentQueueBadgeLabel(displayStatus)
            const clipVideo = frag.video ? resolveDramaMediaUrl(frag.video) : ''
            const clipCover = frag.cover ? resolveDramaMediaUrl(frag.cover) : ''
            const showFailHint = displayStatus === 'failed' && !fragBusy
            const fragParams =
              frag.params && typeof frag.params === 'object' && !Array.isArray(frag.params)
                ? (frag.params as Record<string, unknown>)
                : {}
            return (
            <div key={`${frag.id}-${index}`} className="drama-ep-clip-wrap">
              <div
                className={`drama-ep-clip-shell ${selectedIndex === index ? 'active' : ''}${
                  fragBusy ? ' is-generating' : ''
                }${displayStatus === 'queued' ? ' is-queued' : ''}${
                  displayStatus === 'failed' ? ' is-failed' : ''
                }`}
              >
                <button
                  type="button"
                  className="drama-ep-clip"
                  onClick={() => setSelectedIndex(index)}
                >
                  {clipCover ? (
                    <img src={clipCover} alt="" />
                  ) : clipVideo ? (
                    <video src={clipVideo} muted />
                  ) : (
                    <span className="drama-ep-clip-empty">
                      {fragBusy ? '…' : showFailHint ? (
                        <CircleAlert size={22} strokeWidth={2} aria-hidden />
                      ) : (
                        '+'
                      )}
                    </span>
                  )}
                  {badge ? <span className="drama-ep-clip-badge">{badge}</span> : null}
                  <em>
                    {formatFragLabel(index, frag.duration_sec)}
                    <DramaFragmentClipSpec
                      fragmentParams={fragParams}
                      episodeParams={episodeParams}
                      projectParams={projectParams}
                      videoUrl={clipVideo}
                    />
                  </em>
                </button>
                {showFailHint ? (
                  <button
                    type="button"
                    className="drama-ep-clip-fail-btn"
                    title={tv("查看失败原因", "Xem nguyên nhân thất bại")}
                    aria-label={tv(`查看片段 ${index + 1} 失败原因`, `Xem nguyên nhân thất bại của đoạn ${index + 1}`)}
                    onClick={() => openFragmentFailReason(frag, index)}
                  >
                    <CircleAlert size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="drama-ep-clip-ops">
                <button type="button" aria-label={tv("插入", "Chèn")} onClick={() => insertFrag(index + 1)} disabled={readOnly || busy}>
                  +
                </button>
                <button type="button" aria-label={tv("复制", "Sao chép")} onClick={() => duplicateFrag(index)} disabled={readOnly || busy}>
                  ⧉
                </button>
                <button
                  type="button"
                  aria-label={tv("删除", "Xóa")}
                  disabled={readOnly || busy || fragments.length <= 1}
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
        open={planModalOpen && !readOnly}
        message={tv("将调用大模型按本集剧本重新规划分镜（覆盖并清空现有分镜与已生成镜头），通常需要数十秒。可勾选本次使用的 Skill。字幕方式沿用顶栏当前设置。", "Sẽ gọi model lớn lập kế hoạch lại phân cảnh theo kịch bản của tập này (ghi đè và xóa phân cảnh hiện có cùng các cảnh đã tạo), thường mất vài chục giây. Có thể tích chọn Skill dùng lần này. Cách làm phụ đề giữ theo cài đặt thanh trên hiện tại.")}
        onCancel={() => setPlanModalOpen(false)}
        onConfirm={(skillIds) => void startPlanFragments(skillIds)}
      />

      {detailAsset && (detailAsset.type || '').toLowerCase() !== 'voice' ? (
        <EditableAssetDetailDialog
          asset={detailAsset}
          readOnly={readOnly}
          open
          busy={imageBusyIds.has(detailAsset.id)}
          genLabel={assetImageGenLabel(detailAsset)}
          onClose={() => setDetailAsset(null)}
          onUpdated={handleCharacterUpdated}
          onGenerate={(a) => enqueueAssetImage(a)}
          onBindVoice={DRAMA_VOICE_BINDING_ENABLED ? (a) => setVoiceBindAsset(a) : undefined}
          onError={(message) => setError(message)}
        />
      ) : null}

      {!readOnly && DRAMA_VOICE_BINDING_ENABLED && voiceBindAsset ? (
        <CharacterVoiceBindModal
          asset={voiceBindAsset}
          projectId={pid}
          open
          onClose={() => setVoiceBindAsset(null)}
          onBound={(updated) => {
            handleCharacterUpdated(updated)
            setVoiceBindAsset(null)
          }}
          onError={(message) => setError(message)}
        />
      ) : null}

      <GlobalAssetPickerModal
        open={libraryPickerOpen && !readOnly}
        onClose={() => setLibraryPickerOpen(false)}
        projectId={pid}
        defaultTab={resolveCreateAssetTab()}
        allowedTypes={
          resolveCreateAssetTab() === 'prop'
            ? ['prop', 'material', 'none']
            : [resolveCreateAssetTab()]
        }
        title={tv(`导入${resolveCreateAssetTab() === 'scene' ? '场景' : resolveCreateAssetTab() === 'prop' ? '道具' : '角色'}`, `Nhập ${resolveCreateAssetTab() === 'scene' ? '场景' : resolveCreateAssetTab() === 'prop' ? '道具' : '角色'}`)}
        confirmLabel={tv("导入到本集", "Nhập vào tập này")}
        onPick={handleImportSideAsset}
      />

      {failReasonJob ? (
        <div className="drama-ep-fail-reason-pop">
          <DramaGenTaskDetail job={failReasonJob} onClose={() => setFailReasonJob(null)} />
        </div>
      ) : null}
    </div>
  )
}
import { MediaCostNotice } from '../../components/billing/MediaCostNotice'
