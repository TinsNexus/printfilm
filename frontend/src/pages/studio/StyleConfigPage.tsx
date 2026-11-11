import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, defaultsFromTemplate, resolveVoiceId } from '../../api'
import type { MediaModelOption, PipelineMode, Project, Template, VoicePreset } from '../../api'
import { resolveCatalogModelSelection, useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { MediaCostNotice } from '../../components/billing/MediaCostNotice'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import ComingSoon from '../../components/ui/ComingSoon'
import { IconChevronLeft, IconPlay } from '../../components/ui/Icons'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import { handleBillingError } from '../../lib/billingError'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { tr } from '../../i18n/translate.ts'

const OUTPUT_MODES: { id: PipelineMode; label: string; desc: string; image: string }[] = [
  { id: 'full', label: tr('styleConfigPage.aiVideo'), desc: tr('styleConfigPage.imageVideoVoiceOverCompose'), image: '/mode-presets/full.jpg' },
  {
    id: 'image_text',
    label: tr('styleConfigPage.stillImageVideo'),
    desc: tr('styleConfigPage.stillsCaptionsVoiceOverNo'),
    image: '/mode-presets/image_text.jpg',
  },
]

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: '16:9', label: '16:9', w: 36, h: 20 },
  { id: '9:16', label: '9:16', w: 18, h: 32 },
  { id: '1:1', label: '1:1', w: 24, h: 24 },
  { id: '4:3', label: '4:3', w: 28, h: 21 },
  { id: '21:9', label: '21:9', w: 40, h: 17 },
]

/** 画幅是否竖向（高 > 宽），用于预览卡与实时预览比例 */
/** 音色卡片与 API 试听共用的 speaker 键 */
function voiceKey(v: VoicePreset): string {
  return v.speaker || v.id
}

function isPortraitRatio(ratio: string | undefined | null): boolean {
  const raw = String(ratio || '').trim()
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i)
  if (!m) return false
  return Number(m[2]) > Number(m[1])
}

