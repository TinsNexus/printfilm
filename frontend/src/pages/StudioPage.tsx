import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, defaultsFromTemplate } from '../api'
import type { PipelineMode, Project, Shot, Template, VoicePreset } from '../api'
import BrandMark from '../components/BrandMark'
import { scenePromptForDisplay } from '../promptDisplay'

const RUNNING = new Set([
  'SCRIPTING',
  'IMAGING',
  'VIDEOING',
  'AUDIOING',
  'COMPOSING',
  'AUDITING',
])

const RESUME_COMPOSE = new Set(['SCRIPT_READY', 'IMAGE_READY', 'VIDEO_READY'])

const STATUS_CN: Record<string, string> = {
  DRAFT: '草稿',
  SCRIPTING: '拆分镜中',
  SCRIPT_READY: '分镜完成',
  IMAGING: '出图+配音并行中',
  IMAGE_READY: '分镜图完成',
  VIDEOING: '生成 AI 视频（并行）',
  VIDEO_READY: '镜头视频完成',
  AUDIOING: '生成配音',
  COMPOSING: '合成成片',
  AUDITING: '审核中',
  DONE: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

const SHOT_STATUS_CN: Record<string, string> = {
  PENDING: '等待中',
  IMAGE_READY: '图已生成',
  VIDEO_READY: '视频已生成',
  AUDIO_READY: '配音已生成',
  FAILED: '失败',
}

type PreviewState =
  | {
      kind: 'shot'
      shotNo: number
      imageUrl: string | null
      videoUrl: string | null
      audioUrl: string | null
      caption: string
      portrait: boolean
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

function openShotPreview(shot: Shot, portrait: boolean): PreviewState {
  return {
    kind: 'shot',
    shotNo: shot.shot_no,
    imageUrl: shot.image_url,
    videoUrl: shot.video_url,
    audioUrl: shot.audio_url,
    caption: shotCaption(shot),
    portrait,
  }
}

function durationBounds(isImageText: boolean, tpl?: Template) {
  if (isImageText) return { min: 4, max: 12 }
  return {
    min: tpl?.shot_duration_min ?? 3,
    max: Math.min(tpl?.shot_duration_max ?? 12, 30),
  }
}

function canResumeCompose(project: Project) {
  if (!project.shots.length) return false
  const mode = project.pipeline_mode || 'full'
  return project.shots.every((s) => {
    if (!(s.image_url && s.audio_url)) return false
    if (mode === 'full' && !s.video_url && project.status === 'VIDEO_READY') return true
    if (mode === 'full') return Boolean(s.video_url) || project.status === 'IMAGE_READY'
    return true
  })
}

export default function StudioPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [voiceId, setVoiceId] = useState('zh_female_cancan_uranus_bigtts')
  const [stylePrompt, setStylePrompt] = useState('')
  const [characterPrompt, setCharacterPrompt] = useState('')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [templateId, setTemplateId] = useState(params.get('template') || '')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>(
    (params.get('mode') as PipelineMode) === 'image_text' ? 'image_text' : 'full',
  )
  const [sourceType, setSourceType] = useState<'theme' | 'script'>('theme')
  const [title, setTitle] = useState('未命名作品')
  const [sourceText, setSourceText] = useState(
    '民营航天公司的首枚试验火箭首次发射失败，却成为后来成功的起点。',
  )
  const [project, setProject] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Shot | null>(null)
  const [preview, setPreview] = useState<PreviewState>(null)

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  )
  const isImageText = (project?.pipeline_mode || pipelineMode) === 'image_text'
  const bounds = durationBounds(isImageText, selected)
  const running = Boolean(project && RUNNING.has(project.status))

  function applyTemplatePresets(tpl: Template) {
    const d = defaultsFromTemplate(tpl)
    setStylePrompt(d.style_prompt)
    setCharacterPrompt(d.character_prompt)
    setExtraPrompt(d.extra_prompt)
    setVoiceId(d.voice_id)
    setPipelineMode(d.pipeline_mode)
  }

  function onTemplateChange(id: string) {
    setTemplateId(id)
    const tpl = templates.find((t) => t.id === id)
    if (tpl && !running) applyTemplatePresets(tpl)
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    api.me().catch(() => nav('/auth'))
    api.templates().then((list) => {
      setTemplates(list)
      const fromUrl = params.get('template') || ''
      const id = fromUrl || list[0]?.id || ''
      setTemplateId((prev) => prev || id)
      if (!params.get('project')) {
        const tpl = list.find((t) => t.id === (fromUrl || id)) || list[0]
        if (tpl) applyTemplatePresets(tpl)
      }
    })
    api.voices().then(setVoices)
  }, [nav, params])

  useEffect(() => {
    const projectId = Number(params.get('project') || '')
    if (!projectId) return
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        setTitle(p.title)
        setTemplateId(p.template_id)
        setSourceType(p.source_type as 'theme' | 'script')
        setSourceText(p.source_text)
        if (p.pipeline_mode) setPipelineMode(p.pipeline_mode)
        if (p.voice_id) setVoiceId(p.voice_id)
        setStylePrompt(p.style_prompt || '')
        setCharacterPrompt(p.character_prompt || '')
        setExtraPrompt(p.extra_prompt || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载项目失败'))
  }, [params])

  // Project loaded before templates: backfill empty prompt fields from template presets
  useEffect(() => {
    if (!project || !templates.length) return
    const tpl = templates.find((t) => t.id === project.template_id)
    if (!tpl) return
    const d = defaultsFromTemplate(tpl)
    setStylePrompt((prev) => prev || d.style_prompt)
    setCharacterPrompt((prev) => prev || d.character_prompt)
    setExtraPrompt((prev) => prev || d.extra_prompt)
  }, [templates, project?.id, project?.template_id])

  useEffect(() => {
    if (!project) return
    const id = project.id
    const polling =
      RUNNING.has(project.status) ||
      (!['DONE', 'FAILED', 'CANCELLED', 'DRAFT'].includes(project.status) && project.progress < 100)
    if (!polling) return
    const timer = setInterval(() => {
      api
        .getProject(id)
        .then((next) => {
          setProject((prev) => {
            if (!prev || prev.id !== next.id) return next
            // Avoid useless identity churn when nothing meaningful changed
            if (
              prev.status === next.status &&
              prev.progress === next.progress &&
              prev.final_video_url === next.final_video_url &&
              prev.error_msg === next.error_msg &&
              prev.shots.length === next.shots.length &&
              prev.shots.every((s, i) => {
                const n = next.shots[i]
                return (
                  s.id === n.id &&
                  s.status === n.status &&
                  s.image_url === n.image_url &&
                  s.video_url === n.video_url &&
                  s.audio_url === n.audio_url &&
                  s.version === n.version
                )
              })
            ) {
              return prev
            }
            return next
          })
        })
        .catch(() => undefined)
    }, 1500)
    return () => clearInterval(timer)
  }, [project?.id, project?.status, project?.progress])

  async function applyFormToProject(existingId?: number) {
    if (existingId) {
      return api.updateProject(existingId, {
        template_id: templateId,
        title,
        source_type: sourceType,
        source_text: sourceText,
        pipeline_mode: pipelineMode,
        voice_id: voiceId,
        style_prompt: stylePrompt,
        character_prompt: characterPrompt,
        extra_prompt: extraPrompt,
        resolution_mode: 'preview',
      })
    }
    return api.createProject({
      template_id: templateId,
      title,
      source_type: sourceType,
      source_text: sourceText,
      resolution_mode: 'preview',
      pipeline_mode: pipelineMode,
      voice_id: voiceId,
      style_prompt: stylePrompt,
      character_prompt: characterPrompt,
      extra_prompt: extraPrompt,
    })
  }

  async function onCreateAndGenerate(e: FormEvent) {
    e.preventDefault()
    if (!templateId) return
    setBusy(true)
    setError('')
    try {
      const reuse =
        project &&
        !RUNNING.has(project.status) &&
        ['DRAFT', 'FAILED', 'CANCELLED', 'DONE', 'SCRIPT_READY', 'IMAGE_READY', 'VIDEO_READY'].includes(
          project.status,
        )
      const target = await applyFormToProject(reuse ? project.id : undefined)
      const started = await api.generate(target.id)
      setProject(started)
      nav(`/studio?project=${started.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '失败')
    } finally {
      setBusy(false)
    }
  }

  async function onVoiceChange(next: string) {
    setVoiceId(next)
    if (!project || running) return
    try {
      const updated = await api.updateProject(project.id, { voice_id: next })
      setProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新音色失败')
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

  async function regenAllAudioAndCompose() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      await api.updateProject(project.id, { voice_id: voiceId })
      const updated = await api.regenAllAudio(project.id)
      setProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重配音合成失败')
      try {
        setProject(await api.getProject(project.id))
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  async function composeOnly() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const updated = await api.compose(project.id)
      setProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '合成失败')
    } finally {
      setBusy(false)
    }
  }

  async function onModeChange(mode: PipelineMode) {
    setPipelineMode(mode)
    if (!project || running) return
    try {
      const updated = await api.updateProject(project.id, { pipeline_mode: mode })
      setProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新模式失败')
    }
  }

  async function saveShot() {
    if (!project || !editing) return
    setBusy(true)
    try {
      const duration = Math.max(bounds.min, Math.min(bounds.max, Number(editing.duration) || bounds.min))
      await api.updateShot(project.id, editing.id, {
        narration: editing.narration,
        overlay_title: editing.overlay_title,
        overlay_subtitle: editing.overlay_subtitle,
        img_prompt: editing.img_prompt,
        video_prompt: editing.video_prompt,
        duration,
        camera: editing.camera,
      })
      setEditing(null)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
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

  async function publish() {
    if (!project) return
    setBusy(true)
    try {
      await api.publish(project.id)
      nav('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败')
    } finally {
      setBusy(false)
    }
  }

  async function continueGenerate() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const started = await api.generate(project.id)
      setProject(started)
    } catch (err) {
      setError(err instanceof Error ? err.message : '继续生成失败')
      try {
        setProject(await api.getProject(project.id))
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  async function cancelTask() {
    if (!project) return
    if (!window.confirm('确定取消当前生成任务？')) return
    setBusy(true)
    try {
      const updated = await api.cancelProject(project.id)
      setProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteCurrent() {
    if (!project) return
    if (!window.confirm('确定删除该创作？素材与成片将一并清除。')) return
    setBusy(true)
    try {
      await api.deleteProject(project.id)
      setProject(null)
      nav('/history')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page studio">
      <header className="topbar">
        <BrandMark />
        <nav>
          <span className="quota">额度不限</span>
          <Link to="/history">历史</Link>
          <Link to="/">首页</Link>
        </nav>
      </header>

      <div className="studio-layout">
        <aside className="studio-input">
          <h1>创作工作台</h1>
          <form className="stack" onSubmit={onCreateAndGenerate}>
            <label>
              模板
              <select
                value={templateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                required
                disabled={running}
              >
                {(() => {
                  const groups = new Map<string, Template[]>()
                  for (const t of templates) {
                    const key = (t.category && t.category[0]) || '其他'
                    if (!groups.has(key)) groups.set(key, [])
                    groups.get(key)!.push(t)
                  }
                  return [...groups.entries()].map(([cat, list]) => (
                    <optgroup key={cat} label={cat}>
                      {list.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.category?.length > 1 ? ` · ${t.category.slice(1).join('/')}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))
                })()}
              </select>
            </label>
            <label>
              生成模式
              <select
                value={pipelineMode}
                onChange={(e) => onModeChange(e.target.value as PipelineMode)}
                disabled={running}
              >
                <option value="full">完整成片（图→AI视频→配音）</option>
                <option value="image_text">图文短视频（出图+叠字+配音）</option>
              </select>
            </label>
            <label>
              配音音色
              <select
                value={voiceId}
                onChange={(e) => onVoiceChange(e.target.value)}
                disabled={running}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              画面风格
              <textarea
                rows={2}
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                disabled={running}
                placeholder="随模板自动填入，可再改"
              />
            </label>
            <label>
              人物设定
              <textarea
                rows={2}
                value={characterPrompt}
                onChange={(e) => setCharacterPrompt(e.target.value)}
                disabled={running}
                placeholder="随模板自动填入，可再改"
              />
            </label>
            <label>
              其他画面要求
              <textarea
                rows={2}
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                disabled={running}
                placeholder="随模板自动填入，可再改"
              />
            </label>
            {project && !running && (
              <p className="muted small">可随时改模式/文案/音色/风格，再点下方按钮重新生成。</p>
            )}
            <label>
              标题
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              输入方式
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'theme' | 'script')}
              >
                <option value="theme">一句话主题</option>
                <option value="script">粘贴完整文案</option>
              </select>
            </label>
            <label>
              {sourceType === 'theme' ? '主题' : '文案'}
              <textarea
                rows={8}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary" disabled={busy || running}>
              {busy
                ? '处理中…'
                : project &&
                    (project.status === 'FAILED' || project.status === 'CANCELLED')
                  ? '继续生成'
                  : project && RESUME_COMPOSE.has(project.status) && canResumeCompose(project)
                    ? '继续合成短视频'
                    : project && !running
                      ? '按当前设置重新生成'
                      : pipelineMode === 'image_text'
                        ? '生成图文短视频'
                        : '生成分镜成片'}
            </button>
          </form>
        </aside>

        <main className="studio-main">
          {!project ? (
            <div className="empty-state">
              <p>选择模板并提交后，这里会展开分镜时间轴与进度。</p>
            </div>
          ) : (
            <>
              <div className="progress-head">
                <div>
                  <h2>{project.title}</h2>
                  <p className="muted">
                    {isImageText ? '图文模式' : '完整成片'} ·{' '}
                    {STATUS_CN[project.status] || project.status}
                    {project.status === 'VIDEOING' && isImageText
                      ? '（异常：图文模式不应生成 AI 视频）'
                      : ''}{' '}
                    · 进度 {project.progress}%
                    {project.error_msg ? ` · ${project.error_msg}` : ''}
                  </p>
                </div>
                <div className="progress-bar" aria-hidden>
                  <i style={{ width: `${project.progress}%` }} />
                </div>
                <div className="cta-row">
                  {running && (
                    <button type="button" className="btn ghost" onClick={cancelTask} disabled={busy}>
                      取消任务
                    </button>
                  )}
                  {!running &&
                    project.shots.length > 0 &&
                    (project.status === 'FAILED' ||
                      project.status === 'CANCELLED' ||
                      (project.progress > 0 &&
                        project.progress < 100 &&
                        project.status !== 'DONE' &&
                        project.status !== 'DRAFT')) && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={continueGenerate}
                        disabled={busy}
                      >
                        {busy ? '处理中…' : '继续生成'}
                      </button>
                    )}
                  {project.shots.some((s) => s.image_url) && !running && (
                    <>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={regenAllAudioAndCompose}
                      >
                        重配音并合成
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={composeOnly}
                      >
                        仅重新合成
                      </button>
                    </>
                  )}
                  {project.status === 'DONE' && project.final_video_url && (
                    <>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() =>
                          setPreview({
                            kind: 'final',
                            url: project.final_video_url!,
                            title: project.title,
                            bust: project.updated_at,
                          })
                        }
                      >
                        播放成片
                      </button>
                      <a
                        className="btn ghost"
                        href={api.assetUrl(project.final_video_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开链接
                      </a>
                      <button type="button" className="btn ghost" onClick={publish} disabled={busy}>
                        发布
                      </button>
                    </>
                  )}
                  <button type="button" className="btn danger" onClick={deleteCurrent} disabled={busy}>
                    删除创作
                  </button>
                </div>
              </div>

              <div className="shot-list">
                {project.shots
                  .slice()
                  .sort((a, b) => a.shot_no - b.shot_no)
                  .map((shot) => (
                    <article key={shot.id} className="shot-card">
                      <button
                        type="button"
                        className={`shot-thumb clickable${isImageText ? ' portrait' : ''}`}
                        onClick={() => setPreview(openShotPreview(shot, isImageText || !shot.video_url))}
                        disabled={!shot.image_url && !shot.video_url}
                        title="点击预览"
                      >
                        {shot.image_url ? (
                          <img src={api.assetUrl(shot.image_url)} alt="" />
                        ) : (
                          <div className="placeholder">Shot {shot.shot_no}</div>
                        )}
                        {(shot.video_url || (isImageText && shot.image_url)) && (
                          <span className="play-badge">预览</span>
                        )}
                      </button>
                      <div className="shot-body">
                        <header>
                          <strong>#{shot.shot_no}</strong>
                          <span>
                            {shot.duration}s · {SHOT_STATUS_CN[shot.status] || shot.status}
                          </span>
                        </header>
                        {isImageText && shot.overlay_title ? (
                          <p>
                            <strong>{shot.overlay_title}</strong>
                            <br />
                            <span className="muted">
                              {shot.overlay_subtitle || shot.narration}
                            </span>
                            {shot.overlay_subtitle && shot.narration ? (
                              <>
                                <br />
                                <span className="small">旁白：{shot.narration}</span>
                              </>
                            ) : null}
                          </p>
                        ) : (
                          <p>{shot.narration}</p>
                        )}
                        <div className="shot-actions">
                          <button type="button" onClick={() => setEditing(shot)}>
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={busy || running}
                            onClick={() => regenImage(shot)}
                          >
                            重绘
                          </button>
                          <button
                            type="button"
                            disabled={busy || running || !shot.narration}
                            onClick={() => regenAudio(shot)}
                          >
                            重配音
                          </button>
                          {!isImageText && (
                            <button
                              type="button"
                              disabled={busy || running || !shot.image_url}
                              onClick={() => regenVideo(shot)}
                            >
                              重生视频
                            </button>
                          )}
                          {(shot.video_url || shot.image_url) && (
                            <button type="button" onClick={() => setPreview(openShotPreview(shot, isImageText || !shot.video_url))}>
                              查看
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </>
          )}
        </main>
      </div>

      {editing && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>编辑分镜 #{editing.shot_no}</h3>
            {isImageText && (
              <>
                <label>
                  顶部大标题（叠字）
                  <input
                    value={editing.overlay_title || ''}
                    onChange={(e) => setEditing({ ...editing, overlay_title: e.target.value })}
                  />
                </label>
                <label>
                  副标题（叠字）
                  <input
                    value={editing.overlay_subtitle || ''}
                    onChange={(e) => setEditing({ ...editing, overlay_subtitle: e.target.value })}
                  />
                </label>
              </>
            )}
            <label>
              {isImageText ? '旁白台词（配音）' : '台词'}
              <textarea
                rows={3}
                value={editing.narration}
                onChange={(e) => setEditing({ ...editing, narration: e.target.value })}
              />
            </label>
            <label>
              画面提示词（场景描述，不含风格/人物锁定）
              <textarea
                rows={3}
                value={scenePromptForDisplay(editing.img_prompt)}
                onChange={(e) => setEditing({ ...editing, img_prompt: e.target.value })}
              />
            </label>
            {!isImageText && (
              <label>
                视频提示词
                <textarea
                  rows={3}
                  value={editing.video_prompt}
                  onChange={(e) => setEditing({ ...editing, video_prompt: e.target.value })}
                />
              </label>
            )}
            <label>
              时长（秒，{bounds.min}–{bounds.max}）
              <input
                type="number"
                min={bounds.min}
                max={bounds.max}
                step={1}
                value={editing.duration}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setEditing({
                    ...editing,
                    duration: Number.isFinite(n)
                      ? Math.max(bounds.min, Math.min(bounds.max, n))
                      : bounds.min,
                  })
                }}
              />
            </label>
            <div className="cta-row">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={saveShot} disabled={busy}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPreview(null)}>
          <div
            className={`modal preview-modal${
              preview.kind === 'shot' && preview.portrait ? ' portrait' : ''
            }${preview.kind === 'final' && isImageText ? ' portrait' : ''}`}
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="preview-head">
              <h3>
                {preview.kind === 'final'
                  ? `成片 · ${preview.title}`
                  : `分镜 #${preview.shotNo}`}
              </h3>
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
                关闭
              </button>
            </header>
            {preview.kind === 'final' ? (
              <video
                key={`${preview.url}:${preview.bust || ''}`}
                className="preview-media"
                src={api.assetUrl(preview.url, preview.bust)}
                controls
                autoPlay
                playsInline
              />
            ) : preview.videoUrl ? (
              <video
                key={preview.videoUrl}
                className="preview-media"
                src={api.assetUrl(preview.videoUrl)}
                controls
                autoPlay
                playsInline
                poster={preview.imageUrl ? api.assetUrl(preview.imageUrl) : undefined}
              />
            ) : preview.imageUrl ? (
              <>
                <img
                  className="preview-media"
                  src={api.assetUrl(preview.imageUrl)}
                  alt=""
                />
                {preview.audioUrl && (
                  <audio
                    key={preview.audioUrl}
                    className="preview-audio"
                    src={api.assetUrl(preview.audioUrl)}
                    controls
                    autoPlay
                  />
                )}
              </>
            ) : (
              <p className="muted">暂无预览素材</p>
            )}
            {preview.kind === 'shot' && preview.caption ? (
              <p className="muted small preview-caption">{preview.caption}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
