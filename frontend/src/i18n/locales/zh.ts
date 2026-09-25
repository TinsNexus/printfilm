import { zhStoryboard } from './zh/storyboard'
import { zhErrors } from './zh/errors'
import { zhPages } from './zh/pages'
import { zhShell } from './zh/shell'
import { zhStudio } from './zh/studio'

export const zh = {
  ...zhShell,
  ...zhStoryboard,
  ...zhErrors,
  ...zhPages,
  ...zhStudio,
}