export default function StyleConfigPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [stylePrompt, setStylePrompt] = useState('')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('full')
  const [ratio, setRatio] = useState('16:9')
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [imageResolution, setImageResolution] = useState('2K')
  const [videoResolution, setVideoResolution] = useState('480p')
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!mediaCatalog) return
    setImageModel(previous => resolveCatalogModelSelection(mediaCatalog, 'image', previous))
    setVideoModel(previous => resolveCatalogModelSelection(mediaCatalog, 'video', previous))
  }, [mediaCatalog, imageModel, videoModel])

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
    }
    api.voices().then(setVoices)
    Promise.all([api.templates(), api.getProject(projectId)])
      .then(async ([list, p]) => {
        if (p.pipeline_mode === 'image_text') {
          nav(`/studio/new?project=${p.id}`, { replace: true })
          return
        }
        // 下架的风格不再展示给新用户，历史项目仍可加载其原模板。
        if (p.template_id && !list.some((item) => item.id === p.template_id)) {
          const legacy = await api.getTemplate(p.template_id)
          list = [...list, legacy]
        }
        setTemplates(list)
        setProject(p)
        setStylePrompt(p.style_prompt || '')
        setExtraPrompt(p.extra_prompt || '')
        setVoiceId(p.voice_id || '')
        setPipelineMode(p.pipeline_mode || 'full')
        setRatio(p.output_ratio || '16:9')
        if (p.image_model) setImageModel(p.image_model)
        if (p.video_model) setVideoModel(p.video_model)
        if (p.image_resolution) setImageResolution(p.image_resolution)
        if (p.video_resolution) setVideoResolution(p.video_resolution)
      })
      .catch((err) => setError(err instanceof Error ? err.message : tr('styleConfigPage.failedLoad')))
  }, [nav, projectId])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!voices.length) return
    setVoiceId((prev) => {
      const next = resolveVoiceId(prev, voices)
      return next === prev ? prev : next
    })
  }, [voices])

  const currentTpl = useMemo(
    () => templates.find((t) => t.id === project?.template_id),
    [templates, project?.template_id],
  )

  const selectedVoice = voices.find((v) => voiceKey(v) === voiceId || v.id === voiceId)

  useEffect(() => {
    if (!project || !currentTpl) return
    if (!stylePrompt) {
      const d = defaultsFromTemplate(currentTpl)
      setStylePrompt((v) => v || d.style_prompt)
      setExtraPrompt((v) => v || d.extra_prompt)
      setVoiceId((v) => v || d.voice_id)
    }
  }, [project, currentTpl])

  useEffect(() => {
    if (!project || project.output_ratio || !currentTpl?.default_ratio) return
    setRatio(currentTpl.default_ratio)
  }, [project?.id, project?.output_ratio, currentTpl?.default_ratio])

  function pickRatio(r: (typeof RATIOS)[0]) {
    setRatio(r.id)
  }

  function stopPreview() {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  function selectVoice(v: VoicePreset) {
    const vid = voiceKey(v)
    if (vid !== voiceId) stopPreview()
    setVoiceId(vid)
  }

  async function previewVoice(v: VoicePreset, e: MouseEvent) {
    e.stopPropagation()
    const vid = voiceKey(v)
    selectVoice(v)
    setError('')

    if (playingId === vid && audioRef.current && !audioRef.current.paused) {
      stopPreview()
      return
    }

    stopPreview()
    setPreviewBusy(vid)
    try {
      const res = await api.previewVoice(vid)
      const url = api.assetUrl(res.url)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        setPlayingId(null)
        setError(tr('styleConfigPage.previewPlaybackFailed'))
      }
      setPlayingId(vid)
      await audio.play()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('styleConfigPage.previewFailed'))
      setPlayingId(null)
    } finally {
      setPreviewBusy(null)
    }
  }

  async function generate() {
    if (!project) return
    const image = mediaCatalog?.image_models.find(item => item.id === imageModel)
    const video = mediaCatalog?.video_models.find(item => item.id === videoModel)
    if (!image || image.available === false || !(image.available_resolutions ?? image.allowed_resolutions ?? []).includes(imageResolution) || !image.allowed_aspect_ratios?.includes(ratio) ||
        (pipelineMode === 'full' && (!video || video.available === false || !(video.available_resolutions ?? video.allowed_resolutions ?? []).includes(videoResolution) || !video.allowed_aspect_ratios?.includes(ratio)))) {
      setError(tr('styleConfigPage.selectedModelDoesNotSupport'))
      return
    }
    stopPreview()
    setBusy(true)
    setError('')
    try {
      const d = currentTpl ? defaultsFromTemplate(currentTpl) : null
      /*
       * styleOut 风格提示词；与模板相同则留空，生成时读后台
       * extraOut 额外提示词
       */
      const styleOut = stylePrompt.trim()
      const extraOut = extraPrompt.trim()
      const sameStyle = Boolean(d) && styleOut === d!.style_prompt
      const sameExtra = Boolean(d) && extraOut === d!.extra_prompt
      await api.updateProject(project.id, {
        style_prompt: sameStyle ? '' : styleOut,
        character_prompt: '',
        extra_prompt: sameExtra ? '' : extraOut,
        voice_id: voiceId,
        pipeline_mode: pipelineMode,
        output_ratio: ratio,
        image_model: imageModel,
        video_model: videoModel,
        image_resolution: imageResolution,
        video_resolution: videoResolution,
      })
      const started = await api.generate(project.id)
      nav(`/studio/${started.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr('styleConfigPage.generationFailed')
      if (msg.includes('合成成片')) {
        try {
          const composed = await api.compose(project.id)
          nav(`/studio/${composed.id}`)
          return
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : tr('styleConfigPage.synthesisFailed'))
          return
        }
      }
      setError(msg)
      await handleBillingError(err, nav)
    } finally {
      setBusy(false)
    }
  }

  // project 初始加载失败时不得穿透主页面（下方存在 project.xxx 非空访问，会白屏崩溃）
  if (!project) {
    return (
      <AppShell active="studio">
        {error ? <BillingErrorNotice message={error} /> : <p className="pf-muted">{tr('styleConfigPage.loading')}</p>}
      </AppShell>
    )
  }

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav('/studio/new')}>
              <IconChevronLeft size={18} />
              {tr('styleConfigPage.backStudio')}
            </button>
            <h1 className="pf-page-title">{project?.title || tr('styleConfigPage.styleSettings')}</h1>
          </div>
          <Stepper
            steps={kepuSteps(pipelineMode)}
            current={kepuStepIndex('style', { status: 'DRAFT', pipeline_mode: pipelineMode })}
            doneThrough={0}
          />
        </div>
      </header>

      <div className="pf-style-layout">
        <aside className="pf-create-col">
          <h3>{tr('styleConfigPage.projectInfo')}</h3>
          {currentTpl ? (
            <div>
              <div
                className={[
                  'pf-style-side-thumb',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
              </div>
              <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>{currentTpl.name}</p>
              <div className="pf-tags">
                {currentTpl.category.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>{tr('styleConfigPage.topic')}</span>
              <span style={{ maxWidth: '55%', textAlign: 'right' }}>
                {(project?.source_text || '').slice(0, 40)}
              </span>
            </li>
            <li>
              <span>{tr('styleConfigPage.duration')}</span>
              <span>{tr('styleConfigPage.n13Minutes')}</span>
            </li>
            <li>
              <span>{tr('styleConfigPage.shots')}</span>
              <span>{tr('styleConfigPage.aiDecides')}</span>
            </li>
          </ul>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm" disabled>
            {tr('styleConfigPage.previewTemplate')} <ComingSoon />
          </button>
        </aside>

        <section className="pf-create-col">
          <div className="pf-style-block">
            <h3>{tr('styleConfigPage.visualStyle')}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {tr('styleConfigPage.lockedTemplateChoseTopicImages')}
            </p>
            {currentTpl ? (
              <div
                className={[
                  'pf-style-opt',
                  'selected',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ maxWidth: 280, textAlign: 'left' }}
              >
                <span className="pf-style-opt-media">
                  <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
                  {currentTpl.default_ratio ? (
                    <span className="pf-style-opt-ratio">{currentTpl.default_ratio}</span>
                  ) : null}
                </span>
                <div className="cap">{currentTpl.name}</div>
                <div className="cap-sub">{tr('styleConfigPage.templateStyle')}</div>
              </div>
            ) : null}
            <label className="pf-field" style={{ marginTop: '0.75rem' }}>
              <span className="pf-field-label">{tr('styleConfigPage.stylePromptOptionalOverride')}</span>
              <textarea
                className="pf-field-input"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                rows={2}
                style={{ resize: 'vertical', minHeight: 64 }}
              />
            </label>
          </div>

          <div className="pf-style-block">
            <h3>
              {tr('styleConfigPage.voice')}
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                {tr('styleConfigPage.moreVoices')} <ComingSoon />
              </button>
            </h3>
            <div className="pf-voice-row">
              {voices.map((v) => {
                const vid = voiceKey(v)
                const selected = voiceId === vid
                const loading = previewBusy === vid
                const playing = playingId === vid
                return (
                  <div
                    key={v.id}
                    className={selected ? 'pf-voice-card selected' : 'pf-voice-card'}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectVoice(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectVoice(v)
                      }
                    }}
                  >
                    <strong className="pf-voice-name">{v.label}</strong>
                    <span className="pf-voice-meta">
                      {v.gender === 'female' ? tr('styleConfigPage.female') : v.gender === 'male' ? tr('styleConfigPage.male') : v.gender}
                    </span>
                    <button
                      type="button"
                      className={[
                        'pf-btn',
                        'pf-btn-sm',
                        'pf-btn-icon',
                        playing ? 'pf-btn-lime' : 'pf-btn-ghost',
                        'pf-voice-preview',
                      ].join(' ')}
                      disabled={loading || busy}
                      onClick={(e) => previewVoice(v, e)}
                    >
                      {loading ? (
                        tr('styleConfigPage.generating')
                      ) : playing ? (
                        tr('styleConfigPage.playing')
                      ) : (
                        <>
                          <IconPlay size={12} />
                          {tr('styleConfigPage.preview')}
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {selectedVoice ? (
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
                {tr('styleConfigPage.current')}{selectedVoice.label} {tr('styleConfigPage.voiceNarratesWholeVideoClick')}
              </p>
            ) : null}
          </div>

          <div className="pf-style-block">
            <h3>{tr('styleConfigPage.productionMode')}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {tr('styleConfigPage.anyTemplateCanGenerateAi')}
            </p>
            <div className="pf-style-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {OUTPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={pipelineMode === m.id ? 'pf-style-opt selected' : 'pf-style-opt'}
                  onClick={() => setPipelineMode(m.id)}
                >
                  <img src={m.image} alt="" />
                  <div className="cap">{m.label}</div>
                  <div className="cap-sub">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {mediaCatalog ? (
            <div className="pf-style-block">
              <h3>{tr('styleConfigPage.imageModel')}</h3>
              <label>{tr('styleConfigPage.resolution')} <select value={imageResolution} onChange={event => setImageResolution(event.target.value)}>
                {(mediaCatalog.image_models.find(item => item.id === imageModel)?.available_resolutions ?? mediaCatalog.image_models.find(item => item.id === imageModel)?.allowed_resolutions ?? []).map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <MediaCostNotice modelId={imageModel} resolution={imageResolution} />
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {tr('styleConfigPage.usesTokenfreeModelsSelectedUnder')}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.image_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={imageModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    disabled={m.available === false}
                    onClick={() => setImageModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">{tr('styleConfigPage.recommended')}</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">{Object.entries(m.prices ?? {}).map(([resolution, price]) => tr('styleConfigPage.image', { resolution, price })).join(' · ') || m.pricing_hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mediaCatalog && pipelineMode === 'full' ? (
            <div className="pf-style-block">
              <h3>{tr('styleConfigPage.videoModel')}</h3>
              <label>{tr('styleConfigPage.resolution')} <select value={videoResolution} onChange={event => setVideoResolution(event.target.value)}>
                {(mediaCatalog.video_models.find(item => item.id === videoModel)?.available_resolutions ?? mediaCatalog.video_models.find(item => item.id === videoModel)?.allowed_resolutions ?? []).map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <MediaCostNotice modelId={videoModel} resolution={videoResolution} seconds={1} />
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {tr('styleConfigPage.modelUsedImageVideoNot')}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.video_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={videoModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    disabled={m.available === false}
                    onClick={() => setVideoModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">{tr('styleConfigPage.recommended')}</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">{Object.entries(m.prices ?? {}).map(([resolution, price]) => tr('styleConfigPage.s', { resolution, price })).join(' · ') || m.pricing_hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pf-style-block">
            <h3>{tr('styleConfigPage.outputRatio')}</h3>
            <div className="pf-ratio-row">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={ratio === r.id ? 'pf-ratio selected' : 'pf-ratio'}
                  onClick={() => pickRatio(r)}
                >
                  <div className="box" style={{ width: r.w, height: r.h }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="pf-create-col">
          <h3>{tr('styleConfigPage.livePreview')}</h3>
          <div
            className={[
              'pf-editor-preview',
              isPortraitRatio(ratio) ? 'portrait' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ marginBottom: '0.85rem' }}
          >
            {currentTpl ? (
              <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
            ) : (
              <span className="empty">{tr('styleConfigPage.previewPlaceholder')}</span>
            )}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
            {tr('styleConfigPage.afterGeneratingSeeRealImages')}
          </p>
          <h3 style={{ marginTop: '1rem' }}>{tr('styleConfigPage.currentSettings')}</h3>
          <ul className="pf-meta-list">
            <li>
              <span>{tr('styleConfigPage.style')}</span>
              <span>{currentTpl?.name || '—'}</span>
            </li>
            <li>
              <span>{tr('styleConfigPage.character')}</span>
              <span>{tr('styleConfigPage.aiDecidesTemplateTopic')}</span>
            </li>
            <li>
              <span>{tr('styleConfigPage.voiceOver')}</span>
              <span>{selectedVoice?.label || tr('styleConfigPage.default')}</span>
            </li>
            <li>
              <span>{tr('styleConfigPage.aspectRatio')}</span>
              <span>{ratio}</span>
            </li>
            <li>
              <span>{tr('styleConfigPage.video')}</span>
              <span>{pipelineMode === 'image_text' ? tr('styleConfigPage.stillImageVideo') : tr('styleConfigPage.aiVideo')}</span>
            </li>
          </ul>
          {selectedVoice ? (
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm pf-btn-icon"
              style={{ marginTop: '0.75rem' }}
              disabled={busy || previewBusy === voiceKey(selectedVoice)}
              onClick={(e) => previewVoice(selectedVoice, e)}
            >
              <IconPlay size={14} />
              {playingId === voiceKey(selectedVoice)
                ? tr('styleConfigPage.stopPreview')
                : tr('styleConfigPage.preview2', { label: selectedVoice.label })}
            </button>
          ) : null}
          {error ? <BillingErrorNotice message={error} style={{ marginTop: '0.75rem' }} /> : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '0.75rem' }}
            disabled={busy || Boolean(previewBusy)}
            onClick={generate}
          >
            {busy ? tr('styleConfigPage.starting') : project.shots?.length ? tr('styleConfigPage.saveContinue') : tr('styleConfigPage.generateStoryboard')}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            {tr('styleConfigPage.generateShotScriptFirstAfter')}
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
