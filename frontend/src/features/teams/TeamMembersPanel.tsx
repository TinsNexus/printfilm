import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Copy, Mail, Search, ShieldCheck, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useTeamPreview } from './useTeamPreview'
import { type PreviewMember, type PreviewTeam, type TeamRole } from './types'
import { teamsApi } from '../../api/teams'
import { useTeamPage } from './useTeamPage'
import { TeamPagination } from './TeamPagination'
import './team-management.css'
import { tv } from '../../i18n/tv'

/* 成员角色的中文名称；金额始终使用分存储。 */
const ROLE_LABELS: Record<TeamRole, string> = { owner: tv('所有者', 'Chủ sở hữu'), admin: tv('管理员', 'Quản trị viên'), member: tv('成员', 'Thành viên') }

/** 将分转换为清楚、固定两位小数的人民币展示。 */
function memberMoney(fen: number): string {
  return `¥${(fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 返回适合表格展示的日期，保留未知日期的可读降级。 */
function memberDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 管理真实团队成员、邀请和月度额度。 */
export default function TeamMembersPanel({ team, role }: { team: PreviewTeam; role: TeamRole }) {
  const { inviteMember, revokeInvitation, updateMember, removeMember, revision } = useTeamPreview()
  /* search/roleFilter 筛选；dialog 控制弹窗；target 为额度或移除对象；notice/error 为本地反馈。 */
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [dialog, setDialog] = useState<'invite' | 'limit' | 'remove' | null>(null)
  const [target, setTarget] = useState<PreviewMember | null>(null)
  const [email, setEmail] = useState('')
  const [limit, setLimit] = useState('')
  const [unlimited, setUnlimited] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const dialogContent = useRef<HTMLDivElement>(null)
  const canInvite = role !== 'member'
  const [page, setPage] = useState(1)
  const [invitationPage, setInvitationPage] = useState(1)
  const [links, setLinks] = useState<Record<string, string>>({})
  const listing = useTeamPage(`${team.id}:members:${page}:${search}:${roleFilter}`, (signal) => teamsApi.members(team.id, { page, page_size: 12, q: search, role: roleFilter === 'all' ? undefined : roleFilter }, signal), revision)
  const invitationListing = useTeamPage(`${team.id}:invitations:${invitationPage}:${role}`, (signal) => canInvite ? teamsApi.invitations(team.id, { page: invitationPage, page_size: 12 }, signal) : Promise.resolve({ items: [], meta: { page: 1, page_size: 12, total: 0 } }), revision)
  const members = listing.items
  const invitations = invitationListing.items

  /** 将焦点保留在当前弹窗内，并在关闭后返回打开弹窗的按钮。 */
  useEffect(() => {
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = dialogContent.current?.closest<HTMLElement>('[role="dialog"]')
    if (!panel) return
    const first = panel.querySelector<HTMLElement>('[data-team-autofocus]')
      ?? panel.querySelector<HTMLElement>('button, input, select')
    first?.focus()
    /** 在首尾可聚焦元素之间循环 Tab，避免焦点落到遮罩下。 */
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus() }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus() }
    }
    panel.addEventListener('keydown', trapFocus)
    return () => { panel.removeEventListener('keydown', trapFocus); previous?.focus() }
  }, [dialog])

  /** 展示可读错误并清除上一次成功状态。 */
  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : tv('操作未完成，请重试', 'Thao tác chưa hoàn tất, vui lòng thử lại'))
    setNotice('')
  }

  /** 关闭当前弹窗并清空其中的校验反馈。 */
  function closeDialog() {
    setDialog(null)
    setTarget(null)
    setError('')
  }

  /** 打开邮箱邀请弹窗；邀请始终默认为普通成员。 */
  function openInvitation() {
    setEmail('')
    setError('')
    setDialog('invite')
  }

  /** 校验邮箱后创建本地邀请，不发送邮件或生成真实加入链接。 */
  async function submitInvitation(event: FormEvent) {
    event.preventDefault()
    if (!canInvite) return
    try {
      const result = await inviteMember(team.id, email.trim())
      if (result.acceptUrl) setLinks((old) => ({ ...old, [result.id]: result.acceptUrl! }))
      closeDialog()
      setNotice(result.emailSent ? tv('邀请邮件已发送。', 'Đã gửi email mời.') : tv('邀请已创建，请复制加入链接发送给对方。', 'Đã tạo lời mời, vui lòng sao chép liên kết tham gia gửi cho đối phương.'))
    } catch (cause) { showError(cause) }
  }

  /** 复制本次生成的真实邀请链接，历史令牌不从服务端重新暴露。 */
  async function copyInvitation(inviteId: string) {
    try {
      if (!links[inviteId]) throw new Error(tv('请先重新发送以生成新的邀请链接', 'Vui lòng gửi lại trước để tạo liên kết mời mới'))
      await navigator.clipboard.writeText(links[inviteId])
      setNotice(tv('已复制加入链接，请仅发送给邀请邮箱的持有人。', 'Đã sao chép liên kết tham gia, chỉ gửi cho người sở hữu email được mời.'))
    } catch (cause) { showError(cause) }
  }
  /** 重发会轮换邀请令牌，旧链接立即失效。 */
  async function resend(inviteId: string) {
    try { const result = await teamsApi.resend(team.id, inviteId); if (result.acceptUrl) setLinks((old) => ({ ...old, [inviteId]: result.acceptUrl! })); setNotice(result.emailSent ? tv('已重新发送邀请邮件，旧链接已失效。', 'Đã gửi lại email mời, liên kết cũ đã hết hiệu lực.') : tv('已生成新链接，可点击复制。', 'Đã tạo liên kết mới, có thể bấm để sao chép.')); invitationListing.retry() }
    catch (cause) { showError(cause) }
  }

  /** 撤回本地邀请；上下文负责验证操作者权限。 */
  async function revoke(inviteId: string) {
    try {
      await revokeInvitation(team.id, inviteId)
      setError('')
      setNotice(tv('已撤回这条邀请。', 'Đã thu hồi lời mời này.'))
    } catch (cause) { showError(cause) }
  }

  /** 仅允许所有者为非所有者成员切换管理员身份。 */
  async function changeRole(member: PreviewMember, nextRole: 'admin' | 'member') {
    if (role !== 'owner' || member.role === 'owner') return
    try {
      await updateMember(team.id, member.id, { role: nextRole })
      setError('')
      setNotice(tv(`已将 ${member.name} 设为${ROLE_LABELS[nextRole]}。`, `Đã đặt ${member.name} làm ${ROLE_LABELS[nextRole]}.`))
    } catch (cause) { showError(cause) }
  }

  /** 打开额度弹窗，将已有分金额转换为输入框中的元。 */
  function openLimit(member: PreviewMember) {
    setTarget(member)
    setLimit(member.monthlyLimitFen === null ? '' : (member.monthlyLimitFen / 100).toFixed(2))
    setUnlimited(member.monthlyLimitFen === null)
    setError('')
    setDialog('limit')
  }

  /** 保存非负、最多两位小数的月额度，零额度表示禁止新增消费。 */
  async function saveLimit(event: FormEvent) {
    event.preventDefault()
    if (!target || role !== 'owner') return
    try {
      if (!unlimited && !/^\d+(\.\d{1,2})?$/.test(limit.trim())) throw new Error(tv('请输入有效金额，最多保留两位小数', 'Vui lòng nhập số tiền hợp lệ, tối đa hai chữ số thập phân'))
      const amountFen = unlimited ? null : Math.round(Number(limit) * 100)
      if (amountFen !== null && (!Number.isSafeInteger(amountFen) || amountFen < 0)) throw new Error(tv('额度金额超出可设置范围', 'Số tiền hạn mức vượt phạm vi có thể đặt'))
      await updateMember(team.id, target.id, { monthlyLimitFen: amountFen })
      closeDialog()
      setNotice(tv('成员月度额度已更新。', 'Đã cập nhật hạn mức hằng tháng của thành viên.'))
    } catch (cause) { showError(cause) }
  }

  /** 确认移除有权限管理的成员，所有者与当前操作者不能被移除。 */
  async function confirmRemoval() {
    if (!target || target.id === team.viewerId || target.role === 'owner'
      || (role !== 'owner' && !(role === 'admin' && target.role === 'member'))) return
    try {
      await removeMember(team.id, target.id)
      closeDialog()
      setNotice(tv('成员已从团队移除，其团队内容仍然保留。', 'Đã xóa thành viên khỏi nhóm, nội dung của họ trong nhóm vẫn được giữ.'))
    } catch (cause) { showError(cause) }
  }

  return (
    <div className="pf-team-members">
      <section className="pf-team-panel">
        <div className="pf-team-section-head">
          <div><span className="pf-team-members-eyebrow">{tv("一起，把故事做好", "Cùng nhau, làm tốt câu chuyện")}</span><h2>{tv("团队成员", "Thành viên nhóm")} <span className="pf-team-members-count">{team.memberCount}</span></h2><p className="pf-team-muted">{tv("每个人各司其职，作品始终属于团队。", "Mỗi người một vai, tác phẩm luôn thuộc về nhóm.")}</p></div>
          {canInvite && <Button variant="lime" onClick={openInvitation}><UserPlus size={16} /> {tv("邀请成员", "Mời thành viên")}</Button>}
        </div>
        <div className="pf-team-members-permissions"><ShieldCheck size={16} /><span>{role === 'owner' ? tv('你是所有者，可以管理角色、成员和月度额度。', 'Bạn là chủ sở hữu, có thể quản lý vai trò, thành viên và hạn mức hằng tháng.') : role === 'admin' ? tv('你是管理员，可以邀请和移除普通成员。', 'Bạn là quản trị viên, có thể mời và xóa thành viên thường.') : tv('你可以查看团队成员；角色和额度由所有者管理。', 'Bạn có thể xem thành viên nhóm; vai trò và hạn mức do chủ sở hữu quản lý.')}</span></div>
        <div className="pf-team-members-toolbar">
          <label className="pf-team-members-search"><Search size={17} /><span className="pf-team-members-sr">{tv("搜索成员姓名或邮箱", "Tìm tên hoặc email thành viên")}</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={tv("搜索姓名或邮箱", "Tìm tên hoặc email")} type="search" /></label>
          <label className="pf-team-members-filter"><SlidersHorizontal size={15} /><span className="pf-team-members-sr">{tv("按角色筛选", "Lọc theo vai trò")}</span><select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}><option value="all">{tv("全部角色", "Tất cả vai trò")}</option><option value="owner">{tv("所有者", "Chủ sở hữu")}</option><option value="admin">{tv("管理员", "Quản trị viên")}</option><option value="member">{tv("成员", "Thành viên")}</option></select></label>
        </div>
        {!dialog && error && <div className="pf-team-alert" role="alert">{error}</div>}
        {notice && <div className="pf-team-members-notice" role="status"><Check size={15} />{notice}</div>}
        {listing.loading ? <p role="status">{tv("正在加载成员…", "Đang tải thành viên…")}</p> : listing.error ? <div className="pf-team-alert" role="alert">{listing.error}<Button onClick={listing.retry}>{tv("重试", "Thử lại")}</Button></div> : members.length ? <div className="pf-team-table-wrap"><table className="pf-team-table pf-team-members-table"><thead><tr><th scope="col">{tv("成员", "Thành viên")}</th><th scope="col">{tv("角色", "Nhân vật")}</th><th scope="col">{tv("本月额度与使用", "Hạn mức và mức dùng tháng này")}</th><th scope="col">{tv("加入时间", "Thời gian tham gia")}</th><th scope="col"><span className="pf-team-members-sr">{tv("操作", "Thao tác")}</span></th></tr></thead><tbody>{members.map((member) => {
          /* 每行权限与消费可见性：仅所有者查看全员消费。 */
          const isSelf = member.id === team.viewerId
          const canViewSpend = role === 'owner' || isSelf
          const canRemove = !isSelf && member.role !== 'owner' && (role === 'owner' || (role === 'admin' && member.role === 'member'))
          const commitment = (member.spentFen || 0) + (member.reservedFen || 0)
          const percent = member.monthlyLimitFen ? Math.min(100, commitment / member.monthlyLimitFen * 100) : 0
          return <tr key={member.id}><td><div className="pf-team-members-person"><span className="pf-team-avatar" style={{ background: member.color }}>{member.name.slice(0, 1)}</span><div><strong>{member.name}{isSelf && <span className="pf-team-members-self">{tv("你", "Bạn")}</span>}</strong><small>{member.email}</small></div></div></td><td>{role === 'owner' && member.role !== 'owner' ? <select className="pf-team-members-role-select" aria-label={tv(`设置 ${member.name} 的角色`, `Đặt vai trò của ${member.name}`)} value={member.role} onChange={(event) => changeRole(member, event.target.value as 'admin' | 'member')}><option value="admin">{tv("管理员", "Quản trị viên")}</option><option value="member">{tv("成员", "Thành viên")}</option></select> : <span className={`pf-team-tag pf-team-members-role-${member.role}`}>{ROLE_LABELS[member.role]}</span>}</td><td>{canViewSpend ? <div className="pf-team-members-budget"><span><strong>{memberMoney(member.spentFen || 0)}</strong><span> / {member.monthlyLimitFen === null ? tv('不限额', 'Không giới hạn') : memberMoney(member.monthlyLimitFen)}</span></span>{member.monthlyLimitFen !== null && <div className="pf-team-members-meter" role="progressbar" aria-label={tv(`${member.name} 的额度使用比例`, `Tỷ lệ dùng hạn mức của ${member.name}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>}{(member.reservedFen || 0) > 0 && <small>{tv("另有", "Còn có")} {memberMoney(member.reservedFen || 0)} {tv("预留", "Giữ chỗ")}</small>}</div> : <span className="pf-team-muted">{tv("仅本人可见", "Chỉ mình tôi thấy")}</span>}</td><td className="pf-team-members-date">{memberDate(member.joinedAt)}</td><td><div className="pf-team-members-actions">{role === 'owner' && <Button size="sm" variant="text" onClick={() => openLimit(member)}>{tv("额度", "Hạn mức")}</Button>}{canRemove && <Button size="sm" variant="text" className="pf-team-members-remove" onClick={() => { setTarget(member); setError(''); setDialog('remove') }}>{tv("移除", "Xóa")}</Button>}</div></td></tr>
        })}</tbody></table></div> : <div className="pf-team-empty"><Users size={30} /><h3>{tv("没有找到成员", "Không tìm thấy thành viên")}</h3><p>{tv("试试其他姓名、邮箱或角色。", "Hãy thử tên, email hoặc vai trò khác.")}</p><Button variant="outline" size="sm" onClick={() => { setSearch(''); setRoleFilter('all') }}>{tv("清除筛选", "Xóa bộ lọc")}</Button></div>}
        <TeamPagination page={page} total={listing.meta.total} onChange={setPage} />
      </section>

      {canInvite && <section className="pf-team-panel pf-team-members-invitations"><div className="pf-team-section-head"><div><h2>{tv("邀请记录", "Bản ghi lời mời")} <span className="pf-team-members-count">{invitationListing.meta.total}</span></h2><p className="pf-team-muted">{tv("邀请有效期 7 天，仅被邀请邮箱登录后可以接受。", "Lời mời có hiệu lực 7 ngày, chỉ email được mời đăng nhập mới chấp nhận được.")}</p></div><Mail size={21} /></div>{invitationListing.loading ? <p role="status">{tv("正在加载邀请…", "Đang tải lời mời…")}</p> : invitationListing.error ? <div className="pf-team-alert" role="alert">{invitationListing.error}<Button onClick={invitationListing.retry}>{tv("重试", "Thử lại")}</Button></div> : invitations.length ? <div className="pf-team-members-invite-list">{invitations.map((invite) => <div className="pf-team-members-invite-row" key={invite.id}><span className="pf-team-members-mail-icon"><Mail size={17} /></span><div className="pf-team-members-invite-info"><strong>{invite.email}</strong><small>{new Date(invite.expiresAt).getTime() < Date.now() ? tv('已过期', 'Đã hết hạn') : tv(`${memberDate(invite.expiresAt)} 到期`, `${memberDate(invite.expiresAt)} hết hạn`)} {tv("· 普通成员 ·", "· Thành viên thường ·")} {{ pending: tv('待接受', 'Chờ chấp nhận'), accepted: tv('已接受', 'Đã chấp nhận'), revoked: tv('已撤回', 'Đã thu hồi'), expired: tv('已过期', 'Đã hết hạn') }[invite.status] || invite.status}</small></div><Button variant="text" size="sm" disabled={!links[invite.id] || invite.status !== 'pending'} onClick={() => void copyInvitation(invite.id)} aria-label={tv(`复制 ${invite.email} 的邀请链接`, `Sao chép liên kết mời của ${invite.email}`)}><Copy size={14} />{tv("复制链接", "Sao chép liên kết")}</Button>{['pending', 'expired'].includes(invite.status) && <Button variant="text" size="sm" onClick={() => void resend(invite.id)}>{tv("重新发送", "Gửi lại")}</Button>}<Button variant="ghost" size="sm" icon disabled={invite.status !== 'pending'} onClick={() => void revoke(invite.id)} aria-label={tv(`撤回 ${invite.email} 的邀请`, `Thu hồi lời mời của ${invite.email}`)}><X size={16} /></Button></div>)}</div> : <div className="pf-team-members-invite-empty"><Mail size={22} /><p>{tv("还没有待加入成员", "Chưa có thành viên chờ tham gia")}</p><span>{tv("邀请伙伴，一起开始下一段创作。", "Mời cộng sự, cùng bắt đầu chặng sáng tạo tiếp theo.")}</span></div>}<TeamPagination page={invitationPage} total={invitationListing.meta.total} onChange={setInvitationPage} /></section>}

      <Modal open={dialog === 'invite'} onClose={closeDialog} title={tv("邀请创作伙伴", "Mời cộng sự sáng tạo")} className="pf-team-members-modal"><div ref={dialog === 'invite' ? dialogContent : undefined}><p className="pf-team-muted">{tv("邀请普通成员加入「", "Mời thành viên thường tham gia “")}{team.name}{tv("」，加入后可查看团队全部项目与资产。", "”, sau khi tham gia có thể xem toàn bộ dự án và tài sản của nhóm.")}</p><form className="pf-team-form" onSubmit={submitInvitation}><label className="pf-team-field" htmlFor="pf-team-invite-email">{tv("邮箱地址", "Địa chỉ email")}<input id="pf-team-invite-email" data-team-autofocus type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="partner@example.com" /></label><div className="pf-team-members-preview-note"><Mail size={16} /><span>{tv("邀请对应邮箱的真实用户加入；未配置邮件服务时请复制加入链接。", "Mời người dùng thật của email tương ứng tham gia; khi chưa cấu hình dịch vụ email, vui lòng sao chép liên kết tham gia.")}</span></div>{error && <div className="pf-team-alert" role="alert">{error}</div>}<div className="pf-team-members-modal-actions"><Button variant="outline" onClick={closeDialog}>{tv("取消", "Hủy")}</Button><Button type="submit" variant="lime"><UserPlus size={16} />{tv("发送邀请", "Gửi lời mời")}</Button></div></form></div></Modal>
      <Modal open={dialog === 'limit'} onClose={closeDialog} title={tv(`设置 ${target?.name ?? '成员'} 的月度额度`, `Đặt hạn mức hằng tháng của ${target?.name ?? '成员'}`)} className="pf-team-members-modal"><div ref={dialog === 'limit' ? dialogContent : undefined}><form className="pf-team-form" onSubmit={saveLimit}><p className="pf-team-muted">{tv("额度用于限制该成员在团队内的月消费，不会向成员个人钱包转账。", "Hạn mức dùng để giới hạn chi tiêu hằng tháng của thành viên này trong nhóm, không chuyển tiền vào ví cá nhân của thành viên.")}</p><label className="pf-team-members-checkbox"><input data-team-autofocus type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />{tv("不限月度额度", "Không giới hạn hạn mức hằng tháng")}</label><label className="pf-team-field" htmlFor="pf-team-monthly-limit">{tv("每月额度（元）", "Hạn mức hằng tháng (tệ)")}<input id="pf-team-monthly-limit" inputMode="decimal" type="text" disabled={unlimited} value={limit} onChange={(event) => setLimit(event.target.value)} placeholder={tv("例如 500.00", "Ví dụ 500.00")} /></label><p className="pf-team-members-help">{tv("设为 0 可停止新增消费。已产生的费用和在途预留仍保留。额度从下一次提交生成任务开始生效。", "Đặt về 0 để dừng phát sinh chi tiêu mới. Chi phí đã phát sinh và giữ chỗ đang chạy vẫn được giữ. Hạn mức có hiệu lực từ lần gửi tác vụ tạo tiếp theo.")}</p>{error && <div className="pf-team-alert" role="alert">{error}</div>}<div className="pf-team-members-modal-actions"><Button variant="outline" onClick={closeDialog}>{tv("取消", "Hủy")}</Button><Button type="submit" variant="lime">{tv("保存额度", "Lưu hạn mức")}</Button></div></form></div></Modal>
      <Modal open={dialog === 'remove'} onClose={closeDialog} title={tv("移除团队成员", "Xóa thành viên nhóm")} className="pf-team-members-modal"><div ref={dialog === 'remove' ? dialogContent : undefined}><p className="pf-team-members-remove-copy">{tv("确定将", "Xác nhận xóa")} <strong>{target?.name}</strong> {tv("移出「", "khỏi “")}{team.name}」？</p><p className="pf-team-muted">{tv("移除后，该成员将无法访问团队。已创建的团队项目、资产和消费记录仍保留在团队中。", "Sau khi xóa, thành viên này sẽ không thể truy cập nhóm. Dự án, tài sản và bản ghi chi tiêu nhóm đã tạo vẫn được giữ trong nhóm.")}</p><p className="pf-team-members-help">{tv("移除会立即撤销该成员访问权限，不会删除团队内容。", "Việc xóa sẽ thu hồi ngay quyền truy cập của thành viên, không xóa nội dung của nhóm.")}</p>{error && <div className="pf-team-alert" role="alert">{error}</div>}<div className="pf-team-members-modal-actions"><Button data-team-autofocus variant="outline" onClick={closeDialog}>{tv("保留成员", "Giữ thành viên")}</Button><Button variant="dark" onClick={confirmRemoval}>{tv("确认移除", "Xác nhận xóa")}</Button></div></div></Modal>
    </div>
  )
}
