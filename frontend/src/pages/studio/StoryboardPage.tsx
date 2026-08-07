import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Project, Shot, Template } from '../../api'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import ComingSoon from '../../components/ui/ComingSoon'
import {
  IconChevronLeft,
  IconDownload,
  IconEdit,
  IconImage,
  IconMonitor,
  IconPlay,
  IconRefresh,
  IconSliders,
  IconTrash,
} from '../../components/ui/Icons'
import { scenePromptForDisplay } from '../../promptDisplay'
import { dialog } from '../../lib/dialog'
import {
  BOARD_STEPS,
  effectiveStatus,
  formatMmSs,
  isRunning,
  shotIsDone,
  shotStatusLabel,
  statusLabel,
} from '../../lib/status'

function csvEscape(value: string | number | null | undefined) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadStoryboardCsv(project: Project) {
  const header = ['镜号', '旁白', '画面描述', '时长秒', '状态', '镜头标题']
  const rows = (project.shots || [])
    .slice()
    .sort((a, b) => a.shot_no - b.shot_no)
    .map((s) =>
      [
        s.shot_no,
        s.narration,
        scenePromptForDisplay(s.img_prompt || s.video_prompt || ''),
        s.duration,
        shotStatusLabel(s.status),
        s.overlay_title || '',
      ]
        .map(csvEscape)
        .join(','),
    )
  const bom = '\uFEFF'
  const blob = new Blob([bom + [header.join(','), ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${project.title || `project_${project.id}`}_storyboard.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

type PreviewState =
  | {
      kind: 'shot'
      shotNo: number
      imageUrl: string | null
      videoUrl: string | null
      audioUrl: string | null
      caption: string
    }
  | { kind: 'final'; url: string; title: string; bust?: string }
  | null

function shotCaption(shot: Shot) {
  if (shot.overlay_title) {
    return `${shot.overlay_title}${
      shot.overlay_subtitle ? ` · ${shot.overlay_subtitle}` : ''
    }${shot.narration ? `｜旁白：${shot.narration}` : ''}`
  }
  return shot.narration
}

function boardStepIndex(project: Project) {
  const status = project.status
  if (status === 'DRAFT') return 0
  if (status === 'SCRIPTING') return 1
  // 分镜已出，停留在「生成分镜」供确认修改
  if (status === 'SCRIPT_READY') return 3
  // 成片阶段：合成中 / 已完成；或素材已齐、等待合成
  if (['COMPOSING', 'AUDITING', 'DONE'].includes(status)) return 4
  if (status === 'VIDEO_READY') return 4
  if (status === 'IMAGE_READY' && project.pipeline_mode === 'image_text') return 4
  if (status === 'FAILED' || status === 'CANCELLED') {
    return project.final_video_url ? 4 : 3
  }
  // IMAGING / VIDEOING / AUDIOING / IMAGE_READY(full) 等仍在分镜生成
  return 3
}

export default function StoryboardPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Shot | null>(null)
  const [editFocus, setEditFocus] = useState<string>('')
  const [promptEdit, setPromptEdit] = useState<{
    style_prompt: string
    character_prompt: string
    extra_prompt: string
  } | null>(null)
  const [preview, setPreview] = useState<PreviewState>(null)
  const [menuShotId, setMenuShotId] = useState<number | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSelected, setBatchSelected] = useState<number[]>([])
  const [batchDuration, setBatchDuration] = useState('')
  const [batchRegenAudio, setBatchRegenAudio] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
      return
    }
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        return api.templates().then((list) => {
          setTemplate(list.find((t) => t.id === p.template_id) || null)
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [nav, projectId])

  useEffect(() => {
    if (!project) return
    // Only poll while pipeline is actively running — idle checkpoints
    // (IMAGE_READY / VIDEO_READY / SCRIPT_READY) must not spin forever.
    if (!isRunning(project.status)) return
    const timer = setInterval(() => {
      api
        .getProject(project.id)
        .then(setProject)
        .catch(() => undefined)
    }, 1500)
    return () => clearInterval(timer)
  }, [project?.id, project?.status])

  useEffect(() => {
    if (menuShotId == null) return
    function onDoc() {
      setMenuShotId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [menuShotId])

  const running = Boolean(project && isRunning(project.status))
  const step = project ? boardStepIndex(project) : 3
  const totalDuration = useMemo(
    () => (project?.shots || []).reduce((s, x) => s + (Number(x.duration) || 0), 0),
    [project?.shots],
  )

  const shots = project?.shots || []
  const isFullPipeline = project?.pipeline_mode !== 'image_text'
  const imgDone = shots.filter((s) => s.image_url).length
  const audDone = shots.filter((s) => s.audio_url).length
  const vidDone = shots.filter((s) => s.video_url).length
  const assetsReady =
    shots.length > 0 && imgDone === shots.length && audDone === shots.length
  /**
   * Full pipeline: need AI videos before compose.
   * VIDEO_READY+ means video stage finished (incl. privacy skips without video_url).
   * image_text skips the video stage entirely.
   */
  const videosReady =
    !isFullPipeline ||
    ['VIDEO_READY', 'COMPOSING', 'AUDITING', 'DONE'].includes(project?.status || '') ||
    (shots.length > 0 && vidDone === shots.length)
  const readyToCompose = assetsReady && videosReady
  const needsVideos = isFullPipeline && assetsReady && !videosReady
  const needsScriptConfirm =
    Boolean(project) &&
    shots.length > 0 &&
    !assetsReady &&
    ['SCRIPT_READY', 'DRAFT', 'CANCELLED', 'FAILED'].includes(project!.status)
  const hasFinal = Boolean(project?.final_video_url)
  /** Primary CTA: confirm script → generate → (videos) → compose → preview */
  const primaryAction: 'generate' | 'compose' | 'preview' | 'busy' = running
    ? 'busy'
    : hasFinal || project?.status === 'DONE'
      ? 'preview'
      : readyToCompose
        ? 'compose'
        : 'generate'

  const generateLabel = running
    ? '生成中…'
    : needsScriptConfirm
      ? '确认分镜，开始生成'
      : needsVideos
        ? '继续生成视频'
        : '继续生成'

  const progressItems = useMemo(() => {
    if (!project) return []
    const list = project.shots || []
    const imgs = list.filter((s) => s.image_url).length
    const auds = list.filter((s) => s.audio_url).length
    const vids = list.filter((s) => s.video_url).length
    const full = project.pipeline_mode !== 'image_text'
    const stage = effectiveStatus(project)
    type ProgressItem = { label: string; done: boolean; run?: boolean; pct?: number }
    const items: ProgressItem[] = [
      { label: '主题解析', done: true },
      { label: '分镜脚本', done: list.length > 0 || !['DRAFT', 'SCRIPTING'].includes(project.status) },
      {
        label: `画面生成 (${imgs}/${list.length || 0})`,
        done: list.length > 0 && imgs === list.length,
      },
      {
        label: `配音合成 (${auds}/${list.length || 0})`,
        done: list.length > 0 && auds === list.length,
      },
    ]
    if (full) {
      items.push({
        label: `AI 视频 (${vids}/${list.length || 0})`,
        done:
          list.length > 0 &&
          (vids === list.length ||
            ['VIDEO_READY', 'COMPOSING', 'AUDITING', 'DONE'].includes(stage)),
        run: stage === 'VIDEOING',
        pct: stage === 'VIDEOING' ? project.progress : undefined,
      })
    }
    items.push({
      label: '成片渲染',
      done: Boolean(project.final_video_url) || project.status === 'DONE',
      run: stage === 'COMPOSING',
      pct: stage === 'COMPOSING' ? project.progress : undefined,
    })
    return items
  }, [project])

  function openFinalPreview() {
    if (!project?.final_video_url) return
    setPreview({
      kind: 'final',
      url: api.assetUrl(project.final_video_url, project.updated_at),
      title: project.title,
      bust: project.updated_at,
    })
  }

  async function continueGenerate() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.generate(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '继续生成失败')
    } finally {
      setBusy(false)
    }
  }

  async function restartGenerate() {
    if (!project) return
    const ok = await dialog.confirm({
      title: '推倒重做',
      message: '将清空当前分镜与素材，重新拆分镜（生成后仍可先确认再继续）。',
      confirmText: '确认重做',
      cancelText: '再想想',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.generate(project.id, { restart: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '重做失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject() {
    if (!project) return
    const ok = await dialog.confirm({
      title: '删除项目',
      message: '确定删除该项目？素材与成片将一并清除，此操作不可恢复。',
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteProject(project.id)
      nav('/history')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function composeOnly() {
    if (!project) return
    setBusy(true)
    try {
      setProject(await api.compose(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '合成失败')
    } finally {
      setBusy(false)
    }
  }

  async function onCoverFile(file: File | null) {
    if (!project || !file) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.uploadCover(project.id, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : '封面上传失败')
    } finally {
      setBusy(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function useFirstShotCover() {
    if (!project) return
    const first = [...(project.shots || [])]
      .sort((a, b) => a.shot_no - b.shot_no)
      .find((s) => s.image_url)
    if (!first?.image_url) {
      setError('暂无可用镜头画面')
      return
    }
    setBusy(true)
    setError('')
    try {
      setProject(await api.updateProject(project.id, { cover_url: first.image_url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置封面失败')
    } finally {
      setBusy(false)
    }
  }

  function openBatchAdjust() {
    if (!project) return
    setBatchSelected((project.shots || []).map((s) => s.id))
    setBatchDuration('')
    setBatchRegenAudio(false)
    setBatchOpen(true)
  }

  async function applyBatchAdjust() {
    if (!project || batchSelected.length === 0) return
    const durationVal = batchDuration.trim() === '' ? null : Number(batchDuration)
    if (durationVal != null && (!Number.isFinite(durationVal) || durationVal <= 0)) {
      setError('请输入有效时长（秒）')
      return
    }
    if (durationVal == null && !batchRegenAudio) {
      setError('请设置时长，或勾选重配音')
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const shotId of batchSelected) {
        if (durationVal != null) {
          await api.updateShot(project.id, shotId, { duration: durationVal })
        }
        if (batchRegenAudio) {
          await api.regenAudio(project.id, shotId)
        }
      }
      setProject(await api.getProject(project.id))
      setBatchOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量调整失败')
      try {
        setProject(await api.getProject(project.id))
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!project) return
    setBusy(true)
    try {
      await api.publish(project.id)
      nav('/history')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败')
    } finally {
      setBusy(false)
    }
  }

  async function regenImage(shot: Shot) {
    if (!project) return
    setBusy(true)
    try {
      await api.regenImage(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '重绘失败')
    } finally {
      setBusy(false)
    }
  }

  async function regenVideo(shot: Shot) {
    if (!project) return
    setBusy(true)
    try {
      await api.regenVideo(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '重生视频失败')
    } finally {
      setBusy(false)
    }
  }

  async function regenAudio(shot: Shot) {
    if (!project) return
    setBusy(true)
    try {
      await api.regenAudio(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '重配音失败')
    } finally {
      setBusy(false)
    }
  }

  function openShotEdit(shot: Shot, focus = '') {
    setEditFocus(focus)
    setEditing({ ...shot })
    setMenuShotId(null)
  }

  async function saveShot() {
    if (!project || !editing) return
    setBusy(true)
    try {
      await api.updateShot(project.id, editing.id, {
        narration: editing.narration,
        overlay_title: editing.overlay_title,
        overlay_subtitle: editing.overlay_subtitle,
        img_prompt: editing.img_prompt,
        video_prompt: editing.video_prompt,
        duration: Number(editing.duration) || 4,
        camera: editing.camera,
      })
      setEditing(null)
      setEditFocus('')
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveProjectPrompts() {
    if (!project || !promptEdit) return
    setBusy(true)
    try {
      const updated = await api.updateProject(project.id, {
        style_prompt: promptEdit.style_prompt,
        character_prompt: promptEdit.character_prompt,
        extra_prompt: promptEdit.extra_prompt,
      })
      setProject(updated)
      setPromptEdit(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存提示词失败')
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio">
        <p className="pf-muted">加载中…</p>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell active="studio">
        <p className="pf-error">{error}</p>
      </AppShell>
    )
  }

  const structure = (project.shots || []).slice(0, 5).map((s, i) => {
    const labels = ['开端', '发展', '转折', '高潮', '结局']
    return { label: labels[i] || `段落 ${i + 1}`, text: s.narration || s.overlay_title || '—' }
  })

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav(`/studio/${project.id}/style`)}>
              <IconChevronLeft size={18} />
              AI 生成故事板 / 分镜工作台
            </button>
            <h1 className="pf-page-title">{project.title}</h1>
          </div>
          <div className="pf-toolbar">
            {primaryAction === 'preview' ? (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || !hasFinal}
                onClick={openFinalPreview}
              >
                <IconMonitor size={14} />
                预览成片
              </button>
            ) : primaryAction === 'compose' ? (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || running}
                onClick={composeOnly}
              >
                <IconPlay size={14} />
                合成成片
              </button>
            ) : (
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-sm pf-btn-icon"
                disabled={busy || running}
                onClick={continueGenerate}
              >
                <IconPlay size={14} />
                {generateLabel}
              </button>
            )}
            <button
              type="button"
              className="pf-btn-text"
              disabled={busy || running || shots.length === 0}
              onClick={openBatchAdjust}
            >
              <IconSliders size={15} />
              批量调整
            </button>
            <button
              type="button"
              className="pf-btn-text"
              disabled={busy || running}
              onClick={restartGenerate}
            >
              <IconRefresh size={15} />
              推倒重做
            </button>
            {primaryAction !== 'preview' && hasFinal ? (
              <button type="button" className="pf-btn-text" onClick={openFinalPreview}>
                <IconMonitor size={15} />
                预览成片
              </button>
            ) : null}
            {primaryAction === 'preview' && readyToCompose ? (
              <button
                type="button"
                className="pf-btn-text"
                disabled={busy || running}
                onClick={composeOnly}
                title="用当前分镜重新合成"
              >
                重新合成
              </button>
            ) : null}
            {primaryAction !== 'generate' && !readyToCompose ? (
              <button
                type="button"
                className="pf-btn-text"
                disabled={busy || running}
                onClick={continueGenerate}
              >
                {generateLabel === '生成中…' ? '继续生成' : generateLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="pf-btn pf-btn-outline pf-btn-sm pf-btn-icon"
              onClick={() => nav(`/studio/${project.id}/editor`)}
            >
              <IconEdit size={14} />
              打开编辑器
            </button>
          </div>
        </div>
        <Stepper steps={BOARD_STEPS} current={step} doneThrough={Math.max(0, step - 1)} />
      </header>

      {error ? <p className="pf-error">{error}</p> : null}
      {project.error_msg ? <p className="pf-error">{project.error_msg}</p> : null}

      <div className="pf-board">
        <aside className="pf-create-col">
          <h3>项目设置</h3>
          {(project.cover_url || template?.preview_cover) ? (
            <img
              src={api.assetUrl(project.cover_url || template?.preview_cover)}
              alt=""
              style={{ width: '100%', borderRadius: 12, aspectRatio: '16/10', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '16/10',
                borderRadius: 12,
                background: '#e8eaee',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--pf-muted)',
              }}
            >
              <IconImage size={28} />
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => onCoverFile(e.target.files?.[0] || null)}
          />
          <div className="pf-side-actions">
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={busy || running}
              onClick={() => coverInputRef.current?.click()}
            >
              <IconImage size={14} />
              更换封面
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={busy || running || !shots.some((s) => s.image_url)}
              onClick={useFirstShotCover}
              title="使用第一个有画面的镜头作为封面"
            >
              <IconImage size={14} />
              用首镜封面
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
              disabled={shots.length === 0}
              onClick={() => downloadStoryboardCsv(project)}
            >
              <IconDownload size={14} />
              草稿导出
            </button>
          </div>
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>项目名称</span>
              <span>{project.title}</span>
            </li>
            <li>
              <span>状态</span>
              <span>{statusLabel(project)}</span>
            </li>
            <li>
              <span>进度</span>
              <span>{project.progress}%</span>
            </li>
            <li>
              <span>时长</span>
              <span>
                {Math.floor(totalDuration / 60)
                  .toString()
                  .padStart(2, '0')}
                :
                {Math.floor(totalDuration % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </li>
            <li>
              <span>画面比例</span>
              <span>{project.output_ratio || (project.pipeline_mode === 'image_text' ? '9:16' : '16:9')}</span>
            </li>
            <li>
              <span>成片方式</span>
              <span>{project.pipeline_mode === 'image_text' ? '静图成片' : 'AI 视频'}</span>
            </li>
            <li>
              <span>风格</span>
              <span>{template?.name || project.template_id}</span>
            </li>
          </ul>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm"
            onClick={() => nav(`/studio/${project.id}/style`)}
            disabled={running}
          >
            编辑项目设置
          </button>
          <div className="pf-prompt-panel">
            <h4>内置提示词</h4>
            <p className="pf-muted" style={{ fontSize: '0.72rem', margin: '0 0 0.45rem' }}>
              点击可查看并修改，影响后续重生成
            </p>
            {(
              [
                ['风格', project.style_prompt],
                ['角色', project.character_prompt],
                ['额外', project.extra_prompt],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="pf-prompt-chip"
                disabled={busy || running}
                onClick={() =>
                  setPromptEdit({
                    style_prompt: project.style_prompt || '',
                    character_prompt: project.character_prompt || '',
                    extra_prompt: project.extra_prompt || '',
                  })
                }
              >
                <strong>{label}</strong>
                <span>{(value || '').trim() || '（空，点击编辑）'}</span>
              </button>
            ))}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.75rem', marginTop: '0.75rem' }}>
            内容由 AI 生成，请注意核对准确性
          </p>
        </aside>

        <div className="pf-board-main">
          <div className="pf-outline-grid">
            <article className="pf-create-col">
              <h3>AI 生成大纲</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65 }}>
                {project.source_text}
              </p>
              <div className="pf-tags">
                <span>核心主题</span>
                <span>{project.source_type === 'script' ? '完整文案' : '一句话主题'}</span>
              </div>
            </article>
            <article className="pf-create-col">
              <h3>
                结构摘要 <ComingSoon label="示例聚合" />
              </h3>
              <ul className="pf-meta-list">
                {structure.length ? (
                  structure.map((s) => (
                    <li key={s.label}>
                      <span>{s.label}</span>
                      <span style={{ maxWidth: '60%', textAlign: 'right' }}>{s.text.slice(0, 36)}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>等待分镜</span>
                    <span>—</span>
                  </li>
                )}
              </ul>
            </article>
          </div>

          <section className="pf-shot-card">
            <div className="pf-shot-card-head">
              <h3>分镜列表（共 {project.shots.length} 个场景）</h3>
              <div className="pf-toolbar">
                {project.status === 'DONE' && hasFinal ? (
                  <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" disabled={busy} onClick={publish}>
                    发布
                  </button>
                ) : null}
                {hasFinal ? (
                  <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={openFinalPreview}>
                    预览成片
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pf-btn pf-btn-ghost pf-btn-sm"
                    disabled={busy || running || !readyToCompose}
                    onClick={composeOnly}
                  >
                    合成成片
                  </button>
                )}
              </div>
            </div>
            {project.shots.length === 0 ? (
              <p className="pf-muted" style={{ margin: '1.5rem 0', textAlign: 'center' }}>
                {running
                  ? '正在拆分镜…'
                  : '暂无分镜。从风格配置页开始生成后，可先确认修改，再手动开始画面生成。'}
              </p>
            ) : needsScriptConfirm ? (
              <p className="pf-muted" style={{ margin: '0 0 1rem' }}>
                分镜已就绪，请先检查旁白与画面描述，确认无误后点击「确认分镜，开始生成」。
              </p>
            ) : null}
            {project.shots.length === 0 ? null : (
              <div className="pf-shot-table-wrap">
                <table className="pf-shot-table">
                  <thead>
                    <tr>
                      <th>场景</th>
                      <th>画面</th>
                      <th>旁白/台词</th>
                      <th>画面描述</th>
                      <th>时长</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.shots.map((shot) => {
                      // Full pipeline: shot is "done" only after AI video (or privacy skip left image-only while project advanced)
                      const done = isFullPipeline
                        ? Boolean(shot.video_url) || shot.status === 'VIDEO_READY'
                        : shotIsDone(shot.status) || Boolean(shot.image_url)
                      const failed = shot.status === 'FAILED'
                      const sceneTitle =
                        shot.overlay_title?.trim() || `场景 ${String(shot.shot_no).padStart(2, '0')}`
                      const narration = (shot.narration || '').trim()
                      const desc = scenePromptForDisplay(shot.img_prompt).trim()
                      return (
                        <tr key={shot.id}>
                          <td className="col-no">{String(shot.shot_no).padStart(2, '0')}</td>
                          <td className="col-thumb">
                            <button
                              type="button"
                              className="pf-shot-thumb-btn"
                              onClick={() =>
                                setPreview({
                                  kind: 'shot',
                                  shotNo: shot.shot_no,
                                  imageUrl: shot.image_url,
                                  videoUrl: shot.video_url,
                                  audioUrl: shot.audio_url,
                                  caption: shotCaption(shot),
                                })
                              }
                            >
                              {shot.image_url ? (
                                <img
                                  className="pf-shot-thumb"
                                  src={api.assetUrl(shot.image_url, shot.version)}
                                  alt=""
                                />
                              ) : (
                                <div className="pf-shot-thumb empty">生成中</div>
                              )}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="pf-shot-narration pf-shot-editable"
                              disabled={busy || running}
                              title="点击编辑旁白与标题"
                              onClick={() => openShotEdit(shot, 'narration')}
                            >
                              <span className="title">{sceneTitle}</span>
                              <span className="line">
                                {narration ? `“${narration}”` : '—'}
                              </span>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="pf-shot-desc pf-shot-editable"
                              disabled={busy || running}
                              title="点击查看/修改画面提示词"
                              onClick={() => openShotEdit(shot, 'img_prompt')}
                            >
                              {desc || '（点击填写画面提示词）'}
                            </button>
                          </td>
                          <td className="col-dur">{formatMmSs(shot.duration)}</td>
                          <td className="col-status">
                            <span
                              className={[
                                'pf-shot-status',
                                failed ? 'bad' : done ? '' : 'warn',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {done && !failed ? <span className="mark">✓</span> : null}
                              {shotStatusLabel(shot.status)}
                            </span>
                          </td>
                          <td className="col-ops">
                            <div className="pf-shot-ops">
                              <button
                                type="button"
                                className="op"
                                disabled={busy || running}
                                onClick={() => openShotEdit(shot)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="op"
                                disabled={busy || running}
                                onClick={() => regenImage(shot)}
                              >
                                重生成
                              </button>
                              <button
                                type="button"
                                className="op"
                                disabled={busy || running}
                                onClick={() => regenImage(shot)}
                              >
                                替换画面
                              </button>
                              <button
                                type="button"
                                className="more"
                                aria-label="更多操作"
                                disabled={busy || running}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuShotId((id) => (id === shot.id ? null : shot.id))
                                }}
                              >
                                ⋮
                              </button>
                              {menuShotId === shot.id ? (
                                <div className="pf-shot-menu" onClick={(e) => e.stopPropagation()}>
                                  {project.pipeline_mode !== 'image_text' ? (
                                    <button
                                      type="button"
                                      disabled={busy || running}
                                      onClick={() => {
                                        setMenuShotId(null)
                                        regenVideo(shot)
                                      }}
                                    >
                                      重生视频
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={busy || running}
                                    onClick={() => {
                                      setMenuShotId(null)
                                      regenAudio(shot)
                                    }}
                                  >
                                    重配音
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pf-shot-footer">
              <span className="pf-muted" style={{ fontSize: '0.82rem' }}>
                总时长: {formatMmSs(totalDuration)} | 画面: {project.shots.length} 个 | 音频:{' '}
                {project.shots.filter((s) => s.audio_url).length} 段 | 分辨率: 预览
              </span>
              <div className="pf-toolbar">
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-icon"
                  disabled={shots.length === 0}
                  onClick={() => downloadStoryboardCsv(project)}
                >
                  <IconDownload size={15} />
                  导出分镜脚本
                </button>
                <button
                  type="button"
                  className="pf-btn-text"
                  disabled={busy || running}
                  onClick={deleteProject}
                >
                  <IconTrash size={15} />
                  删除项目
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="pf-create-col">
          <h3>生成进度</h3>
          <ul className="pf-progress-list">
            {progressItems.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <span>
                  {item.done ? (
                    <span className="pf-check">✓</span>
                  ) : item.run ? (
                    `${item.pct ?? 0}%`
                  ) : (
                    '…'
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="pf-meter" style={{ marginTop: '1rem' }}>
            <i style={{ width: `${Math.min(100, project.progress)}%` }} />
          </div>
          <p className="pf-muted" style={{ fontSize: '0.82rem' }}>
            {statusLabel(project)}
          </p>
        </aside>
      </div>

      {batchOpen && project ? (
        <div className="modal-backdrop" onClick={() => !busy && setBatchOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>批量调整分镜</h3>
            <p className="pf-muted" style={{ marginTop: 0 }}>
              已选 {batchSelected.length} / {project.shots.length} 个镜头
            </p>
            <div
              style={{
                maxHeight: 160,
                overflow: 'auto',
                border: '1px solid var(--pf-border, #e5e7eb)',
                borderRadius: 10,
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={batchSelected.length === project.shots.length && project.shots.length > 0}
                  onChange={(e) =>
                    setBatchSelected(e.target.checked ? project.shots.map((s) => s.id) : [])
                  }
                />
                全选
              </label>
              {project.shots
                .slice()
                .sort((a, b) => a.shot_no - b.shot_no)
                .map((s) => (
                  <label
                    key={s.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}
                  >
                    <input
                      type="checkbox"
                      checked={batchSelected.includes(s.id)}
                      onChange={(e) =>
                        setBatchSelected((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                    />
                    镜头 {String(s.shot_no).padStart(2, '0')} · {formatMmSs(Number(s.duration) || 0)}
                  </label>
                ))}
            </div>
            <label>
              统一时长（秒，留空则不改）
              <input
                type="number"
                min={1}
                step={0.5}
                placeholder="例如 6"
                value={batchDuration}
                onChange={(e) => setBatchDuration(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={batchRegenAudio}
                onChange={(e) => setBatchRegenAudio(e.target.checked)}
              />
              对所选镜头重新配音
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="pf-btn pf-btn-lime"
                disabled={busy || batchSelected.length === 0}
                onClick={applyBatchAdjust}
              >
                应用
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost"
                disabled={busy}
                onClick={() => setBatchOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setEditing(null)
            setEditFocus('')
          }}
        >
          <div className="modal pf-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑镜头 {editing.shot_no} · 提示词</h3>
            <label>
              镜头标题
              <input
                autoFocus={editFocus === 'title'}
                value={editing.overlay_title || ''}
                onChange={(e) => setEditing({ ...editing, overlay_title: e.target.value })}
              />
            </label>
            <label>
              副标题
              <input
                value={editing.overlay_subtitle || ''}
                onChange={(e) => setEditing({ ...editing, overlay_subtitle: e.target.value })}
              />
            </label>
            <label>
              旁白
              <textarea
                autoFocus={editFocus === 'narration'}
                value={editing.narration}
                onChange={(e) => setEditing({ ...editing, narration: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              画面提示词
              <textarea
                autoFocus={editFocus === 'img_prompt' || editFocus === ''}
                value={editing.img_prompt}
                onChange={(e) => setEditing({ ...editing, img_prompt: e.target.value })}
                rows={4}
              />
            </label>
            <label>
              视频提示词
              <textarea
                value={editing.video_prompt || ''}
                onChange={(e) => setEditing({ ...editing, video_prompt: e.target.value })}
                rows={2}
              />
            </label>
            <div className="pf-prompt-modal-row">
              <label>
                时长（秒）
                <input
                  type="number"
                  value={editing.duration}
                  onChange={(e) => setEditing({ ...editing, duration: Number(e.target.value) })}
                />
              </label>
              <label>
                运镜
                <input
                  value={editing.camera || ''}
                  onChange={(e) => setEditing({ ...editing, camera: e.target.value })}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="pf-btn pf-btn-lime" disabled={busy} onClick={saveShot}>
                保存
              </button>
              <button
                type="button"
                className="pf-btn pf-btn-ghost"
                onClick={() => {
                  setEditing(null)
                  setEditFocus('')
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {promptEdit ? (
        <div className="modal-backdrop" onClick={() => setPromptEdit(null)}>
          <div className="modal pf-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>项目内置提示词</h3>
            <p className="pf-muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              修改后对后续「重生成画面/视频」生效；已生成的镜头需点重生成才会更新。
            </p>
            <label>
              风格提示词
              <textarea
                value={promptEdit.style_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, style_prompt: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              角色提示词
              <textarea
                autoFocus
                value={promptEdit.character_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, character_prompt: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              额外要求
              <textarea
                value={promptEdit.extra_prompt}
                onChange={(e) => setPromptEdit({ ...promptEdit, extra_prompt: e.target.value })}
                rows={2}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="pf-btn pf-btn-lime"
                disabled={busy}
                onClick={saveProjectPrompts}
              >
                保存
              </button>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPromptEdit(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>
                {preview.kind === 'final' ? preview.title : `镜头 ${preview.shotNo}`}
              </h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            {preview.kind === 'final' ? (
              <video className="preview-media" src={preview.url} controls autoPlay />
            ) : preview.videoUrl ? (
              <video
                className="preview-media"
                src={api.assetUrl(preview.videoUrl)}
                poster={preview.imageUrl ? api.assetUrl(preview.imageUrl) : undefined}
                controls
                autoPlay
              />
            ) : preview.imageUrl ? (
              <img className="preview-media" src={api.assetUrl(preview.imageUrl)} alt="" />
            ) : (
              <p className="pf-muted">暂无预览</p>
            )}
            {preview.kind === 'shot' && preview.audioUrl ? (
              <audio src={api.assetUrl(preview.audioUrl)} controls style={{ width: '100%' }} />
            ) : null}
            {preview.kind === 'shot' ? <p className="pf-muted">{preview.caption}</p> : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
