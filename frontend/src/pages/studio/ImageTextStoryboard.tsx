import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clapperboard, Download, Pause, Pencil, RefreshCw, Volume2 } from 'lucide-react'
import { api, type Project, type Shot, type Template } from '../../api'
import { ProjectCard, ProjectGrid } from '../../components/projects/ProjectCard'
import { IMAGE_TEXT_STEPS, imageTextAssetReadiness, imageTextBoardStep, imageTextNextAction } from '../../lib/imageTextStoryboard'
import { formatMmSs, isProjectWideBusy, isShotGenerating, statusLabel } from '../../lib/status'
import { shotDisplayDurationSec } from '../../lib/segmentDuration'
import { scenePromptForDisplay } from '../../promptDisplay'
import './imageTextStoryboard.css'
import { tr } from '../../i18n/translate.ts'

type Props = {
  project: Project
  template: Template | null
  busy: boolean
  running: boolean
  busyShotIds: Set<number>
  onBack: () => void
  onSettings: () => void
  onGenerate: () => void
  onCompose: () => void
  onCancel: () => void
  onRestart: () => void
  onExport: () => void
  onDownload: () => void
  onEditor: () => void
  onEditShot: (shot: Shot, focus?: string) => void
  onPreviewShot: (shot: Shot) => void
  onRegenImage: (shot: Shot) => void
  onRegenAudio: (shot: Shot) => void
}

