import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { api, type BillingOrder } from '../../api'
import { useI18n } from '../../i18n'
import { tr } from '../../i18n/translate'

type Props = {
  open: boolean
  onClose: () => void
}

// 套餐 / 状态 → 文案键（展示时再翻译，避免模块级常量固化语言）
const SKU_LABEL_KEY: Record<string, string> = {
  topup_10: 'topupHistory.skuTopup10',
  topup_49: 'topupHistory.skuTopup49',
  topup_99: 'topupHistory.skuTopup99',
  topup_199: 'topupHistory.skuTopup199',
}

const STATUS_KEY: Record<string, string> = {
  pending: 'topupHistory.statusPending',
  paid: 'topupHistory.statusPaid',
  closed: 'topupHistory.statusClosed',
}

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function formatTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 充值记录弹窗：列出近期订单与到账状态（过期待支付由后台自动关闭） */
export default function TopupHistoryModal({ open, onClose }: Props) {
  const { t: tx } = useI18n()
  /*
   * orders 订单列表
   * loading 加载中
   * error 错误信息
   */
  const [orders, setOrders] = useState<BillingOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .listBillingOrders(50)
      .then((r) => {
        if (!cancelled) setOrders(r.orders || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tr('topupHistory.failedLoad'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={tx('topupHistory.topUpHistory')} size="lg" className="pf-topup-history-modal">
      {loading ? <p className="pf-muted">{tx('topupHistory.loading')}</p> : null}
      {error ? <p className="pf-error">{error}</p> : null}
      {!loading && !error && orders.length === 0 ? (
        <p className="pf-muted">{tx('topupHistory.topUpsYet')}</p>
      ) : null}
      {!loading && orders.length > 0 ? (
        <ul className="pf-topup-list">
          {orders.map((o) => (
            <li key={o.out_trade_no} className="pf-topup-item">
              <div className="pf-topup-main">
                <strong>{SKU_LABEL_KEY[o.sku_id] ? tx(SKU_LABEL_KEY[o.sku_id]) : o.sku_name}</strong>
                <span className="pf-muted">{formatTime(o.paid_at || o.created_at)}</span>
              </div>
              <div className="pf-topup-meta">
                <em>¥{yuan(o.amount_fen)}</em>
                <span className="pf-muted">{tx('topupHistory.credited', { amount: yuan(o.credit_fen) })}</span>
                <span className={`pf-topup-status is-${o.status}`}>
                  {STATUS_KEY[o.status] ? tx(STATUS_KEY[o.status]) : o.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  )
}
