import { viStoryboard } from './vi/storyboard'
import { viErrors } from './vi/errors'
import { viPages } from './vi/pages'
import { viShell } from './vi/shell'
import { viStudio } from './vi/studio'

export const vi = {
  ...viShell,
  ...viStoryboard,
  ...viErrors,
  ...viPages,
  ...viStudio,
}