export default function ImageTextStoryboard({ project, template, busy, running, busyShotIds, onBack, onSettings, onGenerate, onCompose, onCancel, onRestart, onExport, onDownload, onEditor, onEditShot, onPreviewShot, onRegenImage, onRegenAudio }: Props) {
  const stage = imageTextBoardStep(project)
  // Remember a previous view only while the production stage is unchanged.
  const [view, setView] = useState<{ stage: number; step: number } | null>(null)
  const step = view?.stage === stage ? view.step : stage
  const readiness = imageTextAssetReadiness(project)
  const nextAction = imageTextNextAction(project)
  const shots = [...project.shots].sort((a, b) => a.shot_no - b.shot_no)
  const duration = shots.reduce((sum, shot) => sum + shotDisplayDurationSec(shot), 0)
  const targetDuration = project.target_duration_sec || 60
  const audioShot = shots.find((shot) => shot.audio_url)
  const cancelling = Boolean(project.active_tasks?.some((task) => task.cancel_requested))
  const failed = ['FAILED', 'CANCELLED', 'REJECTED'].includes(project.status)
  const locked = busy || running
  const actionLabel = nextAction === 'script' ? tr('studioImageTextStoryboard.generateShotScript') : nextAction === 'assets'
    ? readiness.images || readiness.audio ? tr('studioImageTextStoryboard.generateMissingMaterial') : tr('studioImageTextStoryboard.confirmShotsGenerateVisualsVoice')
    : nextAction === 'compose' ? tr('studioImageTextStoryboard.nextComposeVideo') : tr('studioImageTextStoryboard.viewVideo')
  function next() {
    if (nextAction === 'preview') setView({ stage, step: 3 })
    else if (nextAction === 'compose') onCompose()
    else onGenerate()
  }

  return (
    <div className="pf-image-storyboard">
      <header className="pf-is-header">
        <div>
          <button type="button" className="pf-back" onClick={onBack}><ArrowLeft size={16} />{tr('studioImageTextStoryboard.myShorts')}</button>
          <h1>{project.title}</h1>
          <p>{template?.name || tr('studioImageTextStoryboard.animatedShort')}<span>·</span>{project.output_ratio || '9:16'}<span>·</span>{tr('studioImageTextStoryboard.targetAbout')} {targetDuration} {tr('studioImageTextStoryboard.s')}{shots.length ? <><span>·</span>{shots.length} {tr('studioImageTextStoryboard.shots')} {formatMmSs(duration)}</> : null}</p>
        </div>
        <div className="pf-is-header-actions">
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={locked} onClick={onSettings}><Pencil size={14} />{tr('studioImageTextStoryboard.editCreationSettings')}</button>
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={!shots.length || locked} onClick={onEditor}>{tr('studioImageTextStoryboard.openEditor')}</button>
        </div>
      </header>

      <nav className="pf-is-steps" aria-label={tr('studioImageTextStoryboard.shortCreationSteps')}>
        {IMAGE_TEXT_STEPS.map((item, index) => (
          <button key={item.key} type="button" className={`${step === index ? 'is-current' : ''} ${index < stage ? 'is-complete' : ''}`}
            aria-current={step === index ? 'step' : undefined}
            disabled={index > stage || (index === 0 && locked)}
            onClick={() => index === 0 ? onSettings() : setView({ stage, step: index })}>
            <span>{index < stage ? <Check size={16} /> : index + 1}</span><strong>{item.label}</strong>
          </button>
        ))}
      </nav>

      {running ? (
        <section className="pf-is-progress" aria-live="polite">
          <div><strong>{cancelling ? tr('studioImageTextStoryboard.stoppingPleaseWait') : statusLabel(project)}</strong><p>{tr('studioImageTextStoryboard.progressSavesAutomaticallyCanLeave')}</p></div>
          <div className="pf-is-progress-track"><span style={{ width: `${Math.max(2, Math.min(100, project.progress))}%` }} /></div>
          <span>{project.progress}%</span>
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={busy || cancelling} onClick={onCancel}><Pause size={14} />{tr('studioImageTextStoryboard.stop')}</button>
        </section>
      ) : failed ? <p className="pf-is-resume-note">{project.status === 'CANCELLED' ? tr('studioImageTextStoryboard.productionStopped') : tr('studioImageTextStoryboard.stageDidNotFinish')}{tr('studioImageTextStoryboard.finishedMaterialSavedCanContinue')}</p> : null}

      {step === 1 ? (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 02</span><h2>{tr('studioImageTextStoryboard.confirmScriptShots')}</h2><p>{tr('studioImageTextStoryboard.reviewEachShotAdjustNarration')}</p></div><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={!shots.length} onClick={onExport}><Download size={14} />{tr('studioImageTextStoryboard.exportScript')}</button></div>
          <details className="pf-is-copy" open={!shots.length}><summary>{tr('studioImageTextStoryboard.fullScript')} <span>{project.source_text.length} {tr('studioImageTextStoryboard.chars')}</span></summary><p>{project.source_text}</p></details>
          {shots.length ? <ProjectGrid className="pf-is-script-grid">
            {shots.map((shot) => {
              const shotBusy = locked || busyShotIds.has(shot.id) || isShotGenerating(project, shot.id)
              return <article key={shot.id} className="pf-is-script-card">
                <header><span>{tr('studioImageTextStoryboard.shot')} {String(shot.shot_no).padStart(2, '0')}</span><span>{formatMmSs(shotDisplayDurationSec(shot))}</span></header>
                <h3>{shot.overlay_title || tr('studioImageTextStoryboard.scene', { shot_no: shot.shot_no })}</h3>
                <div className="pf-is-script-field"><label>{tr('studioImageTextStoryboard.narration')}</label><p>{shot.narration || tr('studioImageTextStoryboard.noNarrationYetClickEdit')}</p></div>
                <div className="pf-is-script-field"><label>{tr('studioImageTextStoryboard.visuals')}</label><p>{scenePromptForDisplay(shot.img_prompt) || tr('studioImageTextStoryboard.noVisualDescription')}</p></div>
                <footer><button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot, 'narration')}><Pencil size={13} />{tr('studioImageTextStoryboard.editNarration')}</button><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot)}>{tr('studioImageTextStoryboard.editShot')}</button></footer>
              </article>
            })}
          </ProjectGrid> : <div className="pf-is-empty"><Clapperboard size={38} /><h3>{running ? tr('studioImageTextStoryboard.splittingScriptIntoShots') : tr('studioImageTextStoryboard.scriptReady')}</h3><p>{running ? tr('studioImageTextStoryboard.onceGeneratedEachShotAppears') : tr('studioImageTextStoryboard.clickButtonBelowGenerateShot')}</p></div>}
        </section>
      ) : step === 2 ? (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 03</span><h2>{tr('studioImageTextStoryboard.reviewVisualsVoiceOver')}</h2><p>{tr('studioImageTextStoryboard.visuals')} {readiness.images}/{readiness.total} {tr('studioImageTextStoryboard.voiceOver')} {readiness.audio === readiness.total && readiness.total ? tr('studioImageTextStoryboard.done') : tr('studioImageTextStoryboard.pending')}{tr('studioImageTextStoryboard.onceAllVisualsAudioSounds')}</p></div></div>
          <div className="pf-is-audio"><div><Volume2 size={22} /><div><strong>{tr('studioImageTextStoryboard.fullNarration')}</strong><p>{tr('studioImageTextStoryboard.visualsTimedActualVoiceOver')}</p></div></div>{audioShot?.audio_url ? <audio aria-label={tr('studioImageTextStoryboard.playFullNarration')} controls preload="metadata" src={api.assetUrl(audioShot.audio_url, project.updated_at)} /> : <span className="pf-muted">{running ? tr('studioImageTextStoryboard.generatingVoiceOver') : tr('studioImageTextStoryboard.waitingVoiceOver')}</span>}<button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={locked || !shots.length} onClick={() => onRegenAudio(shots[0])}><RefreshCw size={13} />{tr('studioImageTextStoryboard.reRecordVoiceOver')}</button></div>
          <ProjectGrid>
            {shots.map((shot) => {
              const generating = busyShotIds.has(shot.id) || isShotGenerating(project, shot.id)
              const shotBusy = busy || isProjectWideBusy(project) || generating
              const imageReady = Boolean(shot.image_url)
              return <ProjectCard key={shot.id} className="pf-is-media-card" kind="drama" title={shot.overlay_title || tr('studioImageTextStoryboard.scene', { shot_no: shot.shot_no })} category={tr('studioImageTextStoryboard.shot2', { p: String(shot.shot_no).padStart(2, '0'), formatMmSs: formatMmSs(shotDisplayDurationSec(shot)) })}
                coverUrl={shot.image_url ? api.assetUrl(shot.image_url, shot.version) : undefined}
                status={{ label: generating ? tr('studioImageTextStoryboard.generating') : imageReady ? tr('studioImageTextStoryboard.visualReady') : shot.status === 'FAILED' ? tr('studioImageTextStoryboard.generationFailed') : tr('studioImageTextStoryboard.notGenerated'), tone: generating ? 'producing' : imageReady ? 'completed' : 'draft' }}
                description={shot.narration} meta={<span>{shot.audio_url ? tr('studioImageTextStoryboard.voiceOverReady') : tr('studioImageTextStoryboard.waitingVoiceOver2')}</span>}
                onOpen={() => onPreviewShot(shot)} openLabel={tr('studioImageTextStoryboard.previewShot', { shot_no: shot.shot_no })}
                actions={<><button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot)}>{tr('studioImageTextStoryboard.edit')}</button><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={shotBusy} onClick={() => onRegenImage(shot)}><RefreshCw size={12} />{imageReady ? tr('studioImageTextStoryboard.redrawVisual') : tr('studioImageTextStoryboard.generateVisual')}</button></>} />
            })}
          </ProjectGrid>
        </section>
      ) : (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 04</span><h2>{project.final_video_url ? tr('studioImageTextStoryboard.shortReady') : tr('studioImageTextStoryboard.composeShort')}</h2><p>{tr('studioImageTextStoryboard.imageCameraMovesNarrationSubtitles')}</p></div></div>
          {project.final_video_url ? <div className="pf-is-final"><div className="pf-is-final-player"><video controls preload="metadata" src={api.assetUrl(project.final_video_url, project.updated_at)} poster={project.cover_url ? api.assetUrl(project.cover_url) : undefined} /></div><div><span className="pf-is-complete"><Check size={15} />{tr('studioImageTextStoryboard.finished')}</span><h3>{project.title}</h3><p>{project.output_ratio || '9:16'} {tr('studioImageTextStoryboard.mp4VoiceOverSubtitles')}</p><button type="button" className="pf-btn pf-btn-lime" disabled={busy} onClick={onDownload}><Download size={16} />{busy ? tr('studioImageTextStoryboard.processing') : tr('studioImageTextStoryboard.downloadVideo')}</button><button type="button" className="pf-btn pf-btn-outline" disabled={locked} onClick={() => setView({ stage, step: 2 })}>{tr('studioImageTextStoryboard.backEditMaterial')}</button><button type="button" className="pf-btn pf-btn-ghost" disabled={locked || !readiness.ready} onClick={onCompose}>{tr('studioImageTextStoryboard.recomposeCurrentMaterial')}</button></div></div>
            : <div className="pf-is-empty"><Clapperboard size={42} /><h3>{running ? tr('studioImageTextStoryboard.composingVideo') : tr('studioImageTextStoryboard.readyCompose')}</h3><p>{running ? tr('studioImageTextStoryboard.arrangingCameraMovesSyncingVoice') : tr('studioImageTextStoryboard.confirmVisualsVoiceOverStart')}</p></div>}
        </section>
      )}

      <footer className="pf-is-next">
        <div><strong>{running ? cancelling ? tr('studioImageTextStoryboard.stoppingProduction') : tr('studioImageTextStoryboard.stepProgress') : nextAction === 'preview' ? tr('studioImageTextStoryboard.videoSaved') : actionLabel}</strong><p>{running ? tr('studioImageTextStoryboard.stopsStageWhenDoneWaiting') : nextAction === 'assets' && (readiness.images || readiness.audio) ? tr('studioImageTextStoryboard.reusesFinishedMaterialFillsRest') : nextAction === 'compose' ? tr('studioImageTextStoryboard.imagesVoiceOverReadyNext') : tr('studioImageTextStoryboard.canReviewAdjustEveryStep')}</p></div>
        <div className="pf-is-next-buttons">{step > 1 ? <button type="button" className="pf-btn pf-btn-outline" onClick={() => setView({ stage, step: step - 1 })}><ArrowLeft size={14} />{tr('studioImageTextStoryboard.back')}</button> : <button type="button" className="pf-btn pf-btn-ghost" disabled={locked} onClick={onRestart}><RefreshCw size={14} />{tr('studioImageTextStoryboard.regenerateShots')}</button>}{nextAction === 'preview' && step === 3 ? null : <button type="button" className="pf-btn pf-btn-lime" disabled={locked} onClick={step === 1 && stage > 1 ? () => setView({ stage, step: 2 }) : next}>{running ? tr('studioImageTextStoryboard.production') : step === 1 && stage > 1 ? tr('studioImageTextStoryboard.nextVisualsVoiceOver') : actionLabel}<ArrowRight size={16} /></button>}</div>
      </footer>
    </div>
  )
}
