import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Clapperboard, LayoutGrid, LoaderCircle, Sparkles } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { DramaImageStyleModal } from '../../pages/drama/DramaImageStyleModal'
import { PROJECT_EPISODE_MAX, validateProjectCreate, type ProjectCreateConstraints, type ProjectCreateDraft, type ProjectCreateErrors, type ProjectCreateValues } from '../../lib/projectCreateForm'
import './project-create.css'
import { tr } from '../../i18n/translate.ts'
import { defaultDramaContentLanguage, dramaContentLanguageOptions } from '../../lib/dramaContentLanguage'

export type { ProjectCreateValues } from '../../lib/projectCreateForm'

export type ProjectCreateDialogProps = ProjectCreateConstraints & {
  open: boolean
  onClose: () => void
  onSubmit: (values: ProjectCreateValues) => Promise<void>
  contextLabel?: string
  allowImageStyle?: boolean
  submitLabel?: string
  footerNote?: string
}

/** 个人、团队和自由画布共用创建流程，关闭后清空草稿。 */
export default function ProjectCreateDialog({ open, ...props }: ProjectCreateDialogProps) {
  // Unmount the form on close so a new opening always starts with clean inputs.
  return open ? <ProjectCreateDialogForm key={`${props.kind}:${props.contextLabel || ''}`} {...props} /> : null
}

