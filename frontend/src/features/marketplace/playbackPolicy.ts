import { tv } from '../../i18n/tv'
/** 与后端播放策略保持一致；参考价为零不能替代明确的免费类型。 */
export function isFreeWork(item: { sale_type?: string }) {
  return item.sale_type === 'free'
}

export function isFreeEpisode(series: { sale_type?: string; free_episode_count?: number }, episodeNo: number) {
  return isFreeWork(series) || (episodeNo > 0 && episodeNo <= (series.free_episode_count || 0))
}

export function previewStatusLabel(status: string | undefined, free: boolean) {
  if (free) return tv('无需试看', 'Không cần xem thử')
  const labels: Record<string, string> = {
    none: tv('未生成', 'Chưa tạo'), missing: tv('未生成', 'Chưa tạo'), pending: tv('排队中', 'Đang xếp hàng'), running: tv('正在生成短试看', 'Đang tạo bản xem thử ngắn'),
    done: tv('短试看已就绪', 'Bản xem thử ngắn đã sẵn sàng'), failed: tv('生成失败，可重试', 'Tạo thất bại, có thể thử lại'), cancelled: tv('任务已取消', 'Tác vụ đã bị hủy'),
  }
  return labels[status || 'none'] || status
}
