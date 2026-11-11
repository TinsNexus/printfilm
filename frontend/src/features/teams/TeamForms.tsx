import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, UsersRound } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import ProjectCreateDialog, { type ProjectCreateValues } from '../../components/projects/ProjectCreateDialog'
import { useTeamPreview } from './useTeamPreview'
import { TEAM_COLORS } from './types'
import { tv } from '../../i18n/tv'

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
    } catch (cause) { setError(cause instanceof Error ? cause.message : tv('创建失败，请重试', 'Tạo thất bại, vui lòng thử lại')) }
    finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} dismissible={!busy} title={tv("创建团队", "Tạo nhóm")}>
    <form className="pf-team-form" onSubmit={submit}>
      <div className="pf-team-form-intro"><span className="pf-team-mark" style={{ background: color }}><UsersRound size={24} /></span><div><strong>{tv("把灵感变成团队的作品", "Biến cảm hứng thành tác phẩm của nhóm")}</strong><p>{tv("你将成为团队所有者，随后可以邀请伙伴一起创作。", "Bạn sẽ là chủ sở hữu nhóm, sau đó có thể mời cộng sự cùng sáng tạo.")}</p></div></div>
      <label className="pf-team-field">{tv("团队名称", "Tên nhóm")}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder={tv("例如：青禾影像", "Ví dụ: Thanh Hòa Studio")} required /></label>
      <label className="pf-team-field">{tv("团队介绍", "Giới thiệu nhóm")} <span className="pf-team-muted">{tv("选填", "Tùy chọn")}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder={tv("写下你们想一起完成的事", "Viết điều các bạn muốn cùng hoàn thành")} rows={3} /></label>
      <fieldset className="pf-team-colors"><legend>{tv("标识颜色", "Màu nhận diện")}</legend>{TEAM_COLORS.map((item, index) => <button key={item} type="button" style={{ background: item }} aria-label={tv(`选择标识颜色 ${index + 1}`, `Chọn màu nhận diện ${index + 1}`)} aria-pressed={color === item} onClick={() => setColor(item)}>{color === item && <Check size={16} />}</button>)}</fieldset>
      <p className="pf-team-form-note">{tv("团队拥有独立的项目、资产和钱包，创建后可以邀请真实伙伴加入。", "Nhóm có dự án, tài sản và ví riêng, sau khi tạo có thể mời cộng sự thật tham gia.")}</p>
      {error && <p className="pf-team-alert" role="alert">{error}</p>}
      <div className="pf-team-modal-actions"><Button onClick={onClose}>{tv("取消", "Hủy")}</Button><Button variant="lime" type="submit" disabled={busy}>{tv("创建团队", "Tạo nhóm")} <ArrowUpRight size={16} /></Button></div>
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

  return <ProjectCreateDialog key={teamId} open={open} onClose={onClose} kind="drama" contextLabel="团队项目 · 成员共同创作" titleRequired titleMaxLength={60} sourceMaxLength={100000} allowImageStyle={false} onSubmit={submit} footerNote="创建项目不会自动提交生成任务。后续生成费用由团队所有者的个人积分支付。" />
}
