import { enStudioEditor } from './en/studioEditor'
import { enDramaOutlineStep } from './en/dramaOutlineStep'
import { enStudioStyle } from './en/studioStyle'
import { enDramaOutline } from './en/dramaOutline'
import { enDramaAssets } from './en/dramaAssets'
import { enDramaEpisode } from './en/dramaEpisode'
import { enStoryboard } from './en/storyboard'
import { enErrors } from './en/errors'
import { enPages } from './en/pages'
import { enShell } from './en/shell'
import { enStudio } from './en/studio'

export const en = {
  ...enShell,
  ...enStudioEditor,
  ...enDramaOutlineStep,
  ...enStudioStyle,
  ...enDramaOutline,
  ...enDramaAssets,
  ...enDramaEpisode,
  ...enStoryboard,
  ...enErrors,
  ...enPages,
  ...enStudio,
}
