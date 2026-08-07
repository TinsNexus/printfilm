type Props = {
  label?: string
}

export default function ComingSoon({ label = '即将推出' }: Props) {
  return <span className="pf-coming">{label}</span>
}
