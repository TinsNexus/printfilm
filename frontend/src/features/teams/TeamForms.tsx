import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, UsersRound } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import ProjectCreateDialog, { type ProjectCreateValues } from '../../components/projects/ProjectCreateDialog'
import { useTeamPreview } from './useTeamPreview'
import { TEAM_COLORS } from './types'
import { tr } from '../../i18n/translate.ts'

/** 创建真实团队，服务端确认后进入团队空间。 */
export function CreateTeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createTeam } = useTeamPreview()
  const navigate = useNavigate()
  /* name 团队名称；description 介绍；color 标识色；error 表单校验反馈。 */
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(TEAM_COLORS[0])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setName(''); setDescription(''); setColor(TEAM_COLORS[0]); setError('') } }, [open])

  /** 校验并创建空白团队，直接进入工作台。 */
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const id = await createTeam({ name, description, color })
      onClose()
      navigate(`/teams/${id}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamForms.couldNotCreatePleaseTry')) }
    finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} dismissible={!busy} title={tr('teamForms.createTeam')}>
    <form className="pf-team-form" onSubmit={submit}>
      <div className="pf-team-form-intro"><span className="pf-team-mark" style={{ background: color }}><UsersRound size={24} /></span><div><strong>{tr('teamForms.turnIdeasIntoTeamWork')}</strong><p>{tr('teamForms.willTeamOwnerCanThen')}</p></div></div>
      <label className="pf-team-field">{tr('teamForms.teamName')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder={tr('teamForms.eGGreenFieldStudio')} required /></label>
      <label className="pf-team-field">{tr('teamForms.teamDescription')} <span className="pf-team-muted">{tr('teamForms.optional')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder={tr('teamForms.whatDoWantMakeTogether')} rows={3} /></label>
      <fieldset className="pf-team-colors"><legend>{tr('teamForms.badgeColor')}</legend>{TEAM_COLORS.map((item, index) => <button key={item} type="button" style={{ background: item }} aria-label={tr('teamForms.chooseBadgeColor', { n: index + 1 })} aria-pressed={color === item} onClick={() => setColor(item)}>{color === item && <Check size={16} />}</button>)}</fieldset>
      <p className="pf-team-form-note">{tr('teamForms.teamHasItsOwnProjects')}</p>
      {error && <p className="pf-team-alert" role="alert">{error}</p>}
      <div className="pf-team-modal-actions"><Button onClick={onClose}>{tr('teamForms.cancel')}</Button><Button variant="lime" type="submit" disabled={busy}>{tr('teamForms.createTeam')} <ArrowUpRight size={16} /></Button></div>
    </form>
  </Modal>
}

/** 在明确的团队归属下创建真实漫剧项目。 */
export function CreateTeamProjectModal({ open, onClose, teamId }: { open: boolean; onClose: () => void; teamId: string }) {
  const { createProject } = useTeamPreview()
  const navigate = useNavigate()

  async function submit(values: ProjectCreateValues) {
    const id = await createProject(teamId, { title: values.title, description: values.description, source: values.source, episodes: values.episodeCount })
    onClose()
    navigate(`/drama/projects/${id}`)
  }

  return <ProjectCreateDialog key={teamId} open={open} onClose={onClose} kind="drama" contextLabel={tr("teamForms.teamProjectLabel")} titleRequired titleMaxLength={60} sourceMaxLength={100000} allowImageStyle={false} onSubmit={submit} footerNote={tr("teamForms.createNote")} />
}
