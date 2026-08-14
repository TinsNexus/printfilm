import { cn } from '../../lib/cn'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
  className?: string
  ariaLabel?: string
}

// 生成带省略号的页码序列
function buildPageItems(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  const items: Array<number | '…'> = [1]
  if (page > 3) items.push('…')
  for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) {
    items.push(i)
  }
  if (page < pageCount - 2) items.push('…')
  items.push(pageCount)
  return items
}

/** 统一分页控件 */
export default function Pagination({
  page,
  pageCount,
  onChange,
  className,
  ariaLabel = '分页',
}: Props) {
  if (pageCount <= 1) return null

  const items = buildPageItems(page, pageCount)

  return (
    <nav className={cn('pf-pagination', className)} aria-label={ariaLabel}>
      <button
        type="button"
        className="pf-page-btn"
        disabled={page <= 1}
        aria-label="上一页"
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        ‹
      </button>
      {items.map((item, i) =>
        item === '…' ? (
          <span key={`e-${i}`} className="pf-page-ellipsis">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={cn('pf-page-btn', page === item && 'active')}
            aria-current={page === item ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="pf-page-btn"
        disabled={page >= pageCount}
        aria-label="下一页"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
      >
        ›
      </button>
    </nav>
  )
}
