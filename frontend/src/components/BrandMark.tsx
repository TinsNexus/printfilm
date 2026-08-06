import { Link } from 'react-router-dom'

type Props = {
  to?: string
  light?: boolean
}

export default function BrandMark({ to = '/', light = false }: Props) {
  return (
    <Link to={to} className={light ? 'brand-mark brand-mark-light' : 'brand-mark'}>
      <img src="/logo.svg" alt="" className="brand-logo" width={28} height={28} />
      <span className="brand-word">PRINTFILM</span>
    </Link>
  )
}
