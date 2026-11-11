import Button from '../../components/ui/Button'
import { tr } from '../../i18n/translate.ts'

/** 团队列表公用分页控件，页数由服务器 total 决定。 */
export function TeamPagination({ page, total, size = 12, onChange }: { page: number; total: number; size?: number; onChange: (page: number) => void }) {
  const pages = Math.ceil(total / size)
  return total > size ? <div className="pf-team-modal-actions"><span className="pf-team-muted">{tr('teamPagination.itemsPage', { total, page, pages })}</span><Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{tr('teamPagination.previous')}</Button><Button size="sm" disabled={page * size >= total} onClick={() => onChange(page + 1)}>{tr('teamPagination.next')}</Button></div> : null
}
