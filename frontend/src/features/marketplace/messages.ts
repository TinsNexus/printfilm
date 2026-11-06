import { tv } from '../../i18n/tv'
/** 用户提示与接口错误码分开处理，不改变服务端状态和错误契约。 */
const businessMessages: Record<string, string> = {
  MARKETPLACE_STORAGE_UNAVAILABLE: tv('文件服务暂未配置或暂时不可用，请稍后重试或联系客服。', 'Dịch vụ tệp chưa được cấu hình hoặc tạm thời không khả dụng, vui lòng thử lại sau hoặc liên hệ CSKH.'),
  MARKETPLACE_PAYMENT_UNAVAILABLE: tv('支付服务暂不可用，请稍后重试。', 'Dịch vụ thanh toán tạm thời không khả dụng, vui lòng thử lại sau.'),
  MARKETPLACE_REVENUE_CONFIG_REQUIRED: tv('平台投放收益暂未开放，请联系客服确认。', 'Doanh thu quảng bá nền tảng chưa mở, vui lòng liên hệ CSKH xác nhận.'),
  MARKETPLACE_RIGHTS_REQUIRED: tv('请先确认版权信息：PrintFilm 作品签署授权函，其他平台作品提交版权证明。', 'Vui lòng xác nhận thông tin bản quyền trước: tác phẩm PrintFilm ký thư ủy quyền, tác phẩm nền tảng khác nộp chứng minh bản quyền.'),
  MARKETPLACE_EPISODE_NOT_READY: tv('视频尚未准备好，请稍后刷新查看。', 'Video chưa chuẩn bị xong, vui lòng làm mới xem lại sau.'),
  MARKETPLACE_ENTITLEMENT_REQUIRED: tv('请先购买该发布版本的在线播放权益。', 'Vui lòng mua quyền phát trực tuyến của phiên bản đăng này trước.'),
  MARKETPLACE_SOURCE_NOT_READY: tv('源成片尚未就绪，请完成视频生成后再同步。', 'Phim nguồn chưa sẵn sàng, vui lòng tạo xong video rồi đồng bộ.'),
  MARKETPLACE_SOURCE_CHANGED: tv('源成片已更新，请刷新并重新选择后同步。', 'Phim nguồn đã được cập nhật, vui lòng làm mới và chọn lại rồi đồng bộ.'),
  MARKETPLACE_TARGET_CHANGED: tv('市场作品已更新，请刷新后重新确认同步内容。', 'Tác phẩm trên chợ đã được cập nhật, vui lòng làm mới và xác nhận lại nội dung đồng bộ.'),
  MARKETPLACE_SOURCE_INCOMPATIBLE: tv('分镜视频规格不一致，请统一画幅和分辨率后重新同步。', 'Quy cách video phân cảnh không đồng nhất, vui lòng thống nhất tỷ lệ khung và độ phân giải rồi đồng bộ lại.'),
  MARKETPLACE_SYNC_IN_PROGRESS: tv('成片正在同步，请等待同步完成后再保存或提交。', 'Phim đang đồng bộ, vui lòng đợi đồng bộ xong rồi mới lưu hoặc gửi.'),
  MARKETPLACE_SUBMISSIONS_DISABLED: tv('招募通过平台客服接单，请在招募详情中联系客服。', 'Tuyển dụng nhận việc qua CSKH nền tảng, vui lòng liên hệ CSKH trong chi tiết tuyển dụng.'),
}

