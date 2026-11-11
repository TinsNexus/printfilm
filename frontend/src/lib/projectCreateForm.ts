import type { ImageStyleId } from './dramaImageStyles'
import { tv } from '../i18n/tv'

export type ProjectCreateKind = 'drama' | 'canvas'

export type ProjectCreateValues = {
  title: string
  source: string
  description: string
  episodeCount: number
  imageStyleId: ImageStyleId | ''
}

export type ProjectCreateDraft = Omit<ProjectCreateValues, 'episodeCount'> & { episodeCount: string }
export type ProjectCreateErrors = Partial<Record<'title' | 'source' | 'description' | 'episodeCount', string>>

/** 与个人和团队创建接口的集数边界保持一致。 */
export const PROJECT_EPISODE_MAX = 120

export type ProjectCreateConstraints = {
  kind: ProjectCreateKind
  titleRequired?: boolean
  titleMaxLength?: number
  sourceMaxLength?: number
}

/** 校验故事、名称与分集规划；自由画布不使用分集和画风参数。 */
export function validateProjectCreate(
  draft: ProjectCreateDraft,
  { kind, titleRequired = false, titleMaxLength = 80, sourceMaxLength = 2000 }: ProjectCreateConstraints,
): { values: ProjectCreateValues; errors: ProjectCreateErrors } {
  const title = draft.title.trim()
  const source = draft.source.trim()
  const description = draft.description.trim()
  const episodeCount = Number(draft.episodeCount)
  const errors: ProjectCreateErrors = {}

  if ((kind === 'canvas' || titleRequired) && !title) errors.title = kind === 'canvas' ? tv('请填写画布名称', 'Vui lòng nhập tên canvas') : tv('请填写项目名称', 'Vui lòng nhập tên dự án')
  else if (title.length > titleMaxLength) errors.title = tv(`名称请控制在 ${titleMaxLength} 字以内`, `Tên vui lòng giữ trong ${titleMaxLength} ký tự`)
  if (description.length > 500) errors.description = tv('简介请控制在 500 字以内', 'Giới thiệu vui lòng giữ trong 500 ký tự')
  if (kind === 'drama') {
    if (source.length < 20) errors.source = tv('故事内容至少 20 字，请补充人物、情节或冲突', 'Nội dung câu chuyện tối thiểu 20 chữ, vui lòng bổ sung nhân vật, tình tiết hoặc xung đột')
    else if (source.length > sourceMaxLength) errors.source = tv(`故事内容请控制在 ${sourceMaxLength} 字以内`, `Nội dung câu chuyện vui lòng giữ trong ${sourceMaxLength} ký tự`)
    if (!Number.isInteger(episodeCount) || episodeCount < 1 || episodeCount > PROJECT_EPISODE_MAX) errors.episodeCount = tv(`请输入 1–${PROJECT_EPISODE_MAX} 之间的整数集数`, `Vui lòng nhập số tập là số nguyên trong khoảng 1–${PROJECT_EPISODE_MAX}`)
  }

  return {
    values: { title, source: kind === 'canvas' ? '' : source, description, episodeCount: kind === 'canvas' ? 1 : episodeCount, imageStyleId: kind === 'canvas' ? '' : draft.imageStyleId },
    errors,
  }
}
