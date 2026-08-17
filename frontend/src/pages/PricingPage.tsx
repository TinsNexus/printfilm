import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2,
  Check,
  CreditCard,
  Infinity,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PaymentBrandIcon from '../components/billing/PaymentBrandIcon'
import PaymentModal, { type PayCheckout } from '../components/billing/PaymentModal'
import PricingWalletCard from '../components/billing/PricingWalletCard'
import TopupHistoryModal from '../components/billing/TopupHistoryModal'
import { api, type BillingSku, type UsageSummary, type Wallet } from '../api'

type PayType = 'alipay' | 'wxpay'

type SkuView = BillingSku & { recommended?: boolean }

const HERO_FEATURES = [
  { icon: Zap, text: '充值即时到账，马上可用' },
  { icon: ShieldCheck, text: '支付安全保障' },
  { icon: Infinity, text: '余额永久有效' },
] as const

const SKU_LABELS: Record<string, string> = {
  topup_10: '体验充值',
  topup_49: '基础充值',
  topup_99: '进阶充值',
  topup_199: '专业充值',
}

const SKU_HINTS: Record<string, string> = {
  topup_10: '适合初次体验',
  topup_49: '日常创作够用',
  topup_99: '高频创作推荐',
  topup_199: '团队 / 批量生产',
}

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function yuanShort(fen: number) {
  const v = fen / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** 定价与充值页 */
export default function PricingPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [skus, setSkus] = useState<SkuView[]>([])
  const [payType, setPayType] = useState<PayType>('alipay')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [payTip, setPayTip] = useState('')
  const [checkout, setCheckout] = useState<PayCheckout | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const loggedIn = Boolean(localStorage.getItem('token'))

  const displaySkus = useMemo(() => {
    return skus.map((s) => ({
      ...s,
      recommended: s.id === 'topup_99' || Boolean((s as SkuView).recommended),
    }))
  }, [skus])

  async function refresh() {
    if (!loggedIn) {
      setWallet(null)
      setUsage(null)
      setUpdatedAt(null)
      return
    }
    try {
      const [w, u] = await Promise.all([api.wallet(), api.usageSummary()])
      setWallet(w)
      setUsage(u)
      setUpdatedAt(new Date())
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    api.billingSkus().then((r) => setSkus((r.skus || []) as SkuView[]))
    refresh()
    if (params.get('paid') === '1') {
      setHint('支付完成。若余额未更新，请稍候刷新本页。')
      const t = window.setInterval(() => refresh(), 2500)
      return () => window.clearInterval(t)
    }
  }, [])

  async function pay(sku: BillingSku) {
    if (!loggedIn) {
      nav(`/auth?next=${encodeURIComponent(`/pricing#sku-${sku.id}`)}`)
      return
    }
    setBusy(sku.id)
    setError('')
    try {
      const order = await api.createBillingOrder(sku.id, payType)
      const label = SKU_LABELS[sku.id] || order.sku_name || sku.name
      setCheckout({
        out_trade_no: order.out_trade_no,
        sku_id: order.sku_id || sku.id,
        sku_name: label,
        pay_type: order.pay_type,
        amount_fen: order.amount_fen,
        credit_fen: order.credit_fen,
        qr_payload: order.qr_payload || order.qrcode || order.payurl || order.img || '',
        img: order.img,
        expire_seconds: order.expire_seconds ?? 300,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '下单失败')
    } finally {
      setBusy(null)
    }
  }

  function pickPay(type: PayType) {
    setPayType(type)
    setPayTip('')
  }

  function pickUnavailable(label: string) {
    setPayTip(`${label}即将上线，请先使用支付宝或微信支付`)
  }

  async function onPaid() {
    setHint('支付成功，余额已更新')
    setCheckout(null)
    await refresh()
  }

  return (
    <AppShell active="pricing" hideFooter wide>
      <div className="pf-pricing-page">
        <section className="pf-pricing-hero-band">
          <div className="pf-pricing-hero-inner">
            <div className="pf-pricing-hero-copy">
              <h1>按需充值，灵活使用</h1>
              <p>按实际消耗 token 计费，余量永久有效，不设过期</p>
              <ul className="pf-pricing-hero-features">
                {HERO_FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text}>
                    <span className="pf-pricing-hero-feature-icon" aria-hidden>
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              {!loggedIn ? (
                <p className="pf-pricing-guest-tip">
                  <Link to="/auth?next=%2Fpricing">登录</Link> 后查看余额与本月用量
                </p>
              ) : null}
            </div>
            <PricingWalletCard
              wallet={wallet}
              usage={usage}
              loggedIn={loggedIn}
              updatedAt={updatedAt}
              onHistory={() => setHistoryOpen(true)}
            />
          </div>
        </section>

        <div className="pf-pricing-body">
          {hint ? <p className="pf-pricing-hint">{hint}</p> : null}
          {error ? <p className="pf-error pf-pricing-error">{error}</p> : null}

          <section className="pf-pricing-pay-section" aria-label="支付方式">
            <header className="pf-pricing-section-head is-row">
              <h2>支付方式</h2>
              <div className="pf-pricing-pay-trust">
                <ShieldCheck size={16} aria-hidden />
                <span>支付安全保障</span>
              </div>
            </header>

            {payTip ? <p className="pf-pricing-pay-tip">{payTip}</p> : null}

            <div className="pf-pricing-pay-grid">
              <button
                type="button"
                className={`pf-pricing-pay-tile${payType === 'alipay' ? ' is-active' : ''}`}
                onClick={() => pickPay('alipay')}
                aria-pressed={payType === 'alipay'}
              >
                <PaymentBrandIcon brand="alipay" size="md" />
                <span className="pf-pricing-pay-tile-label">支付宝</span>
                <span className="pf-pricing-pay-tile-badge">推荐</span>
                {payType === 'alipay' ? (
                  <span className="pf-pricing-pay-tile-check" aria-hidden>
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className={`pf-pricing-pay-tile${payType === 'wxpay' ? ' is-active' : ''}`}
                onClick={() => pickPay('wxpay')}
                aria-pressed={payType === 'wxpay'}
              >
                <PaymentBrandIcon brand="wxpay" size="md" />
                <span className="pf-pricing-pay-tile-label">微信支付</span>
                {payType === 'wxpay' ? (
                  <span className="pf-pricing-pay-tile-check" aria-hidden>
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className="pf-pricing-pay-tile is-disabled"
                title="即将上线"
                onClick={() => pickUnavailable('银联支付')}
              >
                <PaymentBrandIcon brand="unionpay" size="md" />
                <span className="pf-pricing-pay-tile-label">银联支付</span>
                <span className="pf-pricing-pay-tile-soon">即将上线</span>
              </button>

              <button
                type="button"
                className="pf-pricing-pay-tile is-disabled"
                title="企业用户请联系客服"
                onClick={() => pickUnavailable('对公转账')}
              >
                <span className="pf-pricing-pay-tile-icon" aria-hidden>
                  <Building2 size={22} strokeWidth={1.8} />
                </span>
                <span className="pf-pricing-pay-tile-label">对公转账</span>
                <span className="pf-pricing-pay-tile-sub">企业用户</span>
              </button>
            </div>
          </section>

          <section className="pf-pricing-skus" id="pricing-skus">
            <header className="pf-pricing-section-head">
              <h2>选择充值金额</h2>
            </header>

            <div className="pf-pricing-sku-grid">
              {displaySkus.map((sku) => {
                const bonus = sku.credit_fen - sku.amount_fen
                const recommended = Boolean(sku.recommended)
                const label = SKU_LABELS[sku.id] || sku.name
                const tierHint = SKU_HINTS[sku.id] || '余额永久有效'
                return (
                  <article
                    key={sku.id}
                    id={`sku-${sku.id}`}
                    className={`pf-pricing-sku-card${recommended ? ' is-recommended' : ''}`}
                  >
                    {recommended ? <span className="pf-pricing-rec-badge">推荐</span> : null}
                    <p className="pf-pricing-sku-tier">{label}</p>
                    <p className="pf-pricing-sku-hint">{tierHint}</p>
                    <div className="pf-pricing-sku-price">
                      <span className="yen">¥</span>
                      <strong>{(sku.amount_fen / 100).toFixed(0)}</strong>
                    </div>
                    <p className="pf-pricing-sku-credit">
                      到账 <em>¥{yuan(sku.credit_fen)}</em>
                    </p>
                    {bonus > 0 ? (
                      <p className="pf-pricing-sku-bonus">额外赠送 ¥{yuanShort(bonus)}</p>
                    ) : (
                      <p className="pf-pricing-sku-bonus is-empty">&nbsp;</p>
                    )}
                    <button
                      type="button"
                      className={`pf-pricing-sku-cta${recommended ? ' is-primary' : ''}`}
                      disabled={Boolean(busy)}
                      onClick={() => pay(sku)}
                    >
                      {busy === sku.id ? '下单中…' : '立即充值'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="pf-pricing-info">
            <article className="pf-pricing-info-card">
              <div className="pf-pricing-info-visual is-billing" aria-hidden>
                <CreditCard size={28} strokeWidth={1.6} />
              </div>
              <div>
                <h3>计费说明</h3>
                <ul>
                  <li>拆分镜、出图、配音、AI 视频分别按上游 token 用量计费</li>
                  <li>开始生成时预扣估算金额，结束后按实际用量结算（多退少补）</li>
                  <li>图文模式成本更低；开启 AI 动态视频时消耗更高</li>
                </ul>
              </div>
            </article>
            <article className="pf-pricing-info-card">
              <div className="pf-pricing-info-visual is-value" aria-hidden>
                <Check size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h3>为什么按量计费</h3>
                <ul className="pf-pricing-checks">
                  <li>无需订阅，用多少充多少</li>
                  <li>余额永久有效，不设过期</li>
                  <li>账单清晰可查，每次调用可追溯</li>
                </ul>
              </div>
            </article>
          </section>

          <footer className="pf-pricing-site-foot">
            <p className="pf-pricing-site-brand">
              <Link to="/">PRINTFILM</Link>
              <span> · AI 短视频创作伙伴</span>
            </p>
            <nav className="pf-pricing-site-links" aria-label="页脚链接">
              <Link to="/terms">用户协议</Link>
              <Link to="/privacy">隐私政策</Link>
              <Link to="/contact">联系我们</Link>
            </nav>
            <p className="pf-pricing-site-copy">© {new Date().getFullYear()} PRINTFILM. All rights reserved.</p>
          </footer>
        </div>
      </div>

      <PaymentModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={() => setCheckout(null)}
        onPaid={() => void onPaid()}
      />
      <TopupHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </AppShell>
  )
}
