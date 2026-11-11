import { tv } from '../i18n/tv'
/** 框架的通用 404 表示接口未加载；业务 404 则保留会话不存在等真实原因。 */
export function creationApiErrorDetail(status: number, detail: unknown): unknown {
  if (status !== 404) return detail
  if (typeof detail === 'string' && detail.trim().toLowerCase() === 'not found')
    return tv('创作服务接口尚未加载，请重启后端服务后重试。', 'Giao diện dịch vụ sáng tạo chưa được tải, vui lòng khởi động lại dịch vụ backend rồi thử lại.')
  if (detail === '创作会话不存在')
    return tv('创作会话不存在或已被删除，请返回我的短片或新建对话。', 'Phiên sáng tạo không tồn tại hoặc đã bị xóa, vui lòng quay lại video ngắn của tôi hoặc tạo hội thoại mới.')
  return detail
}
