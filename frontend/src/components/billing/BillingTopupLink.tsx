import { Link } from 'react-router-dom'
import { PRICING_PATH } from '../../lib/billingError'
import { tr } from '../../i18n/translate.ts'

type Props = {
  className?: string
  children?: string
}

/** 内联「去充值」快速跳转 */
export default function BillingTopupLink({ className = 'pf-link pf-billing-topup-link', children = tr('billingTopupLink.topUp') }: Props) {
  return (
    <Link to={PRICING_PATH} className={className}>
      {children}
    </Link>
  )
}