/** 故事与项目名称为主栏，集数和画风在旁栏统一配置。 */
function ProjectCreateDialogForm({
  onClose,
  onSubmit,
  kind,
  contextLabel = tr('projectCreateDialog.personalSpace'),
  titleRequired = false,
  titleMaxLength = 80,
  sourceMaxLength = 2000,
  allowImageStyle = true,
  submitLabel,
  footerNote,
}: Omit<ProjectCreateDialogProps, 'open'>) {
  const formId = useId()
  const canvas = kind === 'canvas'
  /* 保留集数输入原文，允许用户清空后重新输入；提交时统一校验。 */
  const [draft, setDraft] = useState<ProjectCreateDraft>({ title: canvas ? tr('projectCreateDialog.untitledCanvas') : '', source: '', description: '', imageStyleId: '', episodeCount: '1', contentLanguage: defaultDramaContentLanguage() })
  const [errors, setErrors] = useState<ProjectCreateErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const Icon = canvas ? LayoutGrid : Clapperboard
  const title = canvas ? tr('projectCreateDialog.newFreeCanvas') : tr('projectCreateDialog.newProject')
  const sourceLength = draft.source.trim().length

  /** 修改字段后清理对应错误，保留其他输入。 */
  function update<K extends keyof ProjectCreateDraft>(key: K, value: ProjectCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }))
    setError('')
  }

  /** 先校验并定位错误，再防重提交，失败时保留草稿。 */
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const result = validateProjectCreate(draft, { kind, titleRequired, titleMaxLength, sourceMaxLength })
    setErrors(result.errors)
    if (Object.keys(result.errors).length) {
      const field = Object.keys(result.errors)[0]
      const input = document.getElementById(`${formId}-${field}`)
      const details = input?.closest('details')
      if (details) details.open = true
      input?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try { await onSubmit(result.values) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('projectCreateDialog.couldNotCreatePleaseTry')) }
    finally { submitting.current = false; setBusy(false) }
  }

  const fieldError = (name: keyof ProjectCreateErrors) => errors[name] ? <span className="pf-project-create-field-error" id={`${formId}-${name}-error`} role="alert">{errors[name]}</span> : null

  return <Modal open onClose={onClose} dismissible={!busy} title={title} size="lg" className="pf-project-create-modal" footer={<>
    <p className="pf-project-create-footer-note">{footerNote || (canvas ? tr('projectCreateDialog.createCanvasFirstThenFreely') : tr('projectCreateDialog.createProjectStoryEpisodeCount'))}</p>
    <div className="pf-project-create-actions"><Button onClick={onClose} disabled={busy}>{tr('projectCreateDialog.cancel')}</Button><Button variant="lime" type="submit" form={formId} disabled={busy}>{busy ? <><LoaderCircle size={16} className="pf-project-create-spinner" />{tr('projectCreateDialog.creating')}</> : <>{submitLabel || (canvas ? tr('projectCreateDialog.createCanvas') : tr('projectCreateDialog.createProject'))}<ArrowUpRight size={16} /></>}</Button></div>
  </>}>
    <form id={formId} className="pf-project-create-form" onSubmit={submit} noValidate aria-busy={busy}>
      <div className="pf-project-create-intro">
        <span className="pf-project-create-icon"><Icon size={23} strokeWidth={1.6} aria-hidden /></span>
        <div><span className="pf-project-create-context">{contextLabel}{!canvas && <span className="pf-project-create-mode">{tr('projectCreateDialog.dramaSelfHostedCompute')}</span>}</span><h4>{canvas ? tr('projectCreateDialog.giveIdeasFreeCanvas') : tr('projectCreateDialog.startGoodStory')}</h4><p>{canvas ? tr('projectCreateDialog.putImagesVideosIdeasTogether') : tr('projectCreateDialog.writeStorySetEpisodeCount')}</p></div>
      </div>

      <div className={`pf-project-create-layout${canvas ? ' pf-project-create-layout--canvas' : ''}`}>
        <div className="pf-project-create-main">
          <label className="pf-project-create-field" htmlFor={`${formId}-title`}>
            <span className="pf-project-create-label">{canvas ? tr('projectCreateDialog.canvasName') : tr('projectCreateDialog.projectName')}{!canvas && !titleRequired && <small>{tr('projectCreateDialog.optionalLeftBlankNameGenerated')}</small>}</span>
            <input id={`${formId}-title`} autoFocus value={draft.title} disabled={busy} onChange={(event) => update('title', event.target.value)} placeholder={canvas ? tr('projectCreateDialog.nameCanvas') : tr('projectCreateDialog.eGLetterRainyNight')} maxLength={titleMaxLength} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${formId}-title-error` : undefined} required={canvas || titleRequired} />{fieldError('title')}
          </label>

          {!canvas && <label className="pf-project-create-field pf-project-create-story" htmlFor={`${formId}-source`}>
            <span className="pf-project-create-label">{tr('projectCreateDialog.story')}<span className="pf-project-create-required">{tr('projectCreateDialog.required')}</span></span>
            <textarea id={`${formId}-source`} value={draft.source} disabled={busy} onChange={(event) => update('source', event.target.value)} rows={8} placeholder={tr('projectCreateDialog.whoseStoryWhatSConflict')} maxLength={sourceMaxLength} aria-invalid={!!errors.source} aria-describedby={`${formId}-source-hint${errors.source ? ` ${formId}-source-error` : ''}`} required />
            <span className={`pf-project-create-input-meta${sourceLength >= 20 ? ' is-ready' : ''}`} id={`${formId}-source-hint`}><span>{sourceLength >= 20 ? <><Check size={13} />{tr('projectCreateDialog.storyReady')}</> : tr('projectCreateDialog.least20CharactersCharactersCore')}</span><span>{sourceLength.toLocaleString()} / {sourceMaxLength.toLocaleString()}</span></span>{fieldError('source')}
          </label>}

          <details className="pf-project-create-description" open={canvas || undefined}>
            <summary>{canvas ? tr('projectCreateDialog.canvasDescription') : tr('projectCreateDialog.addProjectDescription')}<span>{tr('projectCreateDialog.optional')}</span></summary>
            <label className="pf-project-create-field" htmlFor={`${formId}-description`}><span className="pf-project-create-sr-only">{canvas ? tr('projectCreateDialog.canvasDescription') : tr('projectCreateDialog.projectDescription')}</span><textarea id={`${formId}-description`} value={draft.description} onChange={(event) => update('description', event.target.value)} rows={3} maxLength={500} disabled={busy} placeholder={canvas ? tr('projectCreateDialog.whatWillCanvasExplore') : tr('projectCreateDialog.sumUpWorkSentenceTwo')} aria-invalid={!!errors.description} aria-describedby={errors.description ? `${formId}-description-error` : undefined} /><span className="pf-project-create-input-meta"><span>{tr('projectCreateDialog.shownProjectCard')}</span><span>{draft.description.trim().length} / 500</span></span>{fieldError('description')}</label>
          </details>
        </div>

        {!canvas && <aside className="pf-project-create-settings" aria-label={tr('projectCreateDialog.creationSettings')}>
          <div className="pf-project-create-episodes">
            <label className="pf-project-create-label" htmlFor={`${formId}-episodeCount`}>{tr('projectCreateDialog.startingEpisodes')}<small>1–{PROJECT_EPISODE_MAX} {tr('projectCreateDialog.episodes')}</small></label>
            <div className="pf-project-create-episode-presets" role="group" aria-label={tr('projectCreateDialog.commonEpisodeCounts')}>
              {[1, 3, 6, 12].map((count) => <button key={count} type="button" aria-pressed={Number(draft.episodeCount) === count} disabled={busy} onClick={() => update('episodeCount', String(count))}>{count}<span>{tr('projectCreateDialog.episodes')}</span></button>)}
            </div>
            <div className="pf-project-create-episode-input"><input id={`${formId}-episodeCount`} type="number" inputMode="numeric" min={1} max={PROJECT_EPISODE_MAX} step={1} value={draft.episodeCount} disabled={busy} onChange={(event) => update('episodeCount', event.target.value)} aria-invalid={!!errors.episodeCount} aria-describedby={`${formId}-episodeCount-hint${errors.episodeCount ? ` ${formId}-episodeCount-error` : ''}`} required /><span>{tr('projectCreateDialog.episodes')}</span></div>
            <p id={`${formId}-episodeCount-hint`}>{tr('projectCreateDialog.customCountsSupportedCanAdd')}</p>{fieldError('episodeCount')}
          </div>
          <div className="pf-project-create-style"><span className="pf-project-create-label">{tr('dramaContentLanguage.label')}</span><div className="pf-project-create-episode-presets" role="group" aria-label={tr('dramaContentLanguage.label')}>{dramaContentLanguageOptions().map((opt) => <button key={opt.value} type="button" aria-pressed={draft.contentLanguage === opt.value} disabled={busy} onClick={() => update('contentLanguage', opt.value)}>{opt.label}</button>)}</div><p>{tr('dramaContentLanguage.hint')}</p></div>
          {allowImageStyle && <div className="pf-project-create-style"><span className="pf-project-create-label"><Sparkles size={14} aria-hidden />{tr('projectCreateDialog.visualStyle')}<small>{tr('projectCreateDialog.optional')}</small></span><DramaImageStyleModal value={draft.imageStyleId} onChange={(value) => update('imageStyleId', value)} disabled={busy} variant="field" fieldLabel="" emptyLabel={tr('projectCreateDialog.chooseVisualStyle')} /><p>{tr('projectCreateDialog.setOneVisualDirectionCharacters')}</p></div>}
        </aside>}
      </div>
      {error && <div className="pf-project-create-error" role="alert">{error}</div>}
    </form>
  </Modal>
}
