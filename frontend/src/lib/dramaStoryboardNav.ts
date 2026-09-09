/** 分镜入口：跳过中间分集页，直达首集编辑 */
import { dramaApi } from '../api/drama'

/** 确保已切分并返回首集（或指定集）编辑路径；无分集则回大纲 */
export async function resolveStoryboardPath(
  projectId: number,
  preferredEpisodeId?: number | null,
): Promise<string> {
  const rows = await dramaApi.seedEpisodes(projectId, false)
  if (preferredEpisodeId && rows.some((r) => r.id === preferredEpisodeId)) {
    return `/drama/projects/${projectId}/episodes/${preferredEpisodeId}`
  }
  const first = rows[0]
  if (first?.id) return `/drama/projects/${projectId}/episodes/${first.id}`
  return `/drama/projects/${projectId}`
}
