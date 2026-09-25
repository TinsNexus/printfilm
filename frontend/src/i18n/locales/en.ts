import { enStoryboard } from './en/storyboard'
import { enErrors } from './en/errors'
import { enPages } from './en/pages'
import { enShell } from './en/shell'
import { enStudio } from './en/studio'

export const en = {
  ...enShell,
  ...enStoryboard,
  ...enErrors,
  ...enPages,
  ...enStudio,
}
