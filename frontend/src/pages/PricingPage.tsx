import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import PaymentModal, { type PayCheckout } from '../components/billing/PaymentModal'
import TopupHistoryModal from '../components/billing/TopupHistoryModal'
import { api, type BillingSku, type Wallet } from '../api'

type PayType = 'alipay' | 'wxpay'

type SkuView = BillingSku & { recommended?: boolean }

function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function yuanShort(fen: number) {
  const v = fen / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** Prefer design labels even if API still returns legacy names. */
const SKU_LABELS: Record<string, string> = {
  topup_10: '体验充值',
  topup_49: '基础充值',
  topup_99: '进阶充值',
  topup_199: '专业充值',
}

function planLabel(wallet: Wallet | null) {
  if (!wallet) return 'Free'
  if (wallet.billing_unlimited) return 'Unlimited'
  const p = (wallet.plan || 'free').toLowerCase()
  if (p === 'free') return 'Free'
  if (p === 'pro') return 'Pro'
  return wallet.plan
}

export default function PricingPage() {
  const [params] = useSearchParams()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [skus, setSkus] = useState<SkuView[]>([])
  const [payType, setPayType] = useState<PayType>('alipay')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [checkout, setCheckout] = useState<PayCheckout | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month')
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
      return
    }
    try {
      setWallet(await api.wallet())
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
      setError('请先登录后再充值')
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

  function closeCheckout() {
    setCheckout(null)
  }

  async function onPaid() {
    setHint('支付成功，余额已更新')
    setCheckout(null)
    await refresh()
  }

  const balanceYuan = wallet?.balance_yuan ?? 0
  const frozenYuan = wallet?.frozen_yuan ?? 0

  return (
    <AppShell active="pricing">
      <div className="pf-pricing-page">
        <section className="pf-pricing-hero">
          <div className="pf-pricing-hero-copy">
            <span className="pf-pricing-pill">简单透明 · 按量计费</span>
            <h1>按需充值，用多少算多少</h1>
            <p>按上游模型 token 实际用量计费，余额永久有效，无订阅、无隐藏费用。</p>
          </div>

          <div className="pf-pricing-balance-card">
            <div className="pf-pricing-balance-main">
              <span className="pf-pricing-balance-label">可用余额</span>
              <strong>¥{balanceYuan.toFixed(2)}</strong>
            </div>
            <div className="pf-pricing-balance-side">
              <span className="pf-pricing-balance-label">冻结中</span>
              <em>¥{frozenYuan.toFixed(2)}</em>
            </div>
            <div className="pf-pricing-balance-side">
              <span className="pf-pricing-balance-label">当前套餐</span>
              <em>{planLabel(wallet)}</em>
            </div>
            <button
              type="button"
              className="pf-pricing-history-btn"
              disabled={!loggedIn}
              title={loggedIn ? '查看充值记录' : '请先登录'}
              onClick={() => setHistoryOpen(true)}
            >
              充值记录
            </button>
          </div>
        </section>

        {hint ? <p className="pf-pricing-hint">{hint}</p> : null}
        {error ? <p className="pf-error pf-pricing-error">{error}</p> : null}

        <div className="pf-billing-toggle" role="group" aria-label="计费周期">
          <button
            type="button"
            className={billingCycle === 'month' ? 'is-active' : ''}
            onClick={() => setBillingCycle('month')}
          >
            按月付费
          </button>
          <button
            type="button"
            className={billingCycle === 'year' ? 'is-active' : ''}
            onClick={() => setBillingCycle('year')}
          >
            按年付费
            <span className="pf-billing-save">省 20%</span>
          </button>
        </div>

        <section className="pf-plan-grid" aria-label="套餐一览">
          {[
            {
              id: 'free',
              name: '免费版',
              priceMonth: '0',
              priceYear: '0',
              desc: '体验创作流程',
              features: ['基础额度试用', '科普分镜流水线', '漫剧项目创建'],
              cta: '当前方案',
              primary: false,
            },
            {
              id: 'pro',
              name: '专业版',
              priceMonth: '79',
              priceYear: '63',
              desc: '个人创作者推荐',
              features: ['按量充值叠加', 'AI 视频与配音', '优先队列（规划中）'],
              cta: '立即订阅',
              primary: true,
            },
            {
              id: 'team',
              name: '团队版',
              priceMonth: '299',
              priceYear: '239',
              desc: '团队协作即将上线',
              features: ['成员席位', '共享资产库', '对公结算'],
              cta: '联系我们',
              primary: false,
              disabled: true,
            },
          ].map((plan) => {
            const price = billingCycle === 'year' ? plan.priceYear : plan.priceMonth
            return (
              <article key={plan.id} className={`pf-plan-card${plan.primary ? ' is-primary' : ''}`}>
                {plan.primary ? <span className="pf-pricing-rec-badge">推荐</span> : null}
                <h3>{plan.name}</h3>
                <p className="pf-plan-desc">{plan.desc}</p>
                <div className="pf-plan-price">
                  <span className="yen">¥</span>
                  <strong>{price}</strong>
                  <span className="unit">/{billingCycle === 'year' ? '月·年付' : '月'}</span>
                </div>
                <ul className="pf-plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>
                      <span aria-hidden>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`pf-btn ${plan.primary ? 'pf-btn-lime' : 'pf-btn-ghost'} pf-btn-sm`}
                  disabled={plan.disabled}
                  onClick={() => {
                    if (plan.id === 'pro') {
                      document.getElementById('pricing-skus')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                >
                  {plan.cta}
                </button>
              </article>
            )
          })}
        </section>

        <section className="pf-pricing-skus" id="pricing-skus">
          <header className="pf-pricing-section-head">
            <h2>选择充值金额</h2>
            <p>充值即时到账，赠送金额自动计入余额</p>
          </header>

          <div className="pf-pricing-sku-grid">
            {displaySkus.map((sku) => {
              const bonus = sku.credit_fen - sku.amount_fen
              const recommended = Boolean(sku.recommended)
              return (
                <article
                  key={sku.id}
                  className={`pf-pricing-sku-card${recommended ? ' is-recommended' : ''}`}
                >
                  {recommended ? <span className="pf-pricing-rec-badge">推荐</span> : null}
                  <h3>{SKU_LABELS[sku.id] || sku.name}</h3>
                  <div className="pf-pricing-sku-price">
                    <span className="yen">¥</span>
                    <strong>{(sku.amount_fen / 100).toFixed(0)}</strong>
                  </div>
                  <p className="pf-pricing-sku-credit">到账 ¥{yuan(sku.credit_fen)}</p>
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

        <section className="pf-pricing-paybar">
          <div className="pf-pricing-pay-left">
            <span className="pf-pricing-pay-label">支付方式</span>
            <button
              type="button"
              className={`pf-pricing-pay-opt${payType === 'alipay' ? ' is-active' : ''}`}
              onClick={() => setPayType('alipay')}
            >
              <span className="pf-pay-logo alipay" aria-hidden />
              支付宝
              {payType === 'alipay' ? <span className="pf-pay-check" aria-hidden>✓</span> : null}
            </button>
            <button
              type="button"
              className={`pf-pricing-pay-opt${payType === 'wxpay' ? ' is-active' : ''}`}
              onClick={() => setPayType('wxpay')}
            >
              <span className="pf-pay-logo wxpay" aria-hidden />
              微信支付
              {payType === 'wxpay' ? <span className="pf-pay-check" aria-hidden>✓</span> : null}
            </button>
          </div>
          <div className="pf-pricing-pay-secure">
            <span className="pf-pay-shield" aria-hidden />
            支付安全保障
          </div>
        </section>

        <section className="pf-pricing-info">
          <div>
            <h3>计费说明</h3>
            <ul>
              <li>拆分镜、出图、配音、AI 视频分别按上游 token 用量计费</li>
              <li>开始生成时预扣估算金额，结束后按实际用量结算（多退少补）</li>
              <li>图文模式成本更低；开启 AI 动态视频时消耗更高</li>
            </ul>
          </div>
          <div>
            <h3>为什么按量计费</h3>
            <ul className="pf-pricing-checks">
              <li>无需订阅，用多少充多少</li>
              <li>余额永久有效，不设过期</li>
              <li>账单清晰可查，每次调用可追溯</li>
            </ul>
          </div>
        </section>

        <p className="pf-pricing-foot">
          <Link to="/">PRINTFILM</Link>
          <span> · AI 知识视频创作伙伴</span>
        </p>
      </div>

      <PaymentModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={closeCheckout}
        onPaid={() => void onPaid()}
      />
      <TopupHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </AppShell>
  )
}
