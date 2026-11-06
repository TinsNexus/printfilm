const messages: Record<string, string> = {
  MARKETPLACE_STORAGE_UNAVAILABLE: 'Dịch vụ tệp chưa được cấu hình, vui lòng kiểm tra cài đặt dịch vụ tệp trong trang quản trị.',
  MARKETPLACE_PAYMENT_UNAVAILABLE: 'Dịch vụ thanh toán tạm thời không khả dụng, vui lòng kiểm tra cấu hình thanh toán rồi thử lại.',
  MARKETPLACE_REVENUE_CONFIG_REQUIRED: 'Vui lòng cấu hình và bật tỷ lệ chiết khấu nền tảng trước, rồi mới gửi tác phẩm doanh thu quảng bá nền tảng.',
  MARKETPLACE_RIGHTS_REQUIRED: 'Vui lòng bổ sung tài liệu bản quyền rồi hãy thao tác.',
  MARKETPLACE_EPISODE_NOT_READY: 'Phiên bản phát hoàn chỉnh chưa sẵn sàng, vui lòng thử lại sau.',
  MARKETPLACE_ENTITLEMENT_REQUIRED: 'Chưa có quyền phát hoàn chỉnh của phiên bản này.',
  MARKETPLACE_SOURCE_NOT_READY: 'Phim nguồn chưa hoàn tất, vui lòng hoàn thành toàn bộ video phân cảnh của các tập đã chọn rồi đồng bộ lại.',
  MARKETPLACE_SOURCE_CHANGED: 'Phim nguồn đã được cập nhật, vui lòng chọn lại rồi đồng bộ.',
  MARKETPLACE_SOURCE_INCOMPATIBLE: 'Quy cách video phân cảnh không đồng nhất, vui lòng thống nhất tỷ lệ khung hình rồi đồng bộ lại.',
  MARKETPLACE_TARGET_CHANGED: 'Bản nháp chợ đã được cập nhật, vui lòng làm mới để xem rồi thao tác lại.',
  MARKETPLACE_SYNC_IN_PROGRESS: 'Phim đang đồng bộ, vui lòng đợi đồng bộ xong rồi mới lưu hoặc gửi.',
  MARKETPLACE_SUBMISSIONS_DISABLED: 'Tuyển dụng do CSKH kết nối, vui lòng liên hệ CSKH trong chi tiết tuyển dụng để nhận việc.',
}
const fields: Record<string, string> = {
  version: 'Phiên bản nội dung', title: 'Tiêu đề', reason: 'Lý do duyệt', checks: 'Mục kiểm tra duyệt', owner_id: 'Mã nhà sáng tạo', user_id: 'Mã người dùng mua',
  amount_fen: 'Số tiền', platform_share_bps: 'Tỷ lệ chiết khấu nền tảng', enabled: 'Trạng thái bật', status: 'Trạng thái', note: 'Ghi chú', names: 'Tên danh mục',
  name: 'Tên CSKH', wechat: 'ID WeChat', hours: 'Thời gian phục vụ', qr_asset_id: 'Mã QR CSKH', resolution: 'Kết quả xử lý báo cáo',
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readableText(value: string) {
  const text = value.trim().replace(/^Value error,\s*/i, '')
  return /[\u3400-\u9fff]/.test(text) ? text : undefined
}

function boundary(value: unknown, field: string): string {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return 'Phạm vi cho phép'
  return field.endsWith('_fen') ? `¥${(Number(value) / 100).toFixed(2)}` : String(value)
}

function explainValidation(value: Record<string, unknown>, field: string) {
  const raw = typeof value.msg === 'string' ? value.msg : ''
  const translated = readableText(raw)
  if (translated) return translated
  const ctx = record(value.ctx) || {}
  const length = (key: string) => typeof ctx[key] === 'number' && Number.isInteger(ctx[key]) && Number(ctx[key]) >= 0 ? String(ctx[key]) : 'Số lượng quy định'
  switch (value.type) {
    case 'missing': return 'Đây là mục bắt buộc'
    case 'string_too_short': return `Nhập ít nhất ${length('min_length')} ký tự`
    case 'string_too_long': return `Không được vượt quá ${length('max_length')} ký tự`
    case 'too_short': return `Cần ít nhất ${length('min_length')} mục`
    case 'too_long': return `Cho phép tối đa ${length('max_length')} mục`
    case 'greater_than': return `Giá trị phải lớn hơn ${boundary(ctx.gt, field)}`
    case 'greater_than_equal': return `Giá trị không được nhỏ hơn ${boundary(ctx.ge, field)}`
    case 'less_than': return `Giá trị phải nhỏ hơn ${boundary(ctx.lt, field)}`
    case 'less_than_equal': return `Giá trị không được lớn hơn ${boundary(ctx.le, field)}`
    case 'int_parsing': case 'int_type': case 'int_from_float': return 'Vui lòng nhập số nguyên'
    case 'float_parsing': case 'float_type': case 'finite_number': return 'Vui lòng nhập số hợp lệ'
    case 'literal_error': return ctx.expected === 'True' ? 'Vui lòng tích xác nhận' : 'Vui lòng chọn tùy chọn hợp lệ'
    case 'bool_parsing': case 'bool_type': return 'Vui lòng xác nhận tùy chọn này'
    case 'extra_forbidden': return 'Mục này không hỗ trợ gửi, vui lòng làm mới rồi thử lại'
  }
  if (/field required/i.test(raw)) return 'Đây là mục bắt buộc'
  if (/valid integer/i.test(raw)) return 'Vui lòng nhập số nguyên'
  if (/valid number/i.test(raw)) return 'Vui lòng nhập số'
  const bound = raw.match(/(greater than or equal to|less than or equal to|greater than|less than|at least|at most)\s+(-?[\d.]+)/i)
  if (bound) {
    if (/string/i.test(raw)) return `Vui lòng nhập ${/at least/i.test(bound[1]) ? 'Tối thiểu' : 'Không quá'} ${bound[2]} ký tự`
    return `Giá trị ${/greater|at least/i.test(bound[1]) ? /or equal|at least/i.test(bound[1]) ? 'Không được nhỏ hơn' : 'Phải lớn hơn' : /or equal|at most/i.test(bound[1]) ? 'Không được lớn hơn' : 'Phải nhỏ hơn'} ${boundary(bound[2], field)}`
  }
  return 'Vui lòng kiểm tra nội dung đã nhập'
}

function validationMessage(detail: unknown[]) {
  const lines = detail.flatMap(entry => {
    const value = record(entry)
    if (!value) return []
    const parts = (Array.isArray(value.loc) ? value.loc : []).filter(part => (typeof part === 'string' || typeof part === 'number') && !['body', 'query', 'path'].includes(String(part)))
    const field = String(parts.findLast(part => typeof part === 'string') || '')
    const location = parts.map(part => typeof part === 'number' ? `Mục ${part + 1}` : fields[String(part)] || 'Nội dung biểu mẫu').join('')
    const message = explainValidation(value, field)
    return [location ? `${location}：${message}` : message]
  })
  return [...new Set(lines)].join('；') || 'Vui lòng kiểm tra nội dung biểu mẫu và các trường bắt buộc.'
}

function fallbackMessage(status: number) {
  if (status === 401) return 'Đăng nhập đã hết hạn, vui lòng đăng nhập lại để tiếp tục.'
  if (status === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Nội dung không tồn tại hoặc tạm thời không truy cập được, vui lòng làm mới rồi thử lại.'
  if (status === 409) return 'Trạng thái nội dung đã thay đổi, vui lòng làm mới rồi thao tác lại.'
  if (status === 422) return 'Vui lòng kiểm tra nội dung biểu mẫu và các trường bắt buộc.'
  if (status === 429) return 'Thao tác quá thường xuyên, vui lòng thử lại sau.'
  return 'Tạm thời không thể hoàn tất thao tác, vui lòng thử lại sau.'
}

export class MarketplaceRequestError extends Error {
  code: string | undefined
  status: number

  constructor(detail: unknown, status: number, fallback?: string, cause?: unknown) {
    const object = record(detail)
    const raw = typeof detail === 'string' ? detail : typeof object?.message === 'string' ? object.message : ''
    const match = raw.match(/^(MARKETPLACE_[A-Z_]+)(?=[:：\s]|$)/)
    const code = typeof object?.code === 'string' ? object.code : match?.[1]
    const text = match ? raw.slice(match[0].length).replace(/^\s*[:：]?\s*/, '') : raw
    const message = Array.isArray(detail) ? validationMessage(detail) : readableText(text) || (code ? messages[code] : undefined) || fallback || fallbackMessage(status)
    super(message, { cause })
    this.name = 'MarketplaceRequestError'
    this.code = code
    this.status = status
  }
}
