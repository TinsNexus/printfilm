import { points, parsePoints } from '../../lib/points'
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
import { tr } from '../../i18n/translate.ts'
import { formatDateTime } from '../../i18n/detect.ts'

/** 金额以人民币元展示。 */
const money = points
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
  useEffect(() => { let active = true; void teamsApi.summary(team.id).then((data) => { if (active) setSummary(data) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : tr('teamBillingPanel.failedLoadUsage')) }); return () => { active = false } }, [team.id, refresh])
  /** 打开编辑器，空值不限额；零额度停止新的付费任务。 */
  function openBudget() { setLimit(String(summary?.team_monthly_limit_fen ?? 0)); setUnlimited(summary?.team_monthly_limit_fen == null); setError(''); setBudgetOpen(true) }
  /** 金额精确转为分后提交真实接口，已消费和在途任务保留。 */
  async function saveBudget() {
    if (busy || !isOwner) return
    if (!unlimited && parsePoints(limit, 100000000) === null) { setError(tr("teamBillingPanel.errMaxPoints")); return }
    const value = unlimited ? null : parsePoints(limit, 100000000)
    if (value !== null && (!Number.isSafeInteger(value) || value > 100000000)) { setError(tr("teamBillingPanel.errLimitMax")); return }
    setBusy(true); setError('')
    try { await teamsApi.update(team.id, { monthly_limit_fen: value }); setBudgetOpen(false); setRefresh((n) => n + 1); await loadTeam(team.id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('teamBillingPanel.failedSaveLimit')) }
    finally { setBusy(false) }
  }
  return <div className="pf-team-billing"><div className="pf-team-billing-summary"><section className="pf-team-billing-wallet"><div className="pf-team-billing-wallet-top"><span><Wallet size={17} />{isOwner ? tr("teamBillingPanel.ownerAccount") : tr("teamBillingPanel.mySpendThisMonth")}</span><span className="pf-team-billing-wallet-badge">{isOwner ? tr("teamBillingPanel.teamCostsPaidHere") : tr("teamBillingPanel.onlyYou")}</span></div><div className="pf-team-billing-wallet-amount"><span>{isOwner ? tr("teamBillingPanel.availablePoints") : tr("teamBillingPanel.settledSpend")}</span><strong>{summary ? money(isOwner ? summary.balance_fen ?? 0 : summary.spent_fen) : '—'}</strong></div><div className="pf-team-billing-wallet-bottom"><span><LockKeyhole size={13} />{isOwner ? tr("teamBillingPanel.taskHolds") : tr("teamBillingPanel.inFlightReserve")} <strong>{summary ? money(isOwner ? summary.frozen_fen ?? 0 : summary.reserved_fen) : '—'}</strong></span>{isOwner && <Button variant="lime" size="sm" disabled={busy || !summary} onClick={openBudget}>{tr("teamBillingPanel.setTotalLimit")}</Button>}</div><div className="pf-team-billing-wallet-pattern" aria-hidden="true">P/F</div></section><section className="pf-team-panel pf-team-billing-stat"><span className="pf-team-muted">{isOwner ? tr("teamBillingPanel.teamSpendThisMonth") : tr("teamBillingPanel.myMonthlyLimit")}</span><strong>{summary ? isOwner ? money(summary.spent_fen) : summary.monthly_limit_fen === null ? tr("teamBillingPanel.noLimit") : money(summary.monthly_limit_fen) : '—'}</strong><p>{summary?.period || tr("teamBillingPanel.loadingStats")}</p></section><section className="pf-team-panel pf-team-billing-stat"><span className="pf-team-muted">{isOwner ? tr("teamBillingPanel.teamMonthlyLimit") : tr("teamBillingPanel.myInFlightReserve")}</span><strong>{isOwner ? summary?.team_monthly_limit_fen == null ? tr("teamBillingPanel.noLimit") : money(summary.team_monthly_limit_fen) : summary ? money(summary.reserved_fen) : '—'}</strong><p>{isOwner ? summary ? tr('teamBillingPanel.reservedAmount', { amount: money(summary.reserved_fen) }) : tr("teamBillingPanel.setPersonalLimitsInMembers") : tr("teamBillingPanel.settledOnActualUsage")}</p></section></div><div className="pf-team-billing-info"><p>{isOwner ? tr("teamBillingPanel.ownerNote") : tr("teamBillingPanel.memberNote")}{summary && !summary.billing_enabled && tr('teamBillingPanel.billingDisabledNote')}</p>{isOwner && <Link className="pf-link" to="/pricing">{tr("teamBillingPanel.topUpPersonal")}</Link>}</div>{error && <div className="pf-team-alert" role="alert">{error}</div>}
    <section className="pf-team-panel"><div className="pf-team-section-head"><h2>{isOwner ? tr("teamBillingPanel.teamCharges") : tr("teamBillingPanel.myCharges")}</h2><span className="pf-team-tag">{tr("teamBillingPanel.points")}</span></div><div className="pf-team-billing-toolbar"><label className="pf-team-billing-search"><Search size={16} /><input aria-label={tr("teamBillingPanel.searchCharges")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={tr("teamBillingPanel.searchContentOrModel")} /></label>{isOwner && <label className="pf-team-field">{tr("teamBillingPanel.memberId")}<input inputMode="numeric" value={member} onChange={(event) => { setMember(event.target.value); setPage(1) }} placeholder={tr("teamBillingPanel.allMembers")} /></label>}<label className="pf-team-field">{tr("teamBillingPanel.projectId")}<input inputMode="numeric" value={project} onChange={(event) => { setProject(event.target.value); setPage(1) }} placeholder={tr("teamBillingPanel.allProjects")} /></label><label className="pf-team-field">{tr("teamBillingPanel.month")}<input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }} /></label></div>{listing.loading ? <p role="status">{tr("teamBillingPanel.loadingCharges")}</p> : listing.error ? <div className="pf-team-alert" role="alert">{listing.error}<Button onClick={listing.retry}>{tr("teamBillingPanel.retry")}</Button></div> : listing.items.length ? <div className="pf-team-table-wrap"><table className="pf-team-table"><thead><tr><th>{tr("teamBillingPanel.content")}</th>{isOwner && <th>{tr("teamBillingPanel.member")}</th>}<th>{tr("teamBillingPanel.project")}</th><th>{tr("teamBillingPanel.time")}</th><th>{tr("teamBillingPanel.pointsUsed")}</th></tr></thead><tbody>{listing.items.map((charge) => <tr key={charge.id}><td><div className="pf-team-billing-charge"><CreditCard size={17} /><div><strong>{charge.label}</strong><small>{charge.model}</small></div></div></td>{isOwner && <td>{team.members.find((m) => m.id === charge.memberId)?.name || tr('teamBillingPanel.memberN', { id: charge.memberId })}</td>}<td>#{charge.projectId}</td><td>{formatDateTime(charge.createdAt)}</td><td>{money(charge.amountFen)}</td></tr>)}</tbody></table></div> : <div className="pf-team-empty">{tr("teamBillingPanel.noCharges")}</div>}<TeamPagination page={page} total={listing.meta.total} onChange={setPage} /></section>
    <Modal open={budgetOpen && isOwner} onClose={() => setBudgetOpen(false)} dismissible={!busy} title={tr("teamBillingPanel.budgetTitle")}><div className="pf-team-form"><p>{tr("teamBillingPanel.budgetNote")}</p><label><input type="checkbox" checked={unlimited} disabled={busy} onChange={(event) => setUnlimited(event.target.checked)} /> {tr("teamBillingPanel.noLimit")}</label><label className="pf-team-field">{tr("teamBillingPanel.monthlyLimitPoints")}<input inputMode="numeric" disabled={unlimited || busy} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>{error && <p className="pf-team-alert" role="alert">{error}</p>}<Button variant="lime" onClick={saveBudget} disabled={busy}>{busy ? tr("teamBillingPanel.saving") : tr("teamBillingPanel.saveLimit")}</Button></div></Modal>
  </div>
}
