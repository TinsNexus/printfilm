import { cn } from '../../lib/cn'
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../lib/pagination'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
  /** 总条数，传入后显示摘要 */
  total?: number
  /** 当前每页条数 */
  pageSize?: number
  /** 每页条数选项；配合 onPageSizeChange 显示切换器 */
  pageSizeOptions?: readonly number[]
  onPageSizeChange?: (pageSize: number) => void
  className?: string
  ariaLabel?: string
  /** 是否显示「第 x / y 页 · 共 z 条」摘要 */
  showSummary?: boolean
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

/** 统一分页控件：页码导航 + 可选每页条数 + 摘要 */
export default function Pagination({
  page,
  pageCount,
  onChange,
  total,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  className,
  ariaLabel = '分页',
  showSummary = true,
}: Props) {
  const sizeOptions = onPageSizeChange ? pageSizeOptions : undefined
  const canPickSize = Boolean(sizeOptions?.length && pageSize && onPageSizeChange)
  const showNav = pageCount > 1
  const summaryVisible = showSummary && total != null && total >= 0

  if (!showNav && !canPickSize && !summaryVisible) return null

  const items = buildPageItems(page, pageCount)

  return (
    <div className={cn('pf-list-pagination', className)}>
      {summaryVisible ? (
        <p className="pf-list-pagination-summary">
          第 {page} / {pageCount} 页 · 共 {total} 条
        </p>
      ) : null}

      {(showNav || canPickSize) && (
        <div className="pf-list-pagination-bar">
          {canPickSize ? (
            <label className="pf-page-size">
              <span>每页</span>
              <select
                value={pageSize}
                aria-label="每页条数"
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              >
                {sizeOptions!.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>条</span>
            </label>
          ) : null}

          {showNav ? (
            <nav className="pf-pagination" aria-label={ariaLabel}>
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
          ) : null}
        </div>
      )}
    </div>
  )
}
