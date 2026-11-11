import { readEpisodeJob } from '../../lib/dramaEpisodeJobs'
import { isRequestAborted } from '../../api/http'
import { TeamEditingBoundary } from '../../features/teams/TeamEditingBoundary'
/** 剧情大纲：左栏分集目录 + 右栏本集梗概/剧本与可选创作备注 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Lightbulb,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Maximize2,
  Pencil,
} from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaEpisode, type DramaEpisodeBody, type DramaProject, type DramaScript } from '../../api/drama'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { dialog } from '../../lib/dialog'
import {
  buildOutlineDirectory,
  episodeBodyCharLen,
  isSubstantialEpisodeBody,
  isSubstantialEpisodeCreative,
  mergeDirectoryEpisodeBodies,
  MIN_EPISODE_BODY_CHARS,
  MIN_EPISODE_CREATIVE_CHARS,
  parseEpisodeBodies,
} from './dramaWorkspaceUtils'
import { sumFragmentContentDuration } from './dramaEpisodeEditUtils'
import { OutlineScriptParseModal, OutlineScriptPreview } from './outlineScriptPreview'
import DramaStatusNotice, { DramaErrorNotice } from './DramaStatusNotice'
import { tv } from '../../i18n/tv'

type SectionKey = 'creative' | 'summary' | 'body'

const GENERATION_TITLES: Record<string, string> = {
  creative: tv('正在生成本集创作思路', 'Đang tạo hướng sáng tạo của tập này'),
  summary: tv('正在生成本集梗概', 'Đang tạo tóm tắt của tập này'),
  brief: tv('正在提取本集梗概', 'Đang trích xuất tóm tắt của tập này'),
  body: tv('正在生成拍摄剧本', 'Đang tạo kịch bản quay'),
  full: tv('正在重新生成整集', 'Đang tạo lại cả tập'),
}

/** 分集目录用的镜头合计文案 */
function formatOutlineShotDuration(sec: number): string {
  if (sec <= 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? tv(`${m}分${s}秒`, `${m} phút ${s} giây`) : tv(`${m}分钟`, `${m} phút`)
}

type OutlineEpisodePanelProps = {
  projectId: number
  script: DramaScript | null
  episodeCount: number
  summaryReady: boolean
  /** 全剧摘要生成中（外部目录/空态需显示，不依赖弹窗） */
  summaryGenerating?: boolean
  /** 整剧摘要后抽取资产中 */
  assetsSeeding?: boolean
  episodeGenerating: boolean
  /** 整剧分集剧本进度 */
  episodeProgress?: { done: number; total: number }
  imageStyleLabel?: string
  storyType?: string
  onScriptChange: (script: DramaScript) => void
  onProjectChange: (project: DramaProject) => void
  onError: (msg: string) => void
  onOpenEpisodes: () => void
  children?: (parts: { directory: ReactNode; bodies: ReactNode }) => ReactNode
}

type SectionCardProps = {
  sectionKey: SectionKey
  icon: ReactNode
  title: string
  subtitle: string
  text: string
  editing: boolean
  draft: string
  open: boolean
  busy: boolean
  /** 禁用「生成」按钮；其他集生成中时仍可编辑本集 */
  generateBusy?: boolean
  placeholder: string
  regenerateLabel: string
  onToggle: () => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onDraftChange: (v: string) => void
  onRegenerate?: () => void
  onCopy: () => void
  /** 剧本区：解析预览 + 分段编辑 */
  scriptPreview?: ReactNode
}

// 分区卡片：图标标题 + 编辑/生成/复制/折叠
function SectionCard({
  sectionKey,
  icon,
  title,
  subtitle,
  text,
  editing,
  draft,
  open,
  busy,
  generateBusy,
  placeholder,
  regenerateLabel,
  onToggle,
  onEdit,
  onCancel,
  onSave,
  onDraftChange,
  onRegenerate,
  onCopy,
  scriptPreview,
}: SectionCardProps) {
  const genBusy = generateBusy ?? busy
  return (
    <article className={`drama-outline-section${open ? ' is-open' : ''}`}>
      <header className="drama-outline-section-head">
        <div className="drama-outline-section-title">
          <span className={`drama-outline-section-icon is-${sectionKey}`} aria-hidden>
            {icon}
          </span>
          <div>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="drama-outline-section-actions">
          <button type="button" className="drama-outline-text-btn" disabled={busy} onClick={onEdit}>
            <Pencil size={14} strokeWidth={2} />
            {tv("编辑", "Chỉnh sửa")}
          </button>
          {onRegenerate ? (
            <button type="button" className="drama-outline-text-btn" disabled={genBusy} onClick={onRegenerate}>
              <RefreshCw size={14} strokeWidth={2} />
              {regenerateLabel}
            </button>
          ) : null}
          <button type="button" className="drama-outline-text-btn" onClick={onCopy}>
            <Copy size={14} strokeWidth={2} />
            {tv("复制", "Sao chép")}
          </button>
          <button
            type="button"
            className="drama-outline-text-btn drama-outline-text-btn-icon"
            onClick={onToggle}
            aria-label={sectionKey === 'body' ? tv('弹窗解析', 'Phân tích trong cửa sổ') : open ? tv('收起', 'Thu gọn') : tv('展开', 'Mở rộng')}
          >
            {sectionKey === 'body' ? (
              <Maximize2 size={14} strokeWidth={2} />
            ) : open ? (
              <ChevronUp size={14} strokeWidth={2} />
            ) : (
              <ChevronDown size={14} strokeWidth={2} />
            )}
            {sectionKey === 'body' ? tv('解析预览', 'Xem trước phân tích') : open ? tv('收起', 'Thu gọn') : tv('展开', 'Mở rộng')}
          </button>
        </div>
      </header>
      {open ? (
        <div className="drama-outline-section-body">
          {editing ? (
            <>
              <textarea
                className="drama-ep-section-textarea"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                rows={sectionKey === 'body' ? 14 : 8}
                placeholder={placeholder}
                disabled={busy}
              />
              <div className="drama-ep-section-edit-actions">
                <button type="button" className="drama-btn-ghost" disabled={busy} onClick={onCancel}>
                  {tv("取消", "Hủy")}
                </button>
                <button type="button" className="drama-btn-primary" disabled={busy} onClick={onSave}>
                  {tv("保存", "Lưu")}
                </button>
              </div>
            </>
          ) : scriptPreview ? (
            scriptPreview
          ) : (
            <p className="drama-pre drama-outline-section-text">{text.trim() || placeholder}</p>
          )}
        </div>
      ) : null}
    </article>
  )
}
// 分集目录 + 本集梗概、拍摄剧本、可选备注
export function OutlineEpisodePanel({
  projectId,
  script,
  episodeCount,
  summaryReady,
  summaryGenerating = false,
  assetsSeeding = false,
  episodeGenerating,
  episodeProgress = { done: 0, total: 0 },
  imageStyleLabel,
  storyType,
  onScriptChange,
  onProjectChange,
  onError,
  onOpenEpisodes,
  children,
}: OutlineEpisodePanelProps) {
  const navigate = useNavigate()
  const [activeEpisodeNumber, setActiveEpisodeNumber] = useState(1)
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(['summary', 'body']),
  )
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [localJobs, setLocalJobs] = useState<Record<number, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [enterSkillOpen, setEnterSkillOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localNotice, setLocalNotice] = useState('')
  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [sceneEditing, setSceneEditing] = useState(false)
  const [episodeCovers, setEpisodeCovers] = useState<Record<number, string>>({})
  const [episodeShotStats, setEpisodeShotStats] = useState<
    Record<number, { episodeId: number; fragmentCount: number; totalSec: number; planStatus: string; scriptChanged: boolean }>
  >({})

  const episodeBodies = parseEpisodeBodies(script)
  const directoryEpisodes = buildOutlineDirectory(episodeBodies, episodeCount)
  const displayEpisodes = mergeDirectoryEpisodeBodies(directoryEpisodes, episodeBodies)
  const selected =
    displayEpisodes.find((ep) => ep.episodeNumber === activeEpisodeNumber) || displayEpisodes[0] || null

  const selectedJob = readEpisodeJob(script, selected?.episodeNumber || 0)
  const generatingMode = selected ? localJobs[selected.episodeNumber || 0] || selectedJob.mode || null : null
  const generatingEpisodeNumber = Number(Object.keys(localJobs).find((number) => Number(number) !== selected?.episodeNumber) || 0) || null

  useEffect(() => {
    if (!selected) return
    if (!displayEpisodes.some((ep) => ep.episodeNumber === activeEpisodeNumber) && displayEpisodes[0]) {
      setActiveEpisodeNumber(displayEpisodes[0].episodeNumber || 1)
    }
  }, [displayEpisodes, activeEpisodeNumber, selected])

  useEffect(() => {
    setEditingSection(null)
    setSectionDraft('')
    setTitleDraft(selected?.title || '')
    setLocalError('')
    setLocalNotice('')
    setScriptModalOpen(false)
    setSceneEditing(false)
  }, [selected?.episodeNumber])

  useEffect(() => {
    if (!editingSection) setTitleDraft(selected?.title || '')
  }, [selected?.title, editingSection])

  // 读取分集 AI 分镜状态（含自动入队）
  function readPlanStatus(ep: DramaEpisode): string {
    const active = (ep.active_tasks || []).find((task) => task.task_type === 'fragment_plan')
    if (
      active &&
      !active.cancel_requested &&
      ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(active.status)
    ) {
      return 'generating'
    }
    const st = ep.params?.fragment_plan_status
    return typeof st === 'string' ? st : ''
  }

  // 从分集列表刷新封面 / 镜数 / 分镜状态
  function applyEpisodeRows(rows: DramaEpisode[]) {
    const map: Record<number, string> = {}
    const shotMap: Record<number, { episodeId: number; fragmentCount: number; totalSec: number; planStatus: string; scriptChanged: boolean }> =
      {}
    for (const ep of rows) {
      const epNo = Number(ep.params?.episodeNumber) || 0
      if (!epNo) continue
      const frags = [...(ep.fragments || [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )
      const planStatus = readPlanStatus(ep)
      const totalSec =
        frags.length > 0
          ? frags.reduce((sum, f) => {
              const stored = Number(f.duration_sec)
              if (Number.isFinite(stored) && stored > 0) return sum + Math.round(stored)
              return sum + sumFragmentContentDuration(f.content || '')
            }, 0)
          : 0
      shotMap[epNo] = {
        episodeId: ep.id,
        fragmentCount: frags.length,
        totalSec,
        planStatus,
        scriptChanged: ep.params?.fragment_script_changed === true,
      }
      const first = frags.find((f) => (f.cover || '').trim() || (f.video || '').trim())
      if (!first) continue
      const raw = (first.cover || first.video || '').trim()
      if (raw) map[epNo] = resolveDramaMediaUrl(raw)
    }
    setEpisodeCovers(map)
    setEpisodeShotStats(shotMap)
  }

  // 只读已有分集行；勿提前规则 seed（否则会假显示「1 镜」）。分镜中持续轮询。
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function refresh() {
      try {
        const rows: DramaEpisode[] = await dramaApi.listEpisodes(projectId)
        if (cancelled) return
        applyEpisodeRows(rows)
        const anyPlanning = rows.some((ep) => readPlanStatus(ep) === 'generating')
        // 分集剧本还在跑时也继续刷，以便每集完成后立刻看到「AI 分镜中」
        if (anyPlanning || episodeGenerating) {
          timer = window.setTimeout(() => {
            void refresh()
          }, 2500)
        }
      } catch {
        if (!cancelled) {
          setEpisodeCovers({})
          setEpisodeShotStats({})
        }
      }
    }

    void refresh()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [projectId, script?.id, script?.episode_content, episodeCount, episodeGenerating, generatingMode])

  const selectedGenerating = Boolean(selected && localJobs[selected.episodeNumber || 0]) || ['queued', 'generating', 'running'].includes(selectedJob.status)
  const anyEpisodeGenerating = Object.keys(localJobs).length > 0
  const effectiveCreative =
    editingSection === 'creative' ? sectionDraft : selected?.creative || ''
  const effectiveSummary =
    editingSection === 'summary' ? sectionDraft : selected?.summary || ''
  const canGenerateBody =
    episodeBodyCharLen(effectiveCreative) >= 10 || episodeBodyCharLen(effectiveSummary) >= 40
  const canRegenerateEpisode =
    isSubstantialEpisodeCreative(effectiveCreative) || episodeBodyCharLen(effectiveSummary) >= 40
  const canAdd =
    summaryReady &&
    !episodeGenerating &&
    !adding &&
    !anyEpisodeGenerating &&
    !confirming &&
    directoryEpisodes.length < 120

  // 整剧批量生成时：已写完正文的集可编辑 / 进分镜 / 重生成；未完成集仍锁生成
  // 单集任务按集号独立；只禁用当前正在生成的一集
  const selectedBodyReady = isSubstantialEpisodeBody(selected?.body)
  const summaryGenerateMode = selectedBodyReady
    ? 'brief'
    : isSubstantialEpisodeCreative(selected?.creative) ? 'summary' : null
  const batchLocksThisEpisode = episodeGenerating && !selectedBodyReady
  const busy = selectedGenerating || confirming || saving || adding
  const generateBusy =
    selectedGenerating || batchLocksThisEpisode || confirming || saving || adding
  const enterBusy = busy || !selectedBodyReady

  async function pollOptimize(tokenEpisode: number) {
    const started = Date.now()
    let lastErr: Error | null = null
    while (Date.now() - started < 8 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 2000))
      let cur: DramaScript
      try { cur = await dramaApi.getScript(projectId) }
      catch (err) { if (isRequestAborted(err)) throw err; lastErr = err instanceof Error ? err : new Error(tv('轮询失败', 'Thăm dò thất bại')); continue }
      onScriptChange(cur)
      lastErr = null
      const job = readEpisodeJob(cur, tokenEpisode)
      if (job.status === 'completed') return cur
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error || tv('本集生成失败或已取消', 'Tập này tạo thất bại hoặc đã bị hủy'))

    }
    throw lastErr || new Error(tv('生成超时，请稍后刷新', 'Tạo quá thời gian, vui lòng làm mới sau'))
  }

  async function saveBodies(nextBodies: DramaEpisodeBody[]) {
    if (!selected?.episodeNumber) throw new Error(tv('请先选择分集', 'Vui lòng chọn tập trước'))
    const current = nextBodies.find((item) => item.episodeNumber === selected.episodeNumber)
    if (!current) throw new Error(tv('分集不存在，请刷新', 'Tập không tồn tại, vui lòng làm mới'))
    await dramaApi.updateScriptEpisode(projectId, selected.episodeNumber, { title: current.title, creative: current.creative, summary: current.summary, body: current.body, version: Number((script?.params?.episode_versions as Record<string, number> | undefined)?.[String(selected.episodeNumber)] ?? 0) })
    const updated = await dramaApi.getScript(projectId)
    onScriptChange(updated)
    return updated
  }

  async function handleAddEpisode() {
    if (!canAdd) return
    setAdding(true)
    setLocalError('')
    try {
      const res = await dramaApi.addEpisode({ project_id: projectId })
      onScriptChange(res.script)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
      setActiveEpisodeNumber(res.episode_number)
      setEditingSection('summary')
      setSectionDraft('')
      setOpenSections((prev) => new Set(prev).add('summary'))
      onOpenEpisodes()
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('加集失败', 'Thêm tập thất bại')
      setLocalError(msg)
      onError(msg)
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveSection(section: SectionKey) {
    if (!selected?.episodeNumber) return
    setSaving(true)
    setLocalError('')
    try {
      const num = selected.episodeNumber
      const next = displayEpisodes.map((ep) => {
        if (ep.episodeNumber !== num) return ep
        if (section === 'creative') return { ...ep, creative: sectionDraft, title: titleDraft || ep.title }
        if (section === 'summary') return { ...ep, summary: sectionDraft, title: titleDraft || ep.title }
        return { ...ep, body: sectionDraft, title: titleDraft || ep.title }
      })
      await saveBodies(next)
      setEditingSection(null)
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('保存失败', 'Lưu thất bại')
      setLocalError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate(mode: 'summary' | 'body' | 'full' | 'brief') {
    if (!selected?.episodeNumber) return
    if (editingSection || sceneEditing) {
      setLocalError(tv('请先保存或取消正在编辑的内容，再生成。', 'Vui lòng lưu hoặc hủy nội dung đang chỉnh sửa rồi mới tạo.'))
      return
    }
    const creative = selected.creative || ''
    const summary = selected.summary || ''
    if (mode === 'summary' && !isSubstantialEpisodeCreative(creative)) {
      setLocalError(tv(`用于生成梗概的创作备注至少 ${MIN_EPISODE_CREATIVE_CHARS} 字`, `Ghi chú sáng tạo dùng để tạo tóm tắt tối thiểu ${MIN_EPISODE_CREATIVE_CHARS} chữ`))
      return
    }
    if (mode === 'full' && !isSubstantialEpisodeCreative(creative) && episodeBodyCharLen(summary) < 40) {
      setLocalError(tv(`请填写至少 40 字的本集梗概，或至少 ${MIN_EPISODE_CREATIVE_CHARS} 字的创作备注`, `Vui lòng nhập tóm tắt tập này tối thiểu 40 chữ, hoặc ghi chú sáng tạo tối thiểu ${MIN_EPISODE_CREATIVE_CHARS} chữ`))
      return
    }
    // 与后端 run_episode_body_from_brief 一致：创意≥10 或摘要≥40
    if (mode === 'body' && episodeBodyCharLen(creative) < 10 && episodeBodyCharLen(summary) < 40) {
      setLocalError(tv('请先填写本集梗概，再生成拍摄剧本', 'Vui lòng nhập tóm tắt tập này trước rồi mới tạo kịch bản quay'))
      return
    }
    if (mode === 'brief' && !isSubstantialEpisodeBody(selected.body)) {
      setLocalError(tv(`拍摄剧本需满 ${MIN_EPISODE_BODY_CHARS} 字后再提取本集梗概`, `Kịch bản quay phải đủ ${MIN_EPISODE_BODY_CHARS} chữ mới trích xuất được tóm tắt tập này`))
      return
    }
    if (mode === 'full') {
      const ok = await dialog.confirm({
        title: tv('重新生成整集', 'Tạo lại cả tập'),
        message:
          tv('将优先按本集梗概重写拍摄剧本；没有梗概时使用创作备注。若本集已进入分镜，之后重新分镜会覆盖并清空已生成镜头。是否继续？', 'Sẽ ưu tiên viết lại kịch bản quay theo tóm tắt của tập này; nếu không có tóm tắt thì dùng ghi chú sáng tạo. Nếu tập đã vào phân cảnh, lần chia lại sau đó sẽ ghi đè và xóa các cảnh đã tạo. Tiếp tục không?'),
        confirmText: tv('重新生成', 'Tạo lại'),
        tone: 'danger',
      })
      if (!ok) return
    }
    const targetEpisode = selected.episodeNumber
    setLocalJobs((jobs) => ({ ...jobs, [targetEpisode]: mode }))
    setLocalError('')
    setLocalNotice('')
    try {
      await dramaApi.episodeScript({
        project_id: projectId,
        episode_number: targetEpisode,
        generate_mode: mode,
        creative: creative || undefined,
        title: selected.title,
      })
      const cur = await pollOptimize(targetEpisode)
      const created = readEpisodeJob(cur, targetEpisode).assetsCreated
      if ((mode === 'body' || mode === 'full') && created > 0) {
        setLocalNotice(tv(`新建 ${created} 个角色/场景，已进资产库`, `Đã tạo mới ${created} nhân vật/bối cảnh, đã vào thư viện tài sản`))
      }
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('生成失败', 'Tạo thất bại')
      setLocalError(msg)
      onError(msg)
    } finally {
      setLocalJobs((jobs) => { const next = { ...jobs }; delete next[targetEpisode]; return next })
    }
  }

  async function handleConfirmEnter() {
    if (!selected?.episodeNumber) return
    if (editingSection || sceneEditing) {
      setLocalError(tv('请先保存或取消正在编辑的内容，再进入分镜。', 'Vui lòng lưu hoặc hủy nội dung đang chỉnh sửa rồi mới vào phân cảnh.'))
      return
    }
    if (!isSubstantialEpisodeBody(selected.body)) {
      setLocalError(tv(`剧本内容需满 ${MIN_EPISODE_BODY_CHARS} 字后再进入分镜`, `Nội dung kịch bản phải đủ ${MIN_EPISODE_BODY_CHARS} chữ mới vào phân cảnh`))
      return
    }
    setLocalError('')
    setConfirming(true)
    try {
      // 已自动入队/完成 AI 分镜：直接进入编辑页（页内会轮询「AI 分镜中」）
      const rows = await dramaApi.listEpisodes(projectId)
      const existing = rows.find(
        (ep) => Number(ep.params?.episodeNumber) === Number(selected.episodeNumber),
      )
      const planSt = existing ? readPlanStatus(existing) : ''
      if (
        existing &&
        (planSt === 'generating' ||
          planSt === 'completed' ||
          (existing.fragments || []).length > 0)
      ) {
        navigate(`/drama/projects/${projectId}/episodes/${existing.id}`)
        return
      }
      setEnterSkillOpen(true)
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('进入分镜失败', 'Vào phân cảnh thất bại')
      setLocalError(msg)
      onError(msg)
    } finally {
      setConfirming(false)
    }
  }

  // 首次进入：确认剧本 + 按所选 Skill 做 AI 分镜
  async function startEnterWithSkills(skillIds: number[]) {
    if (!selected?.episodeNumber) return
    setEnterSkillOpen(false)
    setConfirming(true)
    setLocalError('')
    try {
      const res = await dramaApi.confirmEpisodeFromScript({
        project_id: projectId,
        episode_number: selected.episodeNumber,
      })
      const episodeId = res.episode.id
      try {
        await dramaApi.planEpisodeFragments(episodeId, {
          force: true,
          fallback_rules: true,
          skill_ids: skillIds,
        })
      } catch (planErr) {
        if (isRequestAborted(planErr)) return
        onError(planErr instanceof Error ? planErr.message : tv('AI 分镜启动失败', 'AI chia phân cảnh khởi động thất bại'))
      }
      navigate(`/drama/projects/${projectId}/episodes/${episodeId}`)
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('进入分镜失败', 'Vào phân cảnh thất bại')
      setLocalError(msg)
      onError(msg)
    } finally {
      setConfirming(false)
    }
  }

  async function handleSaveScenes(nextBody: string) {
    if (!selected?.episodeNumber) return
    setSaving(true)
    setLocalError('')
    try {
      const num = selected.episodeNumber
      const next = displayEpisodes.map((ep) =>
        ep.episodeNumber === num ? { ...ep, body: nextBody, title: titleDraft || ep.title } : ep,
      )
      await saveBodies(next)
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tv('保存失败', 'Lưu thất bại')
      setLocalError(msg)
      onError(msg)
      throw err
    } finally {
      setSaving(false)
    }
  }

  function toggleSection(key: SectionKey) {
    if (key === 'body') {
      setScriptModalOpen(true)
      setOpenSections((prev) => new Set(prev).add('body'))
      return
    }
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startEdit(section: SectionKey) {
    if (!selected) return
    if (sceneEditing) {
      setLocalError(tv('请先保存或取消正在编辑的场次。', 'Vui lòng lưu hoặc hủy phân đoạn đang chỉnh sửa trước.'))
      return
    }
    setEditingSection(section)
    setSectionDraft(
      section === 'creative'
        ? selected.creative || ''
        : section === 'summary'
          ? selected.summary || ''
          : selected.body || '',
    )
    setOpenSections((prev) => new Set(prev).add(section))
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text || '')
    } catch {
      setLocalError(tv('复制失败', 'Sao chép thất bại'))
    }
  }

  const metaTags = useMemo(() => {
    const tags: string[] = []
    if (storyType) tags.push(storyType)
    if (selected?.origin === 'manual') tags.push(tv('手动加集', 'Thêm tập thủ công'))
    else if (selected?.body) tags.push(tv('自动生成', 'Tự động tạo'))
    return tags
  }, [storyType, selected])

  const bodyReady = selectedBodyReady
  const selectedShot = episodeShotStats[selected?.episodeNumber || 0]
  const charHint = selected
    ? [
        selected.summary ? tv(`梗概 ${episodeBodyCharLen(selected.summary)} 字`, `Tóm tắt ${episodeBodyCharLen(selected.summary)} chữ`) : null,
        selected.body ? tv(`剧本 ${episodeBodyCharLen(selected.body)} 字`, `Kịch bản ${episodeBodyCharLen(selected.body)} chữ`) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const directory = (
    <aside className="drama-outline-sidebar">
      <div className="drama-outline-sidebar-head">
        <div>
          <h3>{tv("分集目录", "Mục lục tập")}</h3>
          <p>{tv("共", "Tổng")} {directoryEpisodes.length} {tv("集", "tập")}</p>
        </div>
        {summaryReady ? (
          <button
            type="button"
            className="drama-outline-add-btn"
            disabled={!canAdd}
            onClick={() => void handleAddEpisode()}
          >
            <Plus size={14} strokeWidth={2.5} />
            {adding ? tv('添加中', 'Đang thêm') : tv('加集', 'Thêm tập')}
          </button>
        ) : null}
      </div>
      <ul className="drama-outline-ep-list">
        {directoryEpisodes.map((ep) => {
          const body = displayEpisodes.find((x) => x.episodeNumber === ep.episodeNumber)
          const ready = isSubstantialEpisodeBody(body?.body)
          const active = activeEpisodeNumber === ep.episodeNumber
          const shot = episodeShotStats[ep.episodeNumber || 0]
          const statusLabel = summaryGenerating
            ? tv('全剧摘要生成中…', 'Đang tạo tóm tắt cả phim…')
            : assetsSeeding
              ? tv('抽取资产中…', 'Đang trích xuất tài sản…')
              : shot?.planStatus === 'generating'
                ? tv('AI 分镜中…', 'AI đang chia phân cảnh…')
                : shot?.planStatus === 'failed'
                  ? tv('分镜失败', 'Chia phân cảnh thất bại')
                  : shot?.scriptChanged && shot.fragmentCount > 0
                    ? tv(`${shot.fragmentCount} 镜 · ${formatOutlineShotDuration(shot.totalSec)}（旧稿）`, `${shot.fragmentCount} cảnh · ${formatOutlineShotDuration(shot.totalSec)} (bản cũ)`)
                    : shot?.planStatus === 'completed' &&
                      shot.fragmentCount > 0 &&
                      shot.totalSec > 0
                    ? shot.fragmentCount <= 1 && ready
                      ? tv(`1 镜 · ${formatOutlineShotDuration(shot.totalSec)}（偏少）`, `1 cảnh · ${formatOutlineShotDuration(shot.totalSec)} (hơi ít)`)
                      : tv(`${shot.fragmentCount} 镜 · ${formatOutlineShotDuration(shot.totalSec)}`, `${shot.fragmentCount} cảnh · ${formatOutlineShotDuration(shot.totalSec)}`)
                    : episodeGenerating && !ready && !body?.summary && !body?.creative
                      ? episodeProgress.total > 0
                        ? tv(`整剧进度 ${episodeProgress.done}/${episodeProgress.total}`, `Tiến độ cả phim ${episodeProgress.done}/${episodeProgress.total}`)
                        : tv('等待生成剧本…', 'Đang chờ tạo kịch bản…')
                      : ready
                        ? tv('待 AI 分镜', 'Chờ AI chia phân cảnh')
                        : body?.summary || body?.creative
                          ? tv('待生成剧本', 'Chờ tạo kịch bản')
                          : tv('待填写梗概', 'Chờ nhập tóm tắt')
          return (
            <li key={ep.episodeNumber}>
              <button
                type="button"
                className={`drama-outline-ep-card${active ? ' is-active' : ''}`}
                onClick={() => {
                  onOpenEpisodes()
                  setActiveEpisodeNumber(ep.episodeNumber)
                }}
              >
                <span className="drama-outline-ep-thumb" aria-hidden>
                  {(() => {
                    const cover = episodeCovers[ep.episodeNumber || 0]
                    if (!cover) return ep.episodeNumber
                    if (/\.(mp4|webm|mov)(\?|$)/i.test(cover)) {
                      return <video src={cover} muted playsInline preload="metadata" />
                    }
                    return <img src={cover} alt="" />
                  })()}
                </span>
                <span className="drama-outline-ep-meta">
                  <strong>{tv("第", "Tập")} {ep.episodeNumber} {tv("集", "tập")}</strong>
                  <small>{ep.title || tv('未命名', 'Chưa đặt tên')}</small>
                  <em
                    className={
                      summaryGenerating ||
                      assetsSeeding ||
                      shot?.planStatus === 'generating' ||
                      (episodeGenerating && !ready) ||
                      (ready && shot?.planStatus !== 'completed')
                        ? 'is-waiting'
                        : shot?.planStatus === 'completed' && shot.fragmentCount > 0
                          ? 'is-shot'
                          : undefined
                    }
                  >
                    {statusLabel}
                  </em>
                </span>
                <span className="drama-outline-ep-more" aria-hidden>
                  <MoreHorizontal size={16} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )

  const bodies = !selected ? (
    <div className="drama-outline-detail-empty">
      <p>
        {summaryGenerating
          ? tv('全剧摘要生成中，完成后会抽取资产并生成各集剧本…', 'Đang tạo tóm tắt cả phim, xong sẽ trích xuất tài sản và tạo kịch bản từng tập…')
          : assetsSeeding
            ? tv('正在抽取资产库，随后生成各集剧本…', 'Đang trích xuất thư viện tài sản, sau đó tạo kịch bản từng tập…')
            : summaryReady
              ? tv('暂无分集，请点击「加集」或等待自动生成。', 'Chưa có tập, vui lòng bấm “Thêm tập” hoặc chờ tự động tạo.')
              : tv('请先完成整剧创意与剧本摘要。', 'Vui lòng hoàn tất ý tưởng cả phim và tóm tắt kịch bản trước.')}
      </p>
    </div>
  ) : (
    <section className="drama-outline-detail">
      <header className="drama-outline-detail-head">
        <div className="drama-outline-detail-title">
          {editingSection ? (
            <input
              className="drama-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder={tv("集名", "Tên tập")}
            />
          ) : (
            <h2>
              {tv("第", "Tập")} {selected.episodeNumber} {tv("集", "tập")}
              {selected.title ? `：${selected.title}` : ''}
            </h2>
          )}
          {imageStyleLabel ? <span className="drama-outline-style-badge">{imageStyleLabel}</span> : null}
          <div className="drama-outline-detail-meta">
            {charHint ? <span>{charHint}</span> : <span>{tv("尚未填写本集内容", "Chưa nhập nội dung tập này")}</span>}
            {metaTags.map((tag) => (
              <span key={tag} className="drama-outline-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="drama-outline-detail-actions">
          <span className={`drama-outline-saved${bodyReady && !editingSection && !sceneEditing && !selectedShot?.scriptChanged ? ' is-ready' : ''}`}>
            <Check size={14} strokeWidth={2.5} />
            {editingSection || sceneEditing
              ? tv('编辑未保存', 'Chỉnh sửa chưa lưu')
              : selectedShot?.scriptChanged
                ? tv('分镜待更新', 'Phân cảnh chờ cập nhật')
                : bodyReady
                  ? tv('可进分镜', 'Có thể vào phân cảnh')
                  : saving ? tv('保存中', 'Đang lưu') : tv('已同步', 'Đã đồng bộ')}
          </span>
          {bodyReady && episodeBodyCharLen(selected.summary) < 40 ? (
            <button
              type="button"
              className="drama-btn-ghost"
              disabled={generateBusy}
              onClick={() => void handleGenerate('brief')}
            >
              {selectedGenerating && generatingMode === 'brief' ? tv('提取中…', 'Đang trích xuất…') : tv('提取本集梗概', 'Trích xuất tóm tắt tập này')}
            </button>
          ) : null}
          <button
            type="button"
            className="drama-outline-regen-btn"
            disabled={generateBusy || !canRegenerateEpisode}
            onClick={() => void handleGenerate('full')}
            title={
              batchLocksThisEpisode
                ? tv('本集剧本尚未生成完，请稍候', 'Kịch bản tập này chưa tạo xong, vui lòng chờ')
                : anyEpisodeGenerating
                  ? tv('另有单集生成进行中', 'Có tác vụ tạo một tập khác đang chạy')
                  : undefined
            }
          >
            <RefreshCw size={15} strokeWidth={2.25} />
            {selectedGenerating && generatingMode === 'full' ? tv('生成中…', 'Đang tạo…') : tv('重新生成整集', 'Tạo lại cả tập')}
          </button>
          {selectedShot?.episodeId && !editingSection && !sceneEditing ? (
            <Link className="drama-btn-primary" to={`/drama/projects/${projectId}/episodes/${selectedShot.episodeId}`}>
              {tv("进入分镜", "Vào phân cảnh")}
            </Link>
          ) : (
          <button
            type="button"
            className="drama-btn-primary"
            disabled={enterBusy}
            onClick={() => void handleConfirmEnter()}
            title={!selectedBodyReady ? tv(`剧本内容需满 ${MIN_EPISODE_BODY_CHARS} 字`, `Nội dung kịch bản phải đủ ${MIN_EPISODE_BODY_CHARS} chữ`) : undefined}
          >
            {confirming ? tv('进入中…', 'Đang vào…') : tv('进入分镜', 'Vào phân cảnh')}
          </button>
          )}
        </div>
      </header>

      <div className="drama-outline-status-list">
        {localError ? <DramaErrorNotice message={localError} onDismiss={() => setLocalError('')} /> : null}
        {localNotice ? <DramaStatusNotice tone="success" title={localNotice} onDismiss={() => setLocalNotice('')} /> : null}
        {selectedShot?.scriptChanged ? (
          <DramaStatusNotice tone="warning" title={tv("剧本已更新，分镜待同步", "Kịch bản đã cập nhật, phân cảnh chờ đồng bộ")}>
            {tv("现有分镜仍为旧稿，进入分镜后请重新分镜。", "Phân cảnh hiện có vẫn là bản cũ, sau khi vào phân cảnh hãy chia lại.")}
          </DramaStatusNotice>
        ) : null}
        {summaryGenerating ? (
          <DramaStatusNotice tone="busy" title={tv("正在生成全剧摘要", "Đang tạo tóm tắt cả phim")}>
            {tv("完成后将抽取角色与场景资产，再生成各集剧本。", "Xong sẽ trích xuất tài sản nhân vật và bối cảnh, rồi tạo kịch bản từng tập.")}
          </DramaStatusNotice>
        ) : null}
        {assetsSeeding ? (
          <DramaStatusNotice tone="busy" title={tv("正在抽取角色与场景资产", "Đang trích xuất tài sản nhân vật và bối cảnh")}>
            {tv("写入资产库后，将开始生成分集剧本。", "Sau khi ghi vào thư viện tài sản, sẽ bắt đầu tạo kịch bản các tập.")}
          </DramaStatusNotice>
        ) : null}
        {episodeGenerating ? (
          <DramaStatusNotice tone="busy" title={tv("正在生成分集剧本", "Đang tạo kịch bản các tập")}>
            {episodeProgress.total > 0
              ? tv(`已完成 ${episodeProgress.done} / ${episodeProgress.total} 集，可先浏览已完成的内容。`, `Đã hoàn tất ${episodeProgress.done} / ${episodeProgress.total} tập, có thể xem trước nội dung đã hoàn tất.`)
              : tv('可先浏览已完成的分集内容。', 'Có thể xem trước nội dung các tập đã hoàn tất.')}
          </DramaStatusNotice>
        ) : null}
        {selectedGenerating ? (
          <DramaStatusNotice tone="busy" title={GENERATION_TITLES[generatingMode || ''] || tv('正在生成本集内容', 'Đang tạo nội dung tập này')}>
            {tv("内容生成后将自动更新，请稍候。", "Nội dung tạo xong sẽ tự cập nhật, vui lòng chờ.")}
          </DramaStatusNotice>
        ) : anyEpisodeGenerating && generatingEpisodeNumber ? (
          <DramaStatusNotice tone="busy" title={tv(`第 ${generatingEpisodeNumber} 集正在生成`, `Tập ${generatingEpisodeNumber} đang được tạo`)}>
            {tv("可继续创作当前分集。", "Có thể tiếp tục sáng tạo tập hiện tại.")}
          </DramaStatusNotice>
        ) : null}
        {selected && episodeShotStats[selected.episodeNumber || 0]?.planStatus === 'generating' ? (
          <DramaStatusNotice tone="busy" title={tv("正在生成本集 AI 分镜", "Đang tạo phân cảnh AI của tập này")}>
            {tv("分镜完成后，可进入查看与编辑。", "Phân cảnh xong có thể vào xem và chỉnh sửa.")}
          </DramaStatusNotice>
        ) : null}
        {selected &&
        isSubstantialEpisodeBody(selected.body) &&
        !episodeShotStats[selected.episodeNumber || 0]?.planStatus &&
        !selectedGenerating &&
        !episodeGenerating &&
        !summaryGenerating &&
        !assetsSeeding ? (
          <DramaStatusNotice tone="busy" title={tv("本集剧本已就绪，正在准备 AI 分镜", "Kịch bản tập này đã sẵn sàng, đang chuẩn bị phân cảnh AI")} />
        ) : null}
      </div>

      <div className="drama-outline-sections">
        <SectionCard
          sectionKey="summary"
          icon={<BookOpen size={18} strokeWidth={1.9} />}
          title={tv("本集梗概", "Tóm tắt tập này")}
          subtitle={tv("本集人物、冲突、转折与结局；生成拍摄剧本的主要依据", "Nhân vật, xung đột, bước ngoặt và kết cục của tập này; căn cứ chính để tạo kịch bản quay")}
          text={selected.summary || ''}
          editing={editingSection === 'summary'}
          draft={sectionDraft}
          open={openSections.has('summary')}
          busy={busy}
          generateBusy={generateBusy}
          placeholder={tv("填写本集梗概（至少 40 字），再生成拍摄剧本", "Nhập tóm tắt tập này (tối thiểu 40 chữ) rồi tạo kịch bản quay")}
          regenerateLabel={
            selectedGenerating && generatingMode === 'brief'
              ? tv('提取中…', 'Đang trích xuất…')
              : selectedGenerating && generatingMode === 'summary'
                ? tv('生成中…', 'Đang tạo…')
                : summaryGenerateMode === 'brief'
                  ? tv('从剧本提取', 'Trích từ kịch bản')
                  : tv('从备注生成', 'Tạo từ ghi chú')
          }
          onToggle={() => toggleSection('summary')}
          onEdit={() => startEdit('summary')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('summary')}
          onDraftChange={setSectionDraft}
          onRegenerate={summaryGenerateMode ? () => void handleGenerate(summaryGenerateMode) : undefined}
          onCopy={() => void copyText(selected.summary || '')}
        />
        <SectionCard
          sectionKey="body"
          icon={<FileText size={18} strokeWidth={1.9} />}
          title={tv("拍摄剧本", "Kịch bản quay")}
          subtitle={tv("含对白与画面描述的拍摄正文（按场次解析，可分段编辑）", "Nội dung quay gồm thoại và mô tả hình ảnh (phân tích theo hồi cảnh, có thể chỉnh sửa theo đoạn)")}
          text={selected.body || ''}
          editing={editingSection === 'body'}
          draft={sectionDraft}
          open={openSections.has('body')}
          busy={busy}
          generateBusy={generateBusy || !canGenerateBody}
          placeholder={tv(`拍摄剧本正文（进入分镜需满 ${MIN_EPISODE_BODY_CHARS} 字）`, `Nội dung kịch bản quay (vào phân cảnh cần đủ ${MIN_EPISODE_BODY_CHARS} chữ)`)}
          regenerateLabel={selectedGenerating && generatingMode === 'body' ? tv('生成中…', 'Đang tạo…') : tv('生成剧本', 'Tạo kịch bản')}
          onToggle={() => toggleSection('body')}
          onEdit={() => startEdit('body')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('body')}
          onDraftChange={setSectionDraft}
          onRegenerate={() => void handleGenerate('body')}
          onCopy={() => void copyText(selected.body || '')}
          scriptPreview={
            <OutlineScriptPreview
              key={selected.episodeNumber}
              text={selected.body || ''}
              empty={tv(`拍摄剧本正文（进入分镜需满 ${MIN_EPISODE_BODY_CHARS} 字）`, `Nội dung kịch bản quay (vào phân cảnh cần đủ ${MIN_EPISODE_BODY_CHARS} chữ)`)}
              busy={busy}
              shotStats={episodeShotStats[selected.episodeNumber || 0] || null}
              onSaveScenes={handleSaveScenes}
              onEditingChange={setSceneEditing}
            />
          }
        />
        <SectionCard
          sectionKey="creative"
          icon={<Lightbulb size={18} strokeWidth={1.9} />}
          title={tv("创作备注（可选）", "Ghi chú sáng tạo (tùy chọn)")}
          subtitle={tv("补充创作方向或保留早期创意；已有梗概时无需填写", "Bổ sung hướng sáng tạo hoặc giữ ý tưởng ban đầu; đã có tóm tắt thì không cần nhập")}
          text={selected.creative || ''}
          editing={editingSection === 'creative'}
          draft={sectionDraft}
          open={openSections.has('creative')}
          busy={busy}
          placeholder={tv("可选：补充人物动机、创作方向或特别要求", "Tùy chọn: bổ sung động cơ nhân vật, hướng sáng tạo hoặc yêu cầu đặc biệt")}
          regenerateLabel={tv("生成梗概", "Tạo tóm tắt")}
          onToggle={() => toggleSection('creative')}
          onEdit={() => startEdit('creative')}
          onCancel={() => setEditingSection(null)}
          onSave={() => void handleSaveSection('creative')}
          onDraftChange={setSectionDraft}
          onCopy={() => void copyText(selected.creative || '')}
        />
      </div>
      <OutlineScriptParseModal
        open={scriptModalOpen}
        onClose={() => setScriptModalOpen(false)}
        title={tv(`第 ${selected.episodeNumber} 集 · 剧本解析`, `Tập ${selected.episodeNumber} · Phân tích kịch bản`)}
        text={selected.body || ''}
      />
    </section>
  )

  const editableBodies = <TeamEditingBoundary projectId={projectId} type="episode" resourceId={selected?.episodeNumber || 0} enabled={Boolean(selected)} showReadOnlyNotice={false} allowReadOnlyNavigation onAcquired={async (isCurrent) => { const fresh = await dramaApi.getScript(projectId); if (isCurrent()) onScriptChange(fresh) }}>{bodies}</TeamEditingBoundary>

  if (children) {
    return (
      <>
        {children({ directory, bodies: editableBodies })}
        <FragmentPlanSkillModal
          open={enterSkillOpen}
          title={tv("进入分镜", "Vào phân cảnh")}
          message={tv("将确认本集剧本并切分分镜。可勾选本次使用的 Skill；确认后会覆盖该集已有分镜与已生成镜头（若有）。", "Sẽ xác nhận kịch bản tập này và chia phân cảnh. Có thể tích chọn Skill dùng lần này; sau khi xác nhận sẽ ghi đè phân cảnh hiện có của tập và các cảnh đã tạo (nếu có).")}
          confirmText={confirming ? tv('进入中…', 'Đang vào…') : tv('开始分镜', 'Bắt đầu chia phân cảnh')}
          onCancel={() => {
            if (!confirming) setEnterSkillOpen(false)
          }}
          onConfirm={(skillIds) => void startEnterWithSkills(skillIds)}
        />
      </>
    )
  }
  return (
    <div className="drama-outline drama-outline-v2">
      {directory}
      <div className="drama-outline-main">{editableBodies}</div>
      <FragmentPlanSkillModal
        open={enterSkillOpen}
        title={tv("进入分镜", "Vào phân cảnh")}
        message={tv("将确认本集剧本并切分分镜。可勾选本次使用的 Skill；确认后会覆盖该集已有分镜与已生成镜头（若有）。", "Sẽ xác nhận kịch bản tập này và chia phân cảnh. Có thể tích chọn Skill dùng lần này; sau khi xác nhận sẽ ghi đè phân cảnh hiện có của tập và các cảnh đã tạo (nếu có).")}
        confirmText={confirming ? tv('进入中…', 'Đang vào…') : tv('开始分镜', 'Bắt đầu chia phân cảnh')}
        onCancel={() => {
          if (!confirming) setEnterSkillOpen(false)
        }}
        onConfirm={(skillIds) => void startEnterWithSkills(skillIds)}
      />
    </div>
  )
}