const fieldNames: Record<string, string> = {
  title: tv('标题', 'Tiêu đề'), description: tv('简介', 'Giới thiệu'), category: tv('分类', 'Danh mục'), tags: tv('标签', 'Nhãn'), price_fen: tv('参考价', 'Giá tham khảo'),
  copyright_price_fen: tv('参考价', 'Giá tham khảo'), unlock_price_fen: tv('观众解锁价', 'Giá mở khóa cho khán giả'), share_bps: tv('平台抽成比例', 'Tỷ lệ chiết khấu nền tảng'),
  license_scope: tv('拟授权用途及限制', 'Mục đích và giới hạn dự kiến được cấp phép'), scope: tv('授权范围', 'Phạm vi cấp phép'), asset_id: tv('视频', 'Video'), cover_asset_id: tv('封面', 'Ảnh bìa'), source: tv('内容来源', 'Nguồn nội dung'),
  certificate_number: tv('版权证书编号', 'Số chứng chỉ bản quyền'), certificate_asset_id: tv('版权证明图片', 'Ảnh chứng minh bản quyền'), dispute_ack: tv('版权声明', 'Tuyên bố bản quyền'),
  episode_no: tv('集号', 'Số tập'), episodes: tv('分集', 'Tập'), episode_ids: tv('所选分集', 'Tập đã chọn'), episode_id: tv('分集', 'Tập'), free_episode_count: tv('免费集数', 'Số tập miễn phí'),
  budget_fen: tv('单条预算', 'Ngân sách mỗi mục'), wanted_count: tv('征集数量', 'Số lượng thu thập'), requirements: tv('交付要求', 'Yêu cầu bàn giao'), deadline_at: tv('截止时间', 'Hạn chót'),
  image_ids: tv('参考图片', 'Ảnh tham chiếu'), evidence_ids: tv('证明材料', 'Tài liệu chứng minh'), valid_until: tv('授权有效期', 'Thời hạn hiệu lực cấp phép'), details: tv('版权信息', 'Thông tin bản quyền'),
  signer_name: tv('签署人姓名', 'Họ tên người ký'), strokes: tv('手写签名', 'Chữ ký tay'), accepted_terms: tv('授权条款', 'Điều khoản cấp phép'), adult: tv('成年确认', 'Xác nhận đủ tuổi'),
  read_all: tv('阅读确认', 'Xác nhận đã đọc'), accept_key: tv('重点条款确认', 'Xác nhận điều khoản trọng điểm'), template_version: tv('授权条款版本', 'Phiên bản điều khoản cấp phép'),
  sale_type: tv('收益方式', 'Cách chia doanh thu'), filename: tv('文件名', 'Tên tệp'), size_bytes: tv('文件大小', 'Dung lượng tệp'), kind: tv('文件类型', 'Loại tệp'),
  statement: tv('举报说明', 'Mô tả báo cáo'), contact: tv('联系方式', 'Cách liên hệ'), version: tv('内容版本', 'Phiên bản nội dung'), series_version: tv('短剧版本', 'Phiên bản phim ngắn'),
  drama_project_id: tv('漫剧项目', 'Dự án phim truyện'), project_id: tv('成片项目', 'Dự án phim'), series_id: tv('市场短剧', 'Phim ngắn trên chợ'), source_version: tv('源成片版本', 'Phiên bản phim nguồn'),
  idempotency_key: tv('本次操作编号', 'Mã thao tác lần này'), target_type: tv('咨询类型', 'Loại tư vấn'), target_id: tv('咨询内容', 'Nội dung tư vấn'),
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function marketplaceErrorCode(detail: unknown): string | undefined {
  const value = record(detail)
  if (typeof value?.code === 'string') return value.code
  const message = typeof detail === 'string' ? detail : typeof value?.message === 'string' ? value.message : ''
  return message.match(/^(MARKETPLACE_[A-Z_]+)(?=[:：\s]|$)/)?.[1]
}

function readableText(text: string): string | undefined {
  const cleaned = text.trim().replace(/^Value error,\s*/i, '')
  // 有中文的业务说明可以保留；纯错误码或底层英文交给统一回退提示。
  return /[\u3400-\u9fff]/u.test(cleaned) ? cleaned : undefined
}

function limitText(value: unknown, field: string): string {
  if (typeof value !== 'number' && typeof value !== 'string') return tv('允许的范围', 'Phạm vi cho phép')
  if (field.endsWith('_fen') && Number.isFinite(Number(value))) return `¥${(Number(value) / 100).toFixed(2)}`
  return String(value)
}

function validationMessage(row: Record<string, unknown>, field: string): string {
  const type = row.type
  const ctx = record(row.ctx) ?? {}
  const raw = typeof row.msg === 'string' ? row.msg : ''
  const ownMessage = readableText(raw)
  if (ownMessage) return ownMessage
  switch (type) {
    case 'missing': return tv('这是必填项', 'Đây là mục bắt buộc')
    case 'string_too_short': return tv(`至少填写 ${ctx.min_length} 个字`, `Nhập ít nhất ${ctx.min_length} ký tự`)
    case 'string_too_long': return tv(`不能超过 ${ctx.max_length} 个字`, `Không được vượt quá ${ctx.max_length} ký tự`)
    case 'too_short': return tv(`至少需要 ${ctx.min_length} 项`, `Cần ít nhất ${ctx.min_length} mục`)
    case 'too_long': return tv(`最多允许 ${ctx.max_length} 项`, `Cho phép tối đa ${ctx.max_length} mục`)
    case 'greater_than': return tv(`须大于 ${limitText(ctx.gt, field)}`, `Phải lớn hơn ${limitText(ctx.gt, field)}`)
    case 'greater_than_equal': return tv(`不能小于 ${limitText(ctx.ge, field)}`, `Không được nhỏ hơn ${limitText(ctx.ge, field)}`)
    case 'less_than': return tv(`须小于 ${limitText(ctx.lt, field)}`, `Phải nhỏ hơn ${limitText(ctx.lt, field)}`)
    case 'less_than_equal': return tv(`不能超过 ${limitText(ctx.le, field)}`, `Không được vượt quá ${limitText(ctx.le, field)}`)
    case 'int_parsing': case 'int_type': case 'int_from_float': return tv('请填写整数', 'Vui lòng nhập số nguyên')
    case 'float_parsing': case 'float_type': case 'finite_number': return tv('请填写有效数字', 'Vui lòng nhập số hợp lệ')
    case 'literal_error': return ctx.expected === 'True' ? tv('请勾选确认', 'Vui lòng tích xác nhận') : tv('请选择有效选项', 'Vui lòng chọn tùy chọn hợp lệ')
    case 'bool_parsing': case 'bool_type': return tv('请确认此选项', 'Vui lòng xác nhận tùy chọn này')
    case 'datetime_parsing': case 'datetime_from_date_parsing': case 'timezone_aware': return tv('请填写有效的日期和时间', 'Vui lòng nhập ngày giờ hợp lệ')
    case 'extra_forbidden': return tv('此项不支持提交，请刷新页面后重试', 'Mục này không hỗ trợ gửi, vui lòng làm mới trang rồi thử lại')
  }
  if (/field required/i.test(raw)) return tv('这是必填项', 'Đây là mục bắt buộc')
  if (/at least 1 character/i.test(raw)) return tv('不能为空', 'Không được để trống')
  if (/valid integer/i.test(raw)) return tv('请填写整数', 'Vui lòng nhập số nguyên')
  if (/valid number/i.test(raw)) return tv('请填写有效数字', 'Vui lòng nhập số hợp lệ')
  return tv('请检查填写内容', 'Vui lòng kiểm tra nội dung đã nhập')
}

function explainValidation(detail: unknown[]): string {
  const lines = detail.flatMap(value => {
    const row = record(value)
    if (!row) return []
    const parts = (Array.isArray(row.loc) ? row.loc : []).filter(part => !['body', 'query', 'path'].includes(String(part)))
    const field = String(parts.at(-1) ?? '')
    const location = parts.map(part => typeof part === 'number' ? tv(`第 ${part + 1} 项`, `Mục ${part + 1}`) : fieldNames[String(part)] || tv('填写内容', 'Nội dung đã nhập')).join(tv('的', ''))
    const message = validationMessage(row, field)
    return [location ? `${location}：${message}` : message]
  })
  return [...new Set(lines)].join('；') || tv('请检查表单内容和必填字段', 'Vui lòng kiểm tra nội dung biểu mẫu và các trường bắt buộc')
}

export function explainMarketplaceError(detail: unknown, status?: number): string {
  if (Array.isArray(detail)) return explainValidation(detail)
  const value = record(detail)
  const raw = typeof detail === 'string' ? detail : typeof value?.message === 'string' ? value.message : ''
  const code = marketplaceErrorCode(detail)
  // 带具体原因的中文说明优先于通用错误码说明。
  const message = readableText(raw.replace(/^MARKETPLACE_[A-Z_]+\s*[:：]?\s*/, ''))
  if (message) return message
  if (code && businessMessages[code]) return businessMessages[code]
  if (status === 401) return tv('登录已过期，请重新登录后继续。', 'Đăng nhập đã hết hạn, vui lòng đăng nhập lại để tiếp tục.')
  if (status === 403) return tv('当前账号没有执行此操作的权限。', 'Tài khoản hiện tại không có quyền thực hiện thao tác này.')
  if (status === 404) return tv('内容不存在或暂不可访问，请刷新后重试。', 'Nội dung không tồn tại hoặc tạm thời không truy cập được, vui lòng làm mới rồi thử lại.')
  if (status === 409) return tv('内容状态已变化，请刷新后重新操作。', 'Trạng thái nội dung đã thay đổi, vui lòng làm mới rồi thao tác lại.')
  if (status === 413) return tv('文件超过允许大小，请选择较小的文件。', 'Tệp vượt quá dung lượng cho phép, vui lòng chọn tệp nhỏ hơn.')
  if (status === 422) return tv('请检查表单内容和必填字段。', 'Vui lòng kiểm tra nội dung biểu mẫu và các trường bắt buộc.')
  if (status === 429) return tv('操作过于频繁，请稍后再试。', 'Thao tác quá thường xuyên, vui lòng thử lại sau.')
  return tv('暂时无法完成操作，请稍后重试。', 'Tạm thời không thể hoàn tất thao tác, vui lòng thử lại sau.')
}
