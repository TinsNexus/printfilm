import type { ImageStyleId } from './dramaImageStyles'
import { tr } from '../i18n/translate.ts'

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

  if ((kind === 'canvas' || titleRequired) && !title) errors.title = kind === 'canvas' ? tr('projectCreateForm.enterCanvasName') : tr('projectCreateForm.enterProjectName')
  else if (title.length > titleMaxLength) errors.title = tr('projectCreateForm.keepNameWithinCharacters', { titleMaxLength })
  if (description.length > 500) errors.description = tr('projectCreateForm.keepDescriptionWithin500Characters')
  if (kind === 'drama') {
    if (source.length < 20) errors.source = tr('projectCreateForm.storyNeedsLeast20Characters')
    else if (source.length > sourceMaxLength) errors.source = tr('projectCreateForm.keepStoryWithinCharacters', { sourceMaxLength })
    if (!Number.isInteger(episodeCount) || episodeCount < 1 || episodeCount > PROJECT_EPISODE_MAX) errors.episodeCount = tr('projectCreateForm.enterWholeNumberEpisodes1', { PROJECT_EPISODE_MAX })
  }

  return {
    values: { title, source: kind === 'canvas' ? '' : source, description, episodeCount: kind === 'canvas' ? 1 : episodeCount, imageStyleId: kind === 'canvas' ? '' : draft.imageStyleId },
    errors,
  }
}
