import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, LockKeyhole, Search, Wallet } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { teamsApi } from '../../api/teams'
import { useTeamPreview } from './useTeamPreview'
import { useTeamPage } from './useTeamPage'
import { TeamPagination } from './TeamPagination'
import type { Team, TeamRole, UsageSummary } from './types'
import './team-management.css'
import { tv } from '../../i18n/tv'

/** 金额以人民币元展示。 */
function money(fen: number): string { return `¥${(fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
/** 所有者付款、两级消费上限及真实用量明细。 */
export default function TeamBillingPanel({ team, role }: { team: Team; role: TeamRole }) {
  /* 查询条件全部传给服务端；summary 账户/用量；limit 月上限；busy/error 操作反馈。 */
  const [search, setSearch] = useState('')
  const [member, setMember] = useState('')
  const [project, setProject] = useState('')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<UsageSummary | undefined>(team.usage)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [limit, setLimit] = useState('')
  const [unlimited, setUnlimited] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const { loadTeam } = useTeamPreview()
  const isOwner = role === 'owner'
  const listing = useTeamPage(`${team.id}:charges:${page}:${search}:${member}:${project}:${period}`, (signal) => teamsApi.charges(team.id, { page, page_size: 12, q: search, member_id: isOwner && member ? member : undefined, project_id: project || undefined, period: period || undefined }, signal), refresh)
  useEffect(() => { let active = true; void teamsApi.summary(team.id).then((data) => { if (active) setSummary(data) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : tv('用量加载失败', 'Tải mức dùng thất bại')) }); return () => { active = false } }, [team.id, refresh])
  /** 打开编辑器，空值不限额；零额度停止新的付费任务。 */
  function openBudget() { setLimit(String((summary?.team_monthly_limit_fen ?? 0) / 100)); setUnlimited(summary?.team_monthly_limit_fen == null); setError(''); setBudgetOpen(true) }
  /** 金额精确转为分后提交真实接口，已消费和在途任务保留。 */
  async function saveBudget() {
    if (busy || !isOwner) return
    if (!unlimited && !/^\d+(\.\d{1,2})?$/.test(limit.trim())) { setError(tv('请输入非负金额，最多两位小数', 'Vui lòng nhập số tiền không âm, tối đa hai chữ số thập phân')); return }
    const value = unlimited ? null : Math.round(Number(limit) * 100)
    if (value !== null && (!Number.isSafeInteger(value) || value > 100000000)) { setError(tv('额度不得超过 1,000,000 元', 'Hạn mức không được vượt quá 1.000.000 tệ')); return }
    setBusy(true); setError('')
    try { await teamsApi.update(team.id, { monthly_limit_fen: value }); setBudgetOpen(false); setRefresh((n) => n + 1); await loadTeam(team.id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('额度保存失败', 'Lưu hạn mức thất bại')) }
    finally { setBusy(false) }
  }
  return <div className="pf-team-billing"><div className="pf-team-billing-summary"><section className="pf-team-billing-wallet"><div className="pf-team-billing-wallet-top"><span><Wallet size={17} />{isOwner ? tv('所有者个人账户', 'Tài khoản cá nhân của chủ sở hữu') : tv('我的本月消费', 'Chi tiêu tháng này của tôi')}</span><span className="pf-team-billing-wallet-badge">{isOwner ? tv('团队费用由此支付', 'Phí nhóm được thanh toán từ đây') : tv('仅本人可见', 'Chỉ mình tôi thấy')}</span></div><div className="pf-team-billing-wallet-amount"><span>{isOwner ? tv('可用余额', 'Số dư khả dụng') : tv('已结算消费', 'Chi tiêu đã quyết toán')}</span><strong>{summary ? money(isOwner ? summary.balance_fen ?? 0 : summary.spent_fen) : '—'}</strong></div><div className="pf-team-billing-wallet-bottom"><span><LockKeyhole size={13} />{isOwner ? tv('任务冻结', 'Đóng băng tác vụ') : tv('在途预留', 'Giữ chỗ đang chạy')} <strong>{summary ? money(isOwner ? summary.frozen_fen ?? 0 : summary.reserved_fen) : '—'}</strong></span>{isOwner && <Button variant="lime" size="sm" disabled={busy || !summary} onClick={openBudget}>{tv("设置总上限", "Đặt hạn mức tổng")}</Button>}</div><div className="pf-team-billing-wallet-pattern" aria-hidden="true">P/F</div></section><section className="pf-team-panel pf-team-billing-stat"><span className="pf-team-muted">{isOwner ? tv('团队本月消费', 'Chi tiêu tháng này của nhóm') : tv('我的月度额度', 'Hạn mức hằng tháng của tôi')}</span><strong>{summary ? isOwner ? money(summary.spent_fen) : summary.monthly_limit_fen === null ? tv('不限额', 'Không giới hạn') : money(summary.monthly_limit_fen) : '—'}</strong><p>{summary?.period || tv('正在读取统计', 'Đang đọc thống kê')}</p></section><section className="pf-team-panel pf-team-billing-stat"><span className="pf-team-muted">{isOwner ? tv('团队月度上限', 'Hạn mức hằng tháng của nhóm') : tv('我的在途预留', 'Giữ chỗ đang chạy của tôi')}</span><strong>{isOwner ? summary?.team_monthly_limit_fen == null ? tv('不限额', 'Không giới hạn') : money(summary.team_monthly_limit_fen) : summary ? money(summary.reserved_fen) : '—'}</strong><p>{isOwner ? summary ? tv('已预留 ', 'Đã giữ chỗ ') + money(summary.reserved_fen) : tv('在成员管理中设置个人上限', 'Đặt hạn mức cá nhân trong quản lý thành viên') : tv('任务完成后按实际用量结算', 'Sau khi tác vụ hoàn tất sẽ quyết toán theo mức dùng thực tế')}</p></section></div><div className="pf-team-billing-info"><p>{isOwner ? tv('团队消费直接扣除你的个人余额，记录实际操作成员；总上限与成员上限同时生效。', 'Chi tiêu của nhóm trừ trực tiếp số dư cá nhân của bạn, ghi lại thành viên thao tác thực tế; hạn mức tổng và hạn mức thành viên có hiệu lực đồng thời.') : tv('团队费用由所有者个人余额支付。你可查看自己的消费及额度。', 'Phí nhóm do số dư cá nhân của chủ sở hữu thanh toán. Bạn có thể xem chi tiêu và hạn mức của mình.')}{summary && !summary.billing_enabled && tv(' 当前未启用计费，不产生扣款。', ' Hiện chưa bật tính phí, không phát sinh khoản trừ.')}</p>{isOwner && <Link className="pf-link" to="/pricing">{tv("个人账户充值 →", "Nạp tiền tài khoản cá nhân →")}</Link>}</div>{error && <div className="pf-team-alert" role="alert">{error}</div>}
    <section className="pf-team-panel"><div className="pf-team-section-head"><h2>{isOwner ? tv('团队消费明细', 'Chi tiết chi tiêu của nhóm') : tv('我的消费明细', 'Chi tiết chi tiêu của tôi')}</h2><span className="pf-team-tag">{tv("人民币 · 元", "Nhân dân tệ · tệ")}</span></div><div className="pf-team-billing-toolbar"><label className="pf-team-billing-search"><Search size={16} /><input aria-label={tv("搜索消费", "Tìm chi tiêu")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={tv("搜索内容或模型", "Tìm nội dung hoặc model")} /></label>{isOwner && <label className="pf-team-field">{tv("成员 ID", "ID thành viên")}<input inputMode="numeric" value={member} onChange={(event) => { setMember(event.target.value); setPage(1) }} placeholder={tv("全部成员", "Tất cả thành viên")} /></label>}<label className="pf-team-field">{tv("项目 ID", "ID dự án")}<input inputMode="numeric" value={project} onChange={(event) => { setProject(event.target.value); setPage(1) }} placeholder={tv("全部项目", "Tất cả dự án")} /></label><label className="pf-team-field">{tv("月份", "Tháng")}<input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }} /></label></div>{listing.loading ? <p role="status">{tv("正在加载消费明细…", "Đang tải chi tiết chi tiêu…")}</p> : listing.error ? <div className="pf-team-alert" role="alert">{listing.error}<Button onClick={listing.retry}>{tv("重试", "Thử lại")}</Button></div> : listing.items.length ? <div className="pf-team-table-wrap"><table className="pf-team-table"><thead><tr><th>{tv("创作内容", "Nội dung sáng tạo")}</th>{isOwner && <th>{tv("成员", "Thành viên")}</th>}<th>{tv("项目", "Dự án")}</th><th>{tv("时间", "Thời gian")}</th><th>{tv("消费金额", "Số tiền chi tiêu")}</th></tr></thead><tbody>{listing.items.map((charge) => <tr key={charge.id}><td><div className="pf-team-billing-charge"><CreditCard size={17} /><div><strong>{charge.label}</strong><small>{charge.model}</small></div></div></td>{isOwner && <td>{team.members.find((m) => m.id === charge.memberId)?.name || tv(`成员 #${charge.memberId}`, `Thành viên #${charge.memberId}`)}</td>}<td>#{charge.projectId}</td><td>{new Date(charge.createdAt).toLocaleString('zh-CN')}</td><td>{money(charge.amountFen)}</td></tr>)}</tbody></table></div> : <div className="pf-team-empty">{tv("暂无符合条件的消费记录。", "Chưa có bản ghi chi tiêu phù hợp.")}</div>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} /></section>
    <Modal open={budgetOpen && isOwner} onClose={() => setBudgetOpen(false)} dismissible={!busy} title={tv("团队月度消费上限", "Hạn mức chi tiêu hằng tháng của nhóm")}><div className="pf-team-form"><p>{tv("按上海时区自然月统计，已消费与在途预留共同占用额度。0 元停止新消费，降低上限不会取消已受理任务。", "Thống kê theo tháng dương lịch múi giờ Thượng Hải, số đã chi và số giữ chỗ đang chạy cùng chiếm hạn mức. 0 tệ dừng chi tiêu mới, giảm hạn mức không hủy tác vụ đã tiếp nhận.")}</p><label><input type="checkbox" checked={unlimited} disabled={busy} onChange={(event) => setUnlimited(event.target.checked)} /> {tv("不限额", "Không giới hạn")}</label><label className="pf-team-field">{tv("每月上限（元）", "Hạn mức hằng tháng (tệ)")}<input inputMode="decimal" disabled={unlimited || busy} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>{error && <p className="pf-team-alert" role="alert">{error}</p>}<Button variant="lime" onClick={saveBudget} disabled={busy}>{busy ? tv('正在保存…', 'Đang lưu…') : tv('保存消费上限', 'Lưu hạn mức chi tiêu')}</Button></div></Modal>
  </div>
}
