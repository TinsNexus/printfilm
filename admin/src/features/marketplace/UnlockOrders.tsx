import { tr } from "../../i18n/translate.ts";
import { formatDateTime } from "../../i18n/detect.ts";
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PaginationBar } from '@/components/PaginationBar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { points } from '@/lib/points'
import { request, type Listing } from './api'

/** 平台订单查询：购买者扣除的积分，不是创作者个人钱包。 */
export default function UnlockOrders({ revision = 0 }: { revision?: number }) {
  const [environment, setEnvironment] = useState('Production')
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setListing(null)
    const params = new URLSearchParams({ environment, page: String(page), page_size: '20' })
    if (status) params.set('status', status)
    if (userId) params.set('user_id', userId)
    request<Listing>(`/api/admin/marketplace/app/unlock-orders?${params}`)
      .then(value => { if (active) setListing(value) })
      .catch(cause => { if (active) setError((cause as Error).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [environment, status, userId, page, refresh, revision])
  return <section aria-label={tr('mkOps.unlock.title')} className="grid gap-4">
    <div><h2>{tr('mkOps.unlock.title')}</h2><p className="market-ops-context">{tr('mkOps.unlock.desc')}</p></div>
    <div className="market-ops-filter">
      <label>{tr('mkOps.unlock.env')}<select aria-label={tr('mkOps.unlock.env')} value={environment} onChange={event => { setEnvironment(event.target.value); setPage(1) }}><option value="Production">{tr('mkOps.env.production')}</option><option value="Sandbox">{tr('mkOps.env.sandbox')}</option></select></label>
      <label>{tr('mkOps.unlock.status')}<select aria-label={tr('mkOps.unlock.status')} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">{tr('mkOps.allStatuses')}</option><option value="paid">{tr('mkOps.unlock.paid')}</option><option value="revoked">{tr('mkOps.unlock.revoked')}</option></select></label>
      <label>{tr('mkOps.unlock.buyerId')}<input aria-label={tr('mkOps.unlock.buyerId')} type="text" inputMode="numeric" value={userId} onChange={event => { if (/^\d*$/.test(event.target.value)) { setUserId(event.target.value); setPage(1) } }} placeholder={tr('mkOps.unlock.allBuyers')} /></label>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> {tr('mkOps.unlock.refresh')}</button>
    </div>
    {environment === 'Sandbox' && <p className="market-ops-context">{tr('mkOps.unlock.sandboxNote')}</p>}
    {error && <p role="alert" className="market-ops-feedback is-error">{tr('mkOps.unlock.loadFailed', { error })}<button type="button" onClick={() => setRefresh(value => value + 1)}>{tr('mkOps.retry')}</button></p>}
    {loading ? <p role="status">{tr('mkOps.unlock.loading')}</p> : listing && <>
      <p>{tr('mkOps.unlock.totalN', { n: listing.meta.total })}</p>
      <Table><TableHeader><TableRow>{[tr('mkOps.unlock.colId'), tr('mkOps.unlock.colOrderId'), tr('mkOps.unlock.buyerId'), tr('mkOps.unlock.colPublication'), tr('mkOps.unlock.colCoins'), tr('mkOps.status'), tr('mkOps.unlock.colTime')].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{listing.items.length ? listing.items.map(item => <TableRow key={item.id}>
          <TableCell>#{item.id}</TableCell><TableCell>#{String(item.order_id)}</TableCell><TableCell>#{String(item.user_id)}</TableCell><TableCell>#{String(item.publication_id)}</TableCell>
          <TableCell>{points(item.coins)}</TableCell><TableCell>{item.status === 'paid' ? tr('mkOps.unlock.paid') : item.status === 'revoked' ? tr('mkOps.unlock.revoked') : String(item.status)}</TableCell>
          <TableCell>{item.created_at ? formatDateTime(String(item.created_at)) : '—'}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7}>{tr('mkOps.unlock.empty')}</TableCell></TableRow>}</TableBody>
      </Table>
      <PaginationBar page={page} pageSize={listing.meta.page_size} total={listing.meta.total} onPageChange={setPage} />
    </>}
  </section>
}
