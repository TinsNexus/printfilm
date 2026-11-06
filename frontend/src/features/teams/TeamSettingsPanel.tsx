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
import { tv } from '../../i18n/tv'

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
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('保存失败', 'Lưu thất bại')) }
  }

  /** 转让前明确说明权限变化。 */
  async function transfer() {
    const member = candidates.items.find((item) => item.id === target)
    if (!member) { setError(tv('请选择接收所有权的成员', 'Vui lòng chọn thành viên nhận quyền sở hữu')); return }
    if (!await dialog.confirm({ title: tv('转让团队所有权', 'Chuyển nhượng quyền sở hữu nhóm'), message: tv(`将团队交给 ${member.name} 后，你将成为管理员，无法再管理资金和任免管理员。新任务将扣除新所有者的个人余额，已受理任务仍由原付款所有者结算。转让后无法自行恢复所有权。`, `Sau khi giao nhóm cho ${member.name}, bạn sẽ trở thành quản trị viên, không còn quản lý được tiền và bổ nhiệm/miễn nhiệm quản trị viên. Tác vụ mới sẽ trừ số dư cá nhân của chủ sở hữu mới, tác vụ đã tiếp nhận vẫn do chủ sở hữu thanh toán ban đầu quyết toán. Sau khi chuyển không thể tự khôi phục quyền sở hữu.`), confirmText: tv('确认转让', 'Xác nhận chuyển'), tone: 'danger' })) return
    try { await transferOwnership(team.id, target); setTarget(''); setError(''); setSuccess(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('转让失败', 'Chuyển thất bại')) }
  }

  /** 成员退出撤销真实团队访问，保留团队项目与账单。 */
  async function leave() {
    if (!await dialog.confirm({ title: tv('退出团队', 'Rời nhóm'), message: tv(`退出「${team.name}」后，你将无法访问这个团队；团队内容仍然保留。重新加入需要邀请。`, `Sau khi rời “${team.name}”, bạn sẽ không thể truy cập nhóm này; nội dung nhóm vẫn được giữ. Tham gia lại cần lời mời.`), confirmText: tv('退出团队', 'Rời nhóm'), tone: 'danger' })) return
    try { await leaveTeam(team.id); navigate('/teams') }
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('退出失败', 'Rời thất bại')) }
  }

  async function removeTeam() {
    if (deleting) return
    if (!await dialog.confirm({ title: tv('删除团队', 'Xóa nhóm'), message: tv(`确定删除「${team.name}」？所有成员将失去访问权限，未使用的邀请立即失效。历史作品和消费记录仅保留归档，无法通过团队页面访问。此操作无法自行恢复。`, `Xác nhận xóa “${team.name}”? Tất cả thành viên sẽ mất quyền truy cập, lời mời chưa dùng hết hiệu lực ngay. Tác phẩm lịch sử và bản ghi chi tiêu chỉ được lưu trữ, không thể truy cập qua trang nhóm. Thao tác này không thể tự khôi phục.`), confirmText: tv('确认删除团队', 'Xác nhận xóa nhóm'), tone: 'danger' })) return
    setDeleting(true); setError('')
    try { await deleteTeam(team.id); navigate('/teams', { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('删除失败', 'Xóa thất bại')) }
    finally { setDeleting(false) }
  }

  return <div className="pf-team-settings-grid">
    <section className="pf-team-panel"><div className="pf-team-section-head"><div><h2>{tv("团队资料", "Hồ sơ nhóm")}</h2><p>{tv("一个清晰的名字，让伙伴更容易找到彼此。", "Một cái tên rõ ràng giúp cộng sự dễ tìm nhau hơn.")}</p></div><ShieldCheck size={21} /></div>
      <form className="pf-team-form" onSubmit={save}>
        <div className="pf-team-form-intro"><span className="pf-team-mark" style={{ background: color }}>{name.slice(0, 1) || tv('团', 'Nhóm')}</span><div><strong>{team.name}</strong><p>{team.memberCount} {tv("位成员 · 团队空间", "thành viên · Không gian nhóm")}</p></div></div>
        <label className="pf-team-field">{tv("团队名称", "Tên nhóm")}<input value={name} onChange={(event) => { setName(event.target.value); setSuccess(false) }} maxLength={40} required readOnly={role !== 'owner'} /></label>
        <label className="pf-team-field">{tv("团队介绍", "Giới thiệu nhóm")}<textarea value={description} onChange={(event) => { setDescription(event.target.value); setSuccess(false) }} rows={3} maxLength={180} readOnly={role !== 'owner'} /></label>
        <fieldset className="pf-team-colors" disabled={role !== 'owner'}><legend>{tv("标识颜色", "Màu nhận diện")}</legend>{TEAM_COLORS.map((item, index) => <button type="button" key={item} style={{ background: item }} aria-label={tv(`选择标识颜色 ${index + 1}`, `Chọn màu nhận diện ${index + 1}`)} aria-pressed={color === item} disabled={role !== 'owner'} onClick={() => { setColor(item); setSuccess(false) }}>{color === item && <Check size={16} />}</button>)}</fieldset>
        {role === 'owner' ? <div><Button type="submit" variant="dark">{tv("保存修改", "Lưu thay đổi")}</Button>{success && <span className="pf-team-saved" role="status"><Check size={15} />{tv("资料已保存", "Đã lưu hồ sơ")}</span>}</div> : <p className="pf-team-form-note">{tv("团队资料由所有者管理。", "Hồ sơ nhóm do chủ sở hữu quản lý.")}</p>}
      </form>
    </section>
    <div className="pf-team-settings-aside"><section className="pf-team-panel"><div className="pf-team-section-head"><div><h2>{tv("协作约定", "Quy ước cộng tác")}</h2><p>{tv("让创作有秩序，也有空间。", "Để sáng tạo có trật tự, cũng có không gian.")}</p></div></div><ul className="pf-team-rules"><li><strong>{tv("团队共同拥有作品", "Nhóm cùng sở hữu tác phẩm")}</strong><span>{tv("成员退出后，项目和资产继续留在团队。", "Sau khi thành viên rời đi, dự án và tài sản vẫn ở lại nhóm.")}</span></li><li><strong>{tv("分工制作，避免覆盖", "Phân công làm việc, tránh ghi đè")}</strong><span>{tv("不同分集可并行，同一内容由一位伙伴编辑。", "Các tập khác nhau có thể song song, cùng một nội dung do một cộng sự chỉnh sửa.")}</span></li><li><strong>{tv("资产复制后独立修改", "Tài sản sao chép xong thì chỉnh sửa độc lập")}</strong><span>{tv("其他项目的调整不会改变当前项目资产。", "Điều chỉnh ở dự án khác sẽ không thay đổi tài sản của dự án hiện tại.")}</span></li><li><strong>{tv("所有者个人余额支付费用", "Số dư cá nhân của chủ sở hữu thanh toán phí")}</strong><span>{tv("月度额度按预估拦截，按实际费用结算。", "Hạn mức hằng tháng chặn theo ước tính, quyết toán theo chi phí thực tế.")}</span></li></ul><p className="pf-team-form-note">{tv("协作编辑占用由服务端校验；任务完成后按实际用量结算。", "Quyền chiếm chỉnh sửa cộng tác do máy chủ kiểm tra; sau khi tác vụ hoàn tất sẽ quyết toán theo mức dùng thực tế.")}</p></section>
      <section className="pf-team-panel pf-team-settings-access"><h2>{role === 'owner' ? tv('转让所有权', 'Chuyển nhượng quyền sở hữu') : tv('退出团队', 'Rời nhóm')}</h2><p className="pf-team-muted">{role === 'owner' ? tv('把团队交给另一位伙伴，你将成为管理员。', 'Giao nhóm cho một cộng sự khác, bạn sẽ trở thành quản trị viên.') : tv('退出后，你的创作内容仍归团队所有。', 'Sau khi rời, nội dung sáng tạo của bạn vẫn thuộc về nhóm.')}</p>{role === 'owner' ? <><label className="pf-team-field">{tv("搜索接收成员", "Tìm thành viên nhận")}<input value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setMemberPage(1); setTarget('') }} placeholder={tv("输入成员姓名或邮箱", "Nhập tên hoặc email thành viên")} /></label>{candidates.error && <p role="alert">{candidates.error}</p>}<label className="pf-team-field">{tv("接收成员", "Thành viên nhận")}<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">{tv("选择一位成员", "Chọn một thành viên")}</option>{candidates.items.filter((member) => member.id !== team.viewerId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><TeamPagination page={memberPage} total={candidates.meta.total} onChange={(page) => { setMemberPage(page); setTarget('') }} /><Button onClick={transfer} disabled={!target}><ArrowRightLeft size={15} />{tv("转让所有权", "Chuyển nhượng quyền sở hữu")}</Button></> : <Button onClick={leave}><LogOut size={15} />{tv("退出团队", "Rời nhóm")}</Button>}</section>
      {role === 'owner' && <section className="pf-team-panel pf-team-settings-access"><h2>{tv("删除团队", "Xóa nhóm")}</h2><p className="pf-team-muted">{tv("删除后所有成员将无法访问团队。历史作品与消费记录保留归档，此操作无法自行恢复。", "Sau khi xóa, mọi thành viên sẽ không truy cập được nhóm. Tác phẩm lịch sử và bản ghi chi tiêu được lưu trữ, thao tác này không thể tự khôi phục.")}</p><Button disabled={deleting} onClick={() => void removeTeam()}><Trash2 size={15} />{deleting ? tv('正在删除…', 'Đang xóa…') : tv('删除团队', 'Xóa nhóm')}</Button></section>}
    </div>
    {error && <p className="pf-team-alert" role="alert">{error}</p>}
  </div>
}
