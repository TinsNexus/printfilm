import { zhDramaEpisodes } from './zh/dramaEpisodes'
import { zhDramaHeader } from './zh/dramaHeader'
import { zhDramaLibrary } from './zh/dramaLibrary'
import { zhStudioEditor } from './zh/studioEditor'
import { zhDramaOutlineStep } from './zh/dramaOutlineStep'
import { zhStudioStyle } from './zh/studioStyle'
import { zhDramaOutline } from './zh/dramaOutline'
import { zhDramaAssets } from './zh/dramaAssets'
import { zhDramaEpisode } from './zh/dramaEpisode'
import { zhStoryboard } from './zh/storyboard'
import { zhErrors } from './zh/errors'
import { zhPages } from './zh/pages'
import { zhShell } from './zh/shell'
import { zhStudio } from './zh/studio'

export const zh = {
  ...zhShell,
  ...zhDramaEpisodes,
  ...zhDramaHeader,
  ...zhDramaLibrary,
  ...zhStudioEditor,
  ...zhDramaOutlineStep,
  ...zhStudioStyle,
  ...zhDramaOutline,
  ...zhDramaAssets,
  ...zhDramaEpisode,
  ...zhStoryboard,
  ...zhErrors,
  ...zhPages,
  ...zhStudio,
}
