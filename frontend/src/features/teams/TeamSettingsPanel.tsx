import { useState, type FormEvent } from 'react'
import { ArrowRightLeft, Check, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { dialog } from '../../lib/dialog'
import { useTeamPreview } from './useTeamPreview'
import { teamsApi } from '../../api/teams'
import { useTeamPage } from './useTeamPage'
import { TeamPagination } from './TeamPagination'
import { TEAM_COLORS, type PreviewTeam, type TeamRole } from './types'
import { tr } from '../../i18n/translate.ts'

/** 团队资料与所有权管理；真实权限仍需后续服务端校验。 */
export default function TeamSettingsPanel({ team, role }: { team: PreviewTeam; role: TeamRole }) {
  const { updateTeam, transferOwnership, leaveTeam, deleteTeam } = useTeamPreview()
  const navigate = useNavigate()
  /* name/description/color 编辑草稿；success/error 提交反馈；target 所有权转让对象。 */
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)
  const [color, setColor] = useState(team.color)
  const [target, setTarget] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [memberPage, setMemberPage] = useState(1)
  const candidates = useTeamPage(`${team.id}:owner-candidates:${memberQuery}:${memberPage}`, (signal) => role === 'owner' ? teamsApi.members(team.id, { page: memberPage, page_size: 12, q: memberQuery }, signal) : Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 12 } }))

  /** 保存资料并在页面内给出可感知反馈。 */
  async function save(event: FormEvent) {
    event.preventDefault()
    try { await updateTeam(team.id, { name, description, color }); setSuccess(true); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamSettingsPanel.saveFailed')) }
  }

  /** 转让前明确说明权限变化。 */
  async function transfer() {
    const member = candidates.items.find((item) => item.id === target)
    if (!member) { setError(tr("teamSettingsPanel.errChooseMember")); return }
    if (!await dialog.confirm({ title: tr("teamSettingsPanel.transferTitle"), message: tr('teamSettingsPanel.transferConfirmMessage', { name: member.name }), confirmText: tr("teamSettingsPanel.confirmTransfer"), tone: 'danger' })) return
    try { await transferOwnership(team.id, target); setTarget(''); setError(''); setSuccess(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamSettingsPanel.transferFailed')) }
  }

  /** 成员退出撤销真实团队访问，保留团队项目与账单。 */
  async function leave() {
    if (!await dialog.confirm({ title: tr('teamSettingsPanel.leaveTeam'), message: tr('teamSettingsPanel.afterLeavingWillLoseAccess', { name: team.name }), confirmText: tr('teamSettingsPanel.leaveTeam'), tone: 'danger' })) return
    try { await leaveTeam(team.id); navigate('/teams') }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamSettingsPanel.couldNotLeave')) }
  }

  async function removeTeam() {
    if (deleting) return
    if (!await dialog.confirm({ title: tr('teamSettingsPanel.deleteTeam'), message: tr('teamSettingsPanel.deleteAllMembersWillLose', { name: team.name }), confirmText: tr('teamSettingsPanel.deleteTeam2'), tone: 'danger' })) return
    setDeleting(true); setError('')
    try { await deleteTeam(team.id); navigate('/teams', { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamSettingsPanel.deleteFailed')) }
    finally { setDeleting(false) }
  }

  return <div className="pf-team-settings-grid">
    <section className="pf-team-panel"><div className="pf-team-section-head"><div><h2>{tr('teamSettingsPanel.teamDetails')}</h2><p>{tr('teamSettingsPanel.clearNameHelpsCollaboratorsFind')}</p></div><ShieldCheck size={21} /></div>
      <form className="pf-team-form" onSubmit={save}>
        <div className="pf-team-form-intro"><span className="pf-team-mark" style={{ background: color }}>{name.slice(0, 1) || tr('teamSettingsPanel.t')}</span><div><strong>{team.name}</strong><p>{team.memberCount} {tr('teamSettingsPanel.membersTeamSpace')}</p></div></div>
        <label className="pf-team-field">{tr('teamSettingsPanel.teamName')}<input value={name} onChange={(event) => { setName(event.target.value); setSuccess(false) }} maxLength={40} required readOnly={role !== 'owner'} /></label>
        <label className="pf-team-field">{tr('teamSettingsPanel.teamDescription')}<textarea value={description} onChange={(event) => { setDescription(event.target.value); setSuccess(false) }} rows={3} maxLength={180} readOnly={role !== 'owner'} /></label>
        <fieldset className="pf-team-colors" disabled={role !== 'owner'}><legend>{tr('teamSettingsPanel.badgeColor')}</legend>{TEAM_COLORS.map((item, index) => <button type="button" key={item} style={{ background: item }} aria-label={tr('teamSettingsPanel.chooseBadgeColor', { n: index + 1 })} aria-pressed={color === item} disabled={role !== 'owner'} onClick={() => { setColor(item); setSuccess(false) }}>{color === item && <Check size={16} />}</button>)}</fieldset>
        {role === 'owner' ? <div><Button type="submit" variant="dark">{tr('teamSettingsPanel.saveChanges')}</Button>{success && <span className="pf-team-saved" role="status"><Check size={15} />{tr('teamSettingsPanel.detailsSaved')}</span>}</div> : <p className="pf-team-form-note">{tr('teamSettingsPanel.teamDetailsManagedOwner')}</p>}
      </form>
    </section>
    <div className="pf-team-settings-aside"><section className="pf-team-panel"><div className="pf-team-section-head"><div><h2>{tr("teamSettingsPanel.agreements")}</h2><p>{tr("teamSettingsPanel.agreementsLead")}</p></div></div><ul className="pf-team-rules"><li><strong>{tr("teamSettingsPanel.ruleOwnership")}</strong><span>{tr("teamSettingsPanel.ruleOwnershipNote")}</span></li><li><strong>{tr("teamSettingsPanel.ruleSplit")}</strong><span>{tr("teamSettingsPanel.ruleSplitNote")}</span></li><li><strong>{tr("teamSettingsPanel.ruleCopy")}</strong><span>{tr("teamSettingsPanel.ruleCopyNote")}</span></li><li><strong>{tr("teamSettingsPanel.rulePayment")}</strong><span>{tr("teamSettingsPanel.rulePaymentNote")}</span></li></ul><p className="pf-team-form-note">{tr("teamSettingsPanel.serverNote")}</p></section>
      <section className="pf-team-panel pf-team-settings-access"><h2>{role === 'owner' ? tr("teamSettingsPanel.transferOwnership") : tr("teamSettingsPanel.leaveTeam")}</h2><p className="pf-team-muted">{role === 'owner' ? tr("teamSettingsPanel.transferLead") : tr("teamSettingsPanel.leaveLead")}</p>{role === 'owner' ? <><label className="pf-team-field">{tr("teamSettingsPanel.searchRecipient")}<input value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setMemberPage(1); setTarget('') }} placeholder={tr("teamSettingsPanel.searchPlaceholder")} /></label>{candidates.error && <p role="alert">{candidates.error}</p>}<label className="pf-team-field">{tr("teamSettingsPanel.recipient")}<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">{tr("teamSettingsPanel.chooseMember")}</option>{candidates.items.filter((member) => member.id !== team.viewerId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><TeamPagination page={memberPage} total={candidates.meta.total} onChange={(page) => { setMemberPage(page); setTarget('') }} /><Button onClick={transfer} disabled={!target}><ArrowRightLeft size={15} />{tr("teamSettingsPanel.transferOwnership")}</Button></> : <Button onClick={leave}><LogOut size={15} />{tr("teamSettingsPanel.leaveTeam")}</Button>}</section>
      {role === 'owner' && <section className="pf-team-panel pf-team-settings-access"><h2>{tr("teamSettingsPanel.deleteTeam")}</h2><p className="pf-team-muted">{tr("teamSettingsPanel.deleteNote")}</p><Button disabled={deleting} onClick={() => void removeTeam()}><Trash2 size={15} />{deleting ? tr("teamSettingsPanel.deleting") : tr("teamSettingsPanel.deleteTeam")}</Button></section>}
    </div>
    {error && <p className="pf-team-alert" role="alert">{error}</p>}
  </div>
}
