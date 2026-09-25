import { viDramaOutline } from './vi/dramaOutline'
import { viDramaAssets } from './vi/dramaAssets'
import { viDramaEpisode } from './vi/dramaEpisode'
import { viStoryboard } from './vi/storyboard'
import { viErrors } from './vi/errors'
import { viPages } from './vi/pages'
import { viShell } from './vi/shell'
import { viStudio } from './vi/studio'

export const vi = {
  ...viShell,
  ...viDramaOutline,
  ...viDramaAssets,
  ...viDramaEpisode,
  ...viStoryboard,
  ...viErrors,
  ...viPages,
  ...viStudio,
}
