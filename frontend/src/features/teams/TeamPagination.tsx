import Button from '../../components/ui/Button'
import { tv } from '../../i18n/tv'

/** 团队列表公用分页控件，页数由服务器 total 决定。 */
export function TeamPagination({ page, total, size = 12, onChange }: { page: number; total: number; size?: number; onChange: (page: number) => void }) {
  return total > size ? <div className="pf-team-modal-actions"><span className="pf-team-muted">{tv("共", "Tổng")} {total} {tv("项 · 第", "mục · Trang")} {page} / {Math.ceil(total / size)} {tv("页", "")}</span><Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{tv("上一页", "Trang trước")}</Button><Button size="sm" disabled={page * size >= total} onClick={() => onChange(page + 1)}>{tv("下一页", "Trang sau")}</Button></div> : null
}
