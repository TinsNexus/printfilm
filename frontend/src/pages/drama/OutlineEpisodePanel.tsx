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
import { tr } from '../../i18n/translate.ts'

type SectionKey = 'creative' | 'summary' | 'body'

const GENERATION_TITLES: Record<string, string> = {
  creative: tr('outlineEpisodePanel.generatingCreativeDirectionEpisode'),
  summary: tr('outlineEpisodePanel.generatingEpisodeSSynopsis'),
  brief: tr('outlineEpisodePanel.extractingEpisodeSSynopsis'),
  body: tr('outlineEpisodePanel.generatingShootingScript'),
  full: tr('outlineEpisodePanel.regeneratingWholeEpisode'),
}

/** 分集目录用的镜头合计文案 */
function formatOutlineShotDuration(sec: number): string {
  if (sec <= 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? tr('outlineEpisodePanel.minS', { m, s }) : tr('outlineEpisodePanel.min', { m })
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
            {tr('outlineEpisodePanel.edit')}
          </button>
          {onRegenerate ? (
            <button type="button" className="drama-outline-text-btn" disabled={genBusy} onClick={onRegenerate}>
              <RefreshCw size={14} strokeWidth={2} />
              {regenerateLabel}
            </button>
          ) : null}
          <button type="button" className="drama-outline-text-btn" onClick={onCopy}>
            <Copy size={14} strokeWidth={2} />
            {tr('outlineEpisodePanel.copy')}
          </button>
          <button
            type="button"
            className="drama-outline-text-btn drama-outline-text-btn-icon"
            onClick={onToggle}
            aria-label={sectionKey === 'body' ? tr('outlineEpisodePanel.breakdownDialog') : open ? tr('outlineEpisodePanel.collapse') : tr('outlineEpisodePanel.expand')}
          >
            {sectionKey === 'body' ? (
              <Maximize2 size={14} strokeWidth={2} />
            ) : open ? (
              <ChevronUp size={14} strokeWidth={2} />
            ) : (
              <ChevronDown size={14} strokeWidth={2} />
            )}
            {sectionKey === 'body' ? tr('outlineEpisodePanel.breakdownPreview') : open ? tr('outlineEpisodePanel.collapse') : tr('outlineEpisodePanel.expand')}
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
                  {tr('outlineEpisodePanel.cancel')}
                </button>
                <button type="button" className="drama-btn-primary" disabled={busy} onClick={onSave}>
                  {tr('outlineEpisodePanel.save')}
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
      catch (err) { if (isRequestAborted(err)) throw err; lastErr = err instanceof Error ? err : new Error(tr('outlineEpisodePanel.pollingFailed')); continue }
      onScriptChange(cur)
      lastErr = null
      const job = readEpisodeJob(cur, tokenEpisode)
      if (job.status === 'completed') return cur
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error || tr('outlineEpisodePanel.episodeFailedWasCancelled'))

    }
    throw lastErr || new Error(tr('outlineEpisodePanel.generationTimedOutRefreshLater'))
  }

  async function saveBodies(nextBodies: DramaEpisodeBody[]) {
    if (!selected?.episodeNumber) throw new Error(tr('outlineEpisodePanel.selectEpisodeFirst'))
    const current = nextBodies.find((item) => item.episodeNumber === selected.episodeNumber)
    if (!current) throw new Error(tr('outlineEpisodePanel.episodeNotFoundPleaseRefresh'))
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
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.failedAddEpisode')
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
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.saveFailed')
      setLocalError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate(mode: 'summary' | 'body' | 'full' | 'brief') {
    if (!selected?.episodeNumber) return
    if (editingSection || sceneEditing) {
      setLocalError(tr('outlineEpisodePanel.saveCancelEditsBeforeGenerating'))
      return
    }
    const creative = selected.creative || ''
    const summary = selected.summary || ''
    if (mode === 'summary' && !isSubstantialEpisodeCreative(creative)) {
      setLocalError(tr('outlineEpisodePanel.creativeNotesSynopsisNeedLeast', { MIN_EPISODE_CREATIVE_CHARS }))
      return
    }
    if (mode === 'full' && !isSubstantialEpisodeCreative(creative) && episodeBodyCharLen(summary) < 40) {
      setLocalError(tr('outlineEpisodePanel.enterSynopsisLeast40Characters', { MIN_EPISODE_CREATIVE_CHARS }))
      return
    }
    // 与后端 run_episode_body_from_brief 一致：创意≥10 或摘要≥40
    if (mode === 'body' && episodeBodyCharLen(creative) < 10 && episodeBodyCharLen(summary) < 40) {
      setLocalError(tr('outlineEpisodePanel.enterEpisodeSSynopsisBefore'))
      return
    }
    if (mode === 'brief' && !isSubstantialEpisodeBody(selected.body)) {
      setLocalError(tr('outlineEpisodePanel.shootingScriptNeedsCharactersBefore', { MIN_EPISODE_BODY_CHARS }))
      return
    }
    if (mode === 'full') {
      const ok = await dialog.confirm({
        title: tr('outlineEpisodePanel.regenerateEpisode'),
        message:
          tr('outlineEpisodePanel.shootingScriptWillRewrittenEpisode'),
        confirmText: tr('outlineEpisodePanel.regenerate'),
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
        setLocalNotice(tr('outlineEpisodePanel.createdCharactersScenesAssetLibrary', { created }))
      }
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.generationFailed')
      setLocalError(msg)
      onError(msg)
    } finally {
      setLocalJobs((jobs) => { const next = { ...jobs }; delete next[targetEpisode]; return next })
    }
  }

  async function handleConfirmEnter() {
    if (!selected?.episodeNumber) return
    if (editingSection || sceneEditing) {
      setLocalError(tr('outlineEpisodePanel.saveCancelEditsBeforeOpening'))
      return
    }
    if (!isSubstantialEpisodeBody(selected.body)) {
      setLocalError(tr('outlineEpisodePanel.scriptNeedsCharactersBeforeCan', { MIN_EPISODE_BODY_CHARS }))
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
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.failedOpenShots')
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
        onError(planErr instanceof Error ? planErr.message : tr('outlineEpisodePanel.aiShotSplitFailedStart'))
      }
      navigate(`/drama/projects/${projectId}/episodes/${episodeId}`)
    } catch (err) {
      if (isRequestAborted(err)) return
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.failedOpenShots')
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
      const msg = err instanceof Error ? err.message : tr('outlineEpisodePanel.saveFailed')
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
      setLocalError(tr('outlineEpisodePanel.saveCancelSceneEditingFirst'))
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
      setLocalError(tr('outlineEpisodePanel.copyFailed'))
    }
  }

  const metaTags = useMemo(() => {
    const tags: string[] = []
    if (storyType) tags.push(storyType)
    if (selected?.origin === 'manual') tags.push(tr('outlineEpisodePanel.addEpisodeManually'))
    else if (selected?.body) tags.push(tr('outlineEpisodePanel.autoGenerate'))
    return tags
  }, [storyType, selected])

  const bodyReady = selectedBodyReady
  const selectedShot = episodeShotStats[selected?.episodeNumber || 0]
  const charHint = selected
    ? [
        selected.summary ? tr('outlineEpisodePanel.synopsisCharacters', { episodeBodyCharLen: episodeBodyCharLen(selected.summary) }) : null,
        selected.body ? tr('outlineEpisodePanel.scriptCharacters', { episodeBodyCharLen: episodeBodyCharLen(selected.body) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const directory = (
    <aside className="drama-outline-sidebar">
      <div className="drama-outline-sidebar-head">
        <div>
          <h3>{tr('outlineEpisodePanel.episodes')}</h3>
          <p>{tr('outlineEpisodePanel.total')} {directoryEpisodes.length} {tr('outlineEpisodePanel.episodes2')}</p>
        </div>
        {summaryReady ? (
          <button
            type="button"
            className="drama-outline-add-btn"
            disabled={!canAdd}
            onClick={() => void handleAddEpisode()}
          >
            <Plus size={14} strokeWidth={2.5} />
            {adding ? tr('outlineEpisodePanel.adding') : tr('outlineEpisodePanel.addEpisode')}
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
            ? tr('outlineEpisodePanel.generatingDramaSummary')
            : assetsSeeding
              ? tr('outlineEpisodePanel.extractingAssets')
              : shot?.planStatus === 'generating'
                ? tr('outlineEpisodePanel.aiSplittingShots')
                : shot?.planStatus === 'failed'
                  ? tr('outlineEpisodePanel.shotSplitFailed')
                  : shot?.scriptChanged && shot.fragmentCount > 0
                    ? tr('outlineEpisodePanel.shotsPreviousDraft', { fragmentCount: shot.fragmentCount, formatOutlineShotDuration: formatOutlineShotDuration(shot.totalSec) })
                    : shot?.planStatus === 'completed' &&
                      shot.fragmentCount > 0 &&
                      shot.totalSec > 0
                    ? shot.fragmentCount <= 1 && ready
                      ? tr('outlineEpisodePanel.n1ShotFew', { formatOutlineShotDuration: formatOutlineShotDuration(shot.totalSec) })
                      : tr('outlineEpisodePanel.shots', { fragmentCount: shot.fragmentCount, formatOutlineShotDuration: formatOutlineShotDuration(shot.totalSec) })
                    : episodeGenerating && !ready && !body?.summary && !body?.creative
                      ? episodeProgress.total > 0
                        ? tr('outlineEpisodePanel.dramaProgress', { done: episodeProgress.done, total: episodeProgress.total })
                        : tr('outlineEpisodePanel.waitingScript')
                      : ready
                        ? tr('outlineEpisodePanel.waitingAiSplit')
                        : body?.summary || body?.creative
                          ? tr('outlineEpisodePanel.scriptPending')
                          : tr('outlineEpisodePanel.synopsisNeeded')
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
                  <strong>{tr('outlineEpisodePanel.episode', { episodeNumber: ep.episodeNumber })}</strong>
                  <small>{ep.title || tr('outlineEpisodePanel.untitled')}</small>
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
          ? tr('outlineEpisodePanel.generatingDramaSummaryAssetsExtracted')
          : assetsSeeding
            ? tr('outlineEpisodePanel.extractingAssetsThenGeneratingEpisode')
            : summaryReady
              ? tr('outlineEpisodePanel.noEpisodesYetClickAdd')
              : tr('outlineEpisodePanel.finishDramaConceptScriptSummary')}
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
              placeholder={tr('outlineEpisodePanel.episodeTitle')}
            />
          ) : (
            <h2>
              {tr('outlineEpisodePanel.episode', { episodeNumber: selected.episodeNumber })}
              {selected.title ? `：${selected.title}` : ''}
            </h2>
          )}
          {imageStyleLabel ? <span className="drama-outline-style-badge">{imageStyleLabel}</span> : null}
          <div className="drama-outline-detail-meta">
            {charHint ? <span>{charHint}</span> : <span>{tr('outlineEpisodePanel.noContentEpisodeYet')}</span>}
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
              ? tr('outlineEpisodePanel.unsavedEdits')
              : selectedShot?.scriptChanged
                ? tr('outlineEpisodePanel.shotsNeedUpdating')
                : bodyReady
                  ? tr('outlineEpisodePanel.readyShots')
                  : saving ? tr('outlineEpisodePanel.saving') : tr('outlineEpisodePanel.synced')}
          </span>
          {bodyReady && episodeBodyCharLen(selected.summary) < 40 ? (
            <button
              type="button"
              className="drama-btn-ghost"
              disabled={generateBusy}
              onClick={() => void handleGenerate('brief')}
            >
              {selectedGenerating && generatingMode === 'brief' ? tr('outlineEpisodePanel.extracting') : tr('outlineEpisodePanel.extractSynopsis')}
            </button>
          ) : null}
          <button
            type="button"
            className="drama-outline-regen-btn"
            disabled={generateBusy || !canRegenerateEpisode}
            onClick={() => void handleGenerate('full')}
            title={
              batchLocksThisEpisode
                ? tr('outlineEpisodePanel.episodeSScriptStillGenerating')
                : anyEpisodeGenerating
                  ? tr('outlineEpisodePanel.anotherEpisodeGenerating')
                  : undefined
            }
          >
            <RefreshCw size={15} strokeWidth={2.25} />
            {selectedGenerating && generatingMode === 'full' ? tr('outlineEpisodePanel.generating') : tr('outlineEpisodePanel.regenerateEpisode')}
          </button>
          {selectedShot?.episodeId && !editingSection && !sceneEditing ? (
            <Link className="drama-btn-primary" to={`/drama/projects/${projectId}/episodes/${selectedShot.episodeId}`}>
              {tr('outlineEpisodePanel.openShots')}
            </Link>
          ) : (
          <button
            type="button"
            className="drama-btn-primary"
            disabled={enterBusy}
            onClick={() => void handleConfirmEnter()}
            title={!selectedBodyReady ? tr('outlineEpisodePanel.scriptNeedsCharacters', { MIN_EPISODE_BODY_CHARS }) : undefined}
          >
            {confirming ? tr('outlineEpisodePanel.opening') : tr('outlineEpisodePanel.openShots')}
          </button>
          )}
        </div>
      </header>

      <div className="drama-outline-status-list">
        {localError ? <DramaErrorNotice message={localError} onDismiss={() => setLocalError('')} /> : null}
        {localNotice ? <DramaStatusNotice tone="success" title={localNotice} onDismiss={() => setLocalNotice('')} /> : null}
        {selectedShot?.scriptChanged ? (
          <DramaStatusNotice tone="warning" title={tr('outlineEpisodePanel.scriptUpdatedShotsNeedSyncing')}>
            {tr('outlineEpisodePanel.existingShotsPreviousDraftRe')}
          </DramaStatusNotice>
        ) : null}
        {summaryGenerating ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.generatingDramaSummary2')}>
            {tr('outlineEpisodePanel.characterSceneAssetsExtractedNext')}
          </DramaStatusNotice>
        ) : null}
        {assetsSeeding ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.extractingCharacterSceneAssets')}>
            {tr('outlineEpisodePanel.episodeScriptsStartOnceAsset')}
          </DramaStatusNotice>
        ) : null}
        {episodeGenerating ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.generatingEpisodeScripts')}>
            {episodeProgress.total > 0
              ? tr('outlineEpisodePanel.episodesDoneCanBrowseFinished', { done: episodeProgress.done, total: episodeProgress.total })
              : tr('outlineEpisodePanel.canBrowseFinishedEpisodes')}
          </DramaStatusNotice>
        ) : null}
        {selectedGenerating ? (
          <DramaStatusNotice tone="busy" title={GENERATION_TITLES[generatingMode || ''] || tr('outlineEpisodePanel.generatingEpisode')}>
            {tr('outlineEpisodePanel.contentUpdatesAutomaticallyWhenReady')}
          </DramaStatusNotice>
        ) : anyEpisodeGenerating && generatingEpisodeNumber ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.episodeGenerating', { generatingEpisodeNumber })}>
            {tr('outlineEpisodePanel.canKeepWorkingEpisode')}
          </DramaStatusNotice>
        ) : null}
        {selected && episodeShotStats[selected.episodeNumber || 0]?.planStatus === 'generating' ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.generatingAiShotsEpisode')}>
            {tr('outlineEpisodePanel.whenShotsReadyCanOpen')}
          </DramaStatusNotice>
        ) : null}
        {selected &&
        isSubstantialEpisodeBody(selected.body) &&
        !episodeShotStats[selected.episodeNumber || 0]?.planStatus &&
        !selectedGenerating &&
        !episodeGenerating &&
        !summaryGenerating &&
        !assetsSeeding ? (
          <DramaStatusNotice tone="busy" title={tr('outlineEpisodePanel.scriptReadyPreparingAiShots')} />
        ) : null}
      </div>

      <div className="drama-outline-sections">
        <SectionCard
          sectionKey="summary"
          icon={<BookOpen size={18} strokeWidth={1.9} />}
          title={tr('outlineEpisodePanel.episodeSynopsis')}
          subtitle={tr('outlineEpisodePanel.episodeSCharactersConflictTurns')}
          text={selected.summary || ''}
          editing={editingSection === 'summary'}
          draft={sectionDraft}
          open={openSections.has('summary')}
          busy={busy}
          generateBusy={generateBusy}
          placeholder={tr('outlineEpisodePanel.writeEpisodeSynopsisLeast40')}
          regenerateLabel={
            selectedGenerating && generatingMode === 'brief'
              ? tr('outlineEpisodePanel.extracting')
              : selectedGenerating && generatingMode === 'summary'
                ? tr('outlineEpisodePanel.generating')
                : summaryGenerateMode === 'brief'
                  ? tr('outlineEpisodePanel.extractScript')
                  : tr('outlineEpisodePanel.generateNotes')
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
          title={tr('outlineEpisodePanel.shootingScript')}
          subtitle={tr('outlineEpisodePanel.scriptDialogueVisualDescriptionsParsed')}
          text={selected.body || ''}
          editing={editingSection === 'body'}
          draft={sectionDraft}
          open={openSections.has('body')}
          busy={busy}
          generateBusy={generateBusy || !canGenerateBody}
          placeholder={tr('outlineEpisodePanel.shootingScriptNeedsCharactersOpen', { MIN_EPISODE_BODY_CHARS })}
          regenerateLabel={selectedGenerating && generatingMode === 'body' ? tr('outlineEpisodePanel.generating') : tr('outlineEpisodePanel.generateScript')}
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
              empty={tr('outlineEpisodePanel.shootingScriptNeedsCharactersOpen', { MIN_EPISODE_BODY_CHARS })}
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
          title={tr('outlineEpisodePanel.creativeNotesOptional')}
          subtitle={tr('outlineEpisodePanel.addCreativeDirectionKeepEarly')}
          text={selected.creative || ''}
          editing={editingSection === 'creative'}
          draft={sectionDraft}
          open={openSections.has('creative')}
          busy={busy}
          placeholder={tr('outlineEpisodePanel.optionalCharacterMotivationsCreativeDirection')}
          regenerateLabel={tr('outlineEpisodePanel.generateSynopsis')}
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
        title={tr('outlineEpisodePanel.episodeScriptBreakdown', { episodeNumber: selected.episodeNumber })}
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
          title={tr('outlineEpisodePanel.openShots')}
          message={tr('outlineEpisodePanel.confirmsEpisodeScriptSplitsInto')}
          confirmText={confirming ? tr('outlineEpisodePanel.opening') : tr('outlineEpisodePanel.splitIntoShots')}
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
        title={tr('outlineEpisodePanel.openShots')}
        message={tr('outlineEpisodePanel.confirmsEpisodeScriptSplitsInto')}
        confirmText={confirming ? tr('outlineEpisodePanel.opening') : tr('outlineEpisodePanel.splitIntoShots')}
        onCancel={() => {
          if (!confirming) setEnterSkillOpen(false)
        }}
        onConfirm={(skillIds) => void startEnterWithSkills(skillIds)}
      />
    </div>
  )
}
