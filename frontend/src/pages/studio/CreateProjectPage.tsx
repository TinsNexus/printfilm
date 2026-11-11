import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Clapperboard, Clock3, LoaderCircle, Save, Sparkles } from 'lucide-react'
import { api, type PipelineMode, type Project, type Template, type VoicePreset } from '../../api'
import AppShell from '../../components/layout/AppShell'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import Button from '../../components/ui/Button'
import Stepper from '../../components/ui/Stepper'
import { MediaCostNotice } from '../../components/billing/MediaCostNotice'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { creationTemplateId } from '../../lib/creationTemplates'
import { resolveShortVideoMediaSettings, shortVideoPipelineMode } from '../../lib/shortVideoSettings'
import { isRunning, kepuSteps } from '../../lib/status'
import { dialog } from '../../lib/dialog'
import './shortVideoCreate.css'
import { tr } from '../../i18n/translate.ts'

const EXAMPLES = ['给小学生讲讲为什么天空是蓝色的', '一只胆小的小猫在雨天遇见新朋友', '用轻松的方式介绍二十四节气里的霜降']

export default function CreateProjectPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = Number(params.get('project')) || null
  const requestedTemplate = creationTemplateId(params.get('template'))
  const requestedPipelineMode = shortVideoPipelineMode(params.get('mode'))
  const returnPath = `/studio/new${params.size ? `?${params}` : ''}`
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [templateId, setTemplateId] = useState(requestedTemplate)
  const [ratio, setRatio] = useState('9:16')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>(requestedPipelineMode)
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const [imageResolution, setImageResolution] = useState('')
  const [videoResolution, setVideoResolution] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [duration, setDuration] = useState(60)
  const [voice, setVoice] = useState('')
  const [mode, setMode] = useState<'idea' | 'copy'>('idea')
  const [idea, setIdea] = useState('')
  const [copy, setCopy] = useState('')
  const [title, setTitle] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(Boolean(editId))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [voiceError, setVoiceError] = useState(false)
  const working = useRef(false)
  const savedProject = useRef<Project | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    let disposed = false
    if (!localStorage.getItem('token')) {
      nav(`/auth?next=${encodeURIComponent(returnPath)}`, { replace: true })
      return
    }
    api.templates().then(rows => { if (!disposed) setTemplates(rows) }).catch(cause => { if (!disposed) setError(cause.message || tr('createProjectPage.failedLoadTemplates')) })
    api.voices().then(rows => { if (!disposed) setVoices(rows) }).catch(() => { if (!disposed) setVoiceError(true) })
    return () => { disposed = true }
  }, [nav, editId, returnPath])
  useEffect(() => {
    let disposed = false
    if (!editId) {
      savedProject.current = null
      setProject(null)
      setLoading(false)
      setTemplateId(requestedTemplate)
      setRatio('9:16')
      setPipelineMode(requestedPipelineMode)
      setImageModel('')
      setVideoModel('')
      setImageResolution('')
      setVideoResolution('')
      setDuration(60)
      setVoice('')
      setMode('idea')
      setIdea('')
      setCopy('')
      setTitle('')
      setStep(0)
      return
    }
    // 新建后更新 URL 时，保留当前输入与文案。
    if (savedProject.current?.id === editId) return
    setLoading(true)
    api.getProject(editId).then(value => {
      if (disposed) return
      if (value.creation_session_id) {
        nav(`/studio/sessions/${value.creation_session_id}?project=${value.id}`, { replace: true })
        return
      }
      savedProject.current = value
      setProject(value)
      setTemplateId(creationTemplateId(value.template_id))
      setRatio(value.output_ratio || '9:16')
      setPipelineMode(shortVideoPipelineMode(value.pipeline_mode))
      setImageModel(value.image_model || '')
      setVideoModel(value.video_model || '')
      setImageResolution(value.image_resolution || '')
      setVideoResolution(value.video_resolution || '')
      setDuration(value.target_duration_sec || 60)
      setVoice(value.voice_id || '')
      setTitle(value.title)
      setIdea(value.source_text)
      if (value.source_type === 'script') {
        setCopy(value.source_text)
        setMode('copy')
        setStep(1)
      } else setStep(0)
    }).catch(cause => { if (!disposed) setError(cause.message || tr('createProjectPage.failedLoadProject')) })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [editId, requestedTemplate, requestedPipelineMode, nav])

  const selectedTemplate = templates.find(item => item.id === templateId)
  const mediaSettings = resolveShortVideoMediaSettings(mediaCatalog, pipelineMode, { imageModel, videoModel, imageResolution, videoResolution, ratio }, project?.ref_image_url ? 3 : 2)
  const running = Boolean(project && (isRunning(project.status) || project.active_tasks?.some(task => ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review', 'cancel_requested'].includes(task.status))))
  const disabled = Boolean(busy || loading || running)
  function payload(text: string, name: string) {
    return {
      template_id: templateId, title: name.trim().slice(0, 200) || text.trim().slice(0, 30),
      source_type: 'script' as const, source_text: text.trim(),
      pipeline_mode: pipelineMode, resolution_mode: 'hd' as const,
      output_ratio: mediaSettings.ratio || ratio, target_duration_sec: duration, voice_id: voice,
      image_model: mediaSettings.imageModel, video_model: mediaSettings.videoModel,
      image_resolution: mediaSettings.imageResolution, video_resolution: mediaSettings.videoResolution,
    }
  }
  const draftFields = payload(copy, title)
  const draftChanged = Boolean(project && (
    project.title !== draftFields.title || project.source_text !== draftFields.source_text ||
    project.template_id !== templateId || project.output_ratio !== draftFields.output_ratio ||
    shortVideoPipelineMode(project.pipeline_mode) !== pipelineMode ||
    (project.target_duration_sec || 60) !== duration || (project.voice_id || '') !== voice ||
    (project.image_model || '') !== draftFields.image_model || (project.video_model || '') !== draftFields.video_model ||
    (project.image_resolution || '') !== draftFields.image_resolution || (project.video_resolution || '') !== draftFields.video_resolution
  ))
  const canSaveDraft = !project?.shots.length && !project?.final_video_url
  async function createDraft(text: string, name: string) {
    if (savedProject.current) return savedProject.current
    const value = await api.createProject(payload(text, name))
    savedProject.current = value
    if (mounted.current) {
      setProject(value)
      nav(`/studio/new?project=${value.id}`, { replace: true })
    }
    return value
  }
  async function saveDraft(text: string, name: string) {
    const old = savedProject.current
    if (!old) return createDraft(text, name)
    // Existing generated assets are changed only after the explicit restart confirmation.
    if (old.shots.length || old.final_video_url) return old
    const value = await api.updateProject(old.id, payload(text, name))
    savedProject.current = value
    if (mounted.current) setProject(value)
    return value
  }
  async function saveCopyDraft() {
    if (!copy.trim() || disabled || working.current || !selectedTemplate || !canSaveDraft) return
    working.current = true
    setBusy(tr('createProjectPage.savingDraft'))
    setError('')
    try {
      await saveDraft(copy, title)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tr('createProjectPage.failedSaveDraftPleaseTry'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }
  async function prepareCopy(event: FormEvent) {
    event.preventDefault()
    if (!idea.trim() || disabled || working.current || !selectedTemplate) return
    working.current = true
    setError('')
    setBusy(mode === 'idea' ? tr('createProjectPage.writingScript') : tr('createProjectPage.savingScript'))
    try {
      const result = mode === 'copy'
        ? { title: title || idea.trim().slice(0, 30), content: idea.trim() }
        : await api.expandContent(`${idea.trim()}\n\n创作要求：约 ${duration} 秒，${selectedTemplate.name} 风格，普通话旁白。请写可直接配音的完整文案，保持内容与时长匹配。`, 'script')
      if (!mounted.current) return
      setCopy(result.content)
      setTitle(result.title)
      setStep(1)
      await saveDraft(result.content, result.title)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tr('createProjectPage.scriptGenerationFailedPleaseTry'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }
  async function generateStoryboard() {
    if (!copy.trim() || disabled || working.current || !selectedTemplate) return
    if (!mediaSettings.ready) {
      setError(tr('createProjectPage.currentModelUnavailableDoesNot'))
      return
    }
    working.current = true
    try {
      const old = savedProject.current
      if (old?.shots.length) {
        const confirmed = await dialog.confirm({ title: tr('createProjectPage.regenerateShots'), message: tr('createProjectPage.newScriptSettingsWillRegenerate'), confirmText: tr('createProjectPage.regenerate'), tone: 'danger' })
        if (!confirmed || !mounted.current) return
      }
      setBusy(tr('createProjectPage.savingGeneratingShots'))
      setError('')
      let value = await createDraft(copy, title)
      value = await api.updateProject(value.id, payload(copy, title))
      savedProject.current = value
      setProject(value)
      await api.generate(value.id, { restart: Boolean(value.shots.length) })
      if (mounted.current) nav(`/studio/${value.id}`)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tr('createProjectPage.shotGenerationFailedPleaseTry'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }

  return <AppShell active="studio">
    <div className="sv-create-page">
      <header className="sv-create-header">
        <div><Link className="sv-back" to="/history"><ArrowLeft size={16} /> {tr('createProjectPage.myShorts')}</Link><h1>{editId ? tr('createProjectPage.editShort') : tr('createProjectPage.createShort')}</h1><p>{tr('createProjectPage.startIdeaCanReviewAdjust')}</p></div>
        <Stepper steps={kepuSteps(pipelineMode)} current={pipelineMode === 'full' && step === 1 ? 2 : step} />
      </header>
      {error && <BillingErrorNotice message={error} />}
      {loading ? <div className="sv-loading"><LoaderCircle className="sv-spin" size={20} /> {tr('createProjectPage.loadingProjects')}</div> : <>
        {running && <div className="sv-running-note">{tr('createProjectPage.projectProductionCheckProgressStop')}<Link to={`/studio/${project!.id}`}>{tr('createProjectPage.openWorkspace')} <ArrowRight size={15} /></Link></div>}
        <div className="sv-create-grid">
          <main>
            {step === 0 ? <form onSubmit={prepareCopy}>
              <section className="sv-panel">
                <div className="sv-section-heading"><span>01</span><div><h2>{tr('createProjectPage.chooseVisualStyle')}</h2><p>{tr('createProjectPage.fourAnimationIllustrationStylesImages')}</p></div></div>
                <div className="sv-style-grid" role="group" aria-label={tr('createProjectPage.visualStyle')}>
                  {templates.map(item => <button key={item.id} type="button" className={`sv-style-card${item.id === templateId ? ' is-selected' : ''}`} disabled={disabled} aria-pressed={item.id === templateId} onClick={() => setTemplateId(item.id)}>
                    <img src={api.assetUrl(item.preview_cover)} alt="" /><div><strong>{item.name}</strong><p>{item.description}</p></div>
                    {item.id === templateId && <span className="sv-style-check"><Check size={14} /></span>}
                  </button>)}
                </div>
              </section>
              <section className="sv-panel">
                <div className="sv-section-heading"><span>02</span><div><h2>{tr('createProjectPage.whatDoWantSay')}</h2><p>{tr('createProjectPage.describeTopicAudienceKeyPoints')}</p></div></div>
                <div className="sv-input-tabs"><button type="button" className={mode === 'idea' ? 'is-active' : ''} onClick={() => setMode('idea')} disabled={disabled}>{tr('createProjectPage.enterIdea')}</button><button type="button" className={mode === 'copy' ? 'is-active' : ''} onClick={() => setMode('copy')} disabled={disabled}>{tr('createProjectPage.iHaveScript')}</button></div>
                <label className="sv-field"><span>{mode === 'idea' ? tr('createProjectPage.shortIdea') : tr('createProjectPage.fullScript')}</span><textarea aria-label={mode === 'idea' ? tr('createProjectPage.shortIdea') : tr('createProjectPage.fullScript')} value={idea} onChange={event => setIdea(event.target.value)} rows={6} maxLength={20000} disabled={disabled} placeholder={mode === 'idea' ? tr('createProjectPage.eGExplainPrimarySchool') : tr('createProjectPage.pasteScriptCanVoicedCan')} required /></label>
                {mode === 'idea' && <div className="sv-examples">{EXAMPLES.map(example => <button type="button" key={example} onClick={() => setIdea(example)} disabled={disabled}>{example}</button>)}</div>}
                <div className="sv-actions"><span>{tr('createProjectPage.canEditScriptAfterS')}</span><div className="sv-action-buttons">{copy.trim() && <Button variant="outline" disabled={disabled} onClick={() => setStep(1)}>{tr('createProjectPage.editExistingScript')}</Button>}<Button type="submit" variant="lime" disabled={disabled || !idea.trim() || !selectedTemplate}>{busy ? <LoaderCircle size={16} className="sv-spin" /> : <Sparkles size={16} />}{busy || (mode === 'idea' ? tr('createProjectPage.writeScript') : tr('createProjectPage.nextReviewScript'))}<ArrowRight size={16} /></Button></div></div>
              </section>
            </form> : <section className="sv-panel">
              <div className="sv-section-heading"><span>02</span><div><h2>{tr('createProjectPage.reviewScriptThenGenerateShots')}</h2><p>{tr('createProjectPage.scriptBecomesNarrationConfirmThen')}</p></div></div>
              <label className="sv-field"><span>{tr('createProjectPage.shortTitle')}</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} disabled={disabled} /></label>
              <label className="sv-field"><span>{tr('createProjectPage.narrationScript')} <small>{copy.length} {tr('createProjectPage.chars')}</small></span><textarea aria-label={tr('createProjectPage.narrationScript')} value={copy} onChange={event => setCopy(event.target.value)} rows={13} maxLength={20000} disabled={disabled} /></label>
              <div className="sv-actions"><Button variant="outline" disabled={disabled} onClick={() => setStep(0)}><ArrowLeft size={15} /> {tr('createProjectPage.backEdit')}</Button><div className="sv-action-buttons">{canSaveDraft && <Button variant="outline" disabled={disabled || !copy.trim() || !selectedTemplate || Boolean(project && !draftChanged)} onClick={() => { void saveCopyDraft() }}><Save size={15} />{tr('createProjectPage.saveDraft')}</Button>}<Button variant="lime" disabled={disabled || !copy.trim() || !selectedTemplate} onClick={() => { void generateStoryboard() }}>{busy ? <LoaderCircle size={16} className="sv-spin" /> : <Clapperboard size={16} />}{busy || tr('createProjectPage.generateShotScript')}<ArrowRight size={16} /></Button></div></div>
              {project && <p className="sv-saved-note">{draftChanged ? canSaveDraft ? tr('createProjectPage.haveUnsavedChangesSaveDraft') : tr('createProjectPage.changesSavedWhenRegenerateShots') : canSaveDraft ? tr('createProjectPage.draftSaved') : tr('createProjectPage.projectScriptLoaded')}<Link to={`/studio/${project.id}`}>{tr('createProjectPage.openProjectWorkspace')}</Link></p>}
            </section>}
          </main>
          <aside className="sv-panel sv-settings">
            <h2>{tr('createProjectPage.shortSettings')}</h2><p>{tr('createProjectPage.startDefaultsAdjustNeeded')}</p>
            <div className="sv-field"><span>{tr('createProjectPage.productionMode')}</span><div className="sv-output-modes" role="group" aria-label={tr('createProjectPage.productionMode')}>{([{ id: 'full', label: tr('createProjectPage.aiVideo'), desc: tr('createProjectPage.referenceImagesImageVideoCompose') }, { id: 'image_text', label: tr('createProjectPage.stillImageVideo'), desc: tr('createProjectPage.referenceImagesImageCameraMoves') }] as const).map(item => <button key={item.id} type="button" className={pipelineMode === item.id ? 'is-selected' : ''} aria-pressed={pipelineMode === item.id} disabled={disabled} onClick={() => setPipelineMode(item.id)}><strong>{item.label}</strong><span>{item.desc}</span>{pipelineMode === item.id && <Check size={14} />}</button>)}</div></div>
            <label className="sv-field"><span>{tr('createProjectPage.aspectRatio')}</span><select value={mediaSettings.ratio} onChange={event => setRatio(event.target.value)} disabled={disabled || !mediaSettings.ratios.length}>{!mediaSettings.ratios.length && <option value="">{tr('createProjectPage.noAspectRatioSupportedBoth')}</option>}{mediaSettings.ratios.map(value => <option key={value} value={value}>{value}{value === '9:16' ? tr('createProjectPage.portrait') : value === '16:9' ? tr('createProjectPage.landscape') : value === '1:1' ? tr('createProjectPage.square') : ''}</option>)}</select></label>
            <label className="sv-field"><span>{tr('createProjectPage.targetLength')}</span><select value={duration} onChange={event => setDuration(Number(event.target.value))} disabled={disabled}>{[...new Set([30, 60, 90, 120, 180, duration])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{tr('createProjectPage.about')} {value} {tr('createProjectPage.s')}</option>)}</select></label>
            {pipelineMode === 'image_text' ? <>
              <label className="sv-field"><span>{tr('createProjectPage.narrationVoice')}</span><select value={voice} onChange={event => setVoice(event.target.value)} disabled={disabled}><option value="">{tr('createProjectPage.defaultMandarinVoice')}</option>{voice && !voices.some(item => (item.speaker || item.id) === voice) && <option value={voice}>{tr('createProjectPage.projectSOriginalVoice')}</option>}{voices.map(item => <option key={item.id} value={item.speaker || item.id}>{item.label}</option>)}</select></label>
              {voiceError && <p className="sv-saved-note">{tr('createProjectPage.voiceListIsnTLoaded')}</p>}
            </> : <p className="sv-saved-note">{tr('createProjectPage.videoModelGeneratesNarrationSound')}</p>}
            <details className="sv-model-settings" open={pipelineMode === 'full'}><summary>{tr('createProjectPage.modelsQuality')}</summary>
              <label className="sv-field"><span>{tr('createProjectPage.referenceImageModel')}</span><select value={mediaSettings.imageModel} disabled={disabled || !mediaSettings.imageOptions.length} onChange={event => setImageModel(event.target.value)}>{mediaSettings.imageSelectionUnavailable && <option value={mediaSettings.imageModel} disabled>{mediaSettings.imageModel}{tr('createProjectPage.unavailable')}</option>}{!mediaSettings.imageOptions.length && !mediaSettings.imageSelectionUnavailable && <option value="">{mediaCatalog ? tr('createProjectPage.noReferenceImageModelsAvailable') : tr('createProjectPage.loadingModels')}</option>}{mediaSettings.imageOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="sv-field"><span>{tr('createProjectPage.imageQuality')}</span><select value={mediaSettings.imageResolution} disabled={disabled || !mediaSettings.imageResolutions.length} onChange={event => setImageResolution(event.target.value)}>{!mediaSettings.imageResolutions.length && <option value={mediaSettings.imageResolution}>{mediaSettings.imageResolution || tr('createProjectPage.chooseAvailableModel')}</option>}{mediaSettings.imageResolutions.map(value => <option key={value} value={value}>{value}</option>)}</select><MediaCostNotice modelId={mediaSettings.imageModel} resolution={mediaSettings.imageResolution} /></label>
              {pipelineMode === 'full' && <><label className="sv-field"><span>{tr('createProjectPage.imageVideoModel')}</span><select value={mediaSettings.videoModel} disabled={disabled || !mediaSettings.videoOptions.length} onChange={event => setVideoModel(event.target.value)}>{mediaSettings.videoSelectionUnavailable && <option value={mediaSettings.videoModel} disabled>{mediaSettings.videoModel}{tr('createProjectPage.unavailable')}</option>}{!mediaSettings.videoOptions.length && !mediaSettings.videoSelectionUnavailable && <option value="">{mediaCatalog ? tr('createProjectPage.noImageVideoModelsAvailable') : tr('createProjectPage.loadingModels')}</option>}{mediaSettings.videoOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className="sv-field"><span>{tr('createProjectPage.videoQuality')}</span><select value={mediaSettings.videoResolution} disabled={disabled || !mediaSettings.videoResolutions.length} onChange={event => setVideoResolution(event.target.value)}>{!mediaSettings.videoResolutions.length && <option value={mediaSettings.videoResolution}>{mediaSettings.videoResolution || tr('createProjectPage.chooseAvailableModel')}</option>}{mediaSettings.videoResolutions.map(value => <option key={value} value={value}>{value}</option>)}</select><MediaCostNotice modelId={mediaSettings.videoModel} resolution={mediaSettings.videoResolution} seconds={1} /></label></>}
              {mediaCatalog && !mediaSettings.ready && <p className="sv-model-error" role="status">{tr('createProjectPage.chooseAvailableModelsAgainImage')} {project?.ref_image_url ? 3 : 2} {tr('createProjectPage.referenceImages')}{pipelineMode === 'full' ? tr('createProjectPage.videoModelMustSupport2') : ''}{tr('createProjectPage.confirmQualityAspectRatio')}</p>}
            </details>
            <div className="sv-setting-summary"><Clapperboard size={17} /><div><strong>{selectedTemplate?.name || tr('createProjectPage.n3dAnimation')}</strong><span>{pipelineMode === 'full' ? tr('createProjectPage.imageVideo') : tr('createProjectPage.imageCameraMoves')} {tr('createProjectPage.mandarinNarrationChineseSubtitles')}</span><span>{tr('createProjectPage.usesStyleReferencePreviousShot')}</span></div></div>
            <div className="sv-workflow-hint"><Clock3 size={17} /><p>{pipelineMode === 'full' ? tr('createProjectPage.afterConfirmingShotsReferenceImages') : tr('createProjectPage.reviewShotsThenGenerateImages')}</p></div>
          </aside>
        </div>
      </>}
    </div>
  </AppShell>
}
