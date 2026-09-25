import { tr } from '../../i18n/translate'
type PayBrand = 'alipay' | 'wxpay' | 'unionpay'

type Props = {
  brand: PayBrand
  /** sm 用于按钮内；md 用于弹窗标题 */
  size?: 'sm' | 'md'
  className?: string
}

const BRAND_META: Record<PayBrand, { src: string; altKey: string }> = {
  alipay: { src: '/payment/alipay.svg', altKey: 'pricing.alipay' },
  wxpay: { src: '/payment/wechatpay.svg', altKey: 'pricing.wechat' },
  unionpay: { src: '/payment/unionpay.svg', altKey: 'pricing.unionpay' },
}

/** 支付渠道品牌图标 */
export default function PaymentBrandIcon({ brand, size = 'sm', className = '' }: Props) {
  const meta = BRAND_META[brand]
  return (
    <img
      src={meta.src}
      alt={tr(meta.altKey)}
      className={`pf-pay-brand-icon is-${size}${className ? ` ${className}` : ''}`}
      width={size === 'md' ? 28 : 22}
      height={size === 'md' ? 28 : 22}
      loading="lazy"
      decoding="async"
    />
  )
}
