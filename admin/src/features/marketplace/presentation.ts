const reviewStatuses: Record<string, string> = {
  draft: 'Bản nháp', pending: 'Chờ duyệt', processing: 'Đang tạo bản xem thử ngắn', preview_failed: 'Tạo xem thử ngắn thất bại', approved: 'Đã duyệt', rejected: 'Đã từ chối',
}
const taskStatuses: Record<string, string> = {
  pending: 'Đang xếp hàng', running: 'Đang xử lý', processing: 'Đang xử lý', done: 'Đã hoàn tất', ready: 'Đã sẵn sàng', failed: 'Xử lý thất bại', cancelled: 'Đã hủy', missing: 'Chưa tạo', none: 'Chưa tạo',
}
const domainStatuses: Record<string, Record<string, string>> = {
  works: reviewStatuses,
  series: reviewStatuses,
  recruits: { draft: 'Bản nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' },
  previews: { pending: 'Đang xếp hàng', running: 'Đang xử lý', done: 'Đã hoàn tất', failed: 'Xử lý thất bại', cancelled: 'Đã hủy' },
  jobs: { pending: 'Đang xếp hàng', running: 'Đang xử lý', done: 'Đã hoàn tất', failed: 'Xử lý thất bại' },
  orders: { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', failed: 'Thanh toán thất bại' },
  payouts: { pending: 'Chờ chi trả', paid: 'Đã chi trả', failed: 'Chi trả thất bại' },
  reports: { pending: 'Chờ xử lý', resolved: 'Đã xử lý' },
  entitlements: { active: 'Quyền lợi hiệu lực', inactive: 'Đã tắt' },
}

// 每种记录只提供服务端支持的状态筛选，避免把收益方式当作状态。
export function statusOptions(kind: string): [string, string][] {
  return Object.entries(domainStatuses[kind] || {})
}

export function statusLabel(kind: string, status: unknown): string {
  if (kind === 'ledger') return ({ pending: 'Chờ quyết toán', settled: 'Đã quyết toán' } as Record<string, string>)[String(status)] || 'Trạng thái quyết toán chờ xác nhận'
  return domainStatuses[kind]?.[String(status)] || 'Trạng thái chờ xác nhận'
}

export function recordStatus(kind: string, item: Record<string, unknown>): string {
  if (kind === 'entitlements') return item.active ? 'active' : 'inactive'
  if (kind === 'ledger') return String(item.settlement_status || 'pending')
  return String(item.audit_status || item.status || item.selection || '')
}

export function fieldStatusLabel(field: string, value: unknown): string | undefined {
  if (field === 'audit_status' || field === 'basic_status' || field === 'full_status') return reviewStatuses[String(value)]
  if (field === 'preview_status' || field === 'playback_status' || field === 'media_status') return taskStatuses[String(value)]
  if (field === 'settlement_status') return statusLabel('ledger', value)
  return undefined
}

export function recordDetailsTitle(kind: string): string {
  return ({
    works: 'Thông tin tác phẩm và bản quyền', series: 'Thông tin phim ngắn và bản quyền', recruits: 'Chi tiết nhu cầu tuyển dụng', reports: 'Chi tiết báo cáo', previews: 'Chi tiết tác vụ xem thử ngắn',
    jobs: 'Chi tiết tác vụ phương tiện lịch sử', submissions: 'Chi tiết đóng góp lịch sử', orders: 'Chi tiết đơn hàng', entitlements: 'Chi tiết quyền phát', ledger: 'Chi tiết doanh thu', payouts: 'Chi tiết chi trả', events: 'Chi tiết thao tác',
  } as Record<string, string>)[kind] || 'Chi tiết bản ghi'
}
