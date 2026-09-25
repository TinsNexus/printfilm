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
  ...zhDramaOutline,
  ...zhDramaAssets,
  ...zhDramaEpisode,
  ...zhStoryboard,
  ...zhErrors,
  ...zhPages,
  ...zhStudio,
}
