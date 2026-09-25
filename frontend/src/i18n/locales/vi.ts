import { viBillingPay } from './vi/billingPay'
import { viToolRuns } from './vi/toolRuns'
import { viDramaVoiceBind } from './vi/dramaVoiceBind'
import { viDramaEpisodes } from './vi/dramaEpisodes'
import { viDramaHeader } from './vi/dramaHeader'
import { viDramaLibrary } from './vi/dramaLibrary'
import { viStudioEditor } from './vi/studioEditor'
import { viDramaOutlineStep } from './vi/dramaOutlineStep'
import { viStudioStyle } from './vi/studioStyle'
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
  ...viBillingPay,
  ...viToolRuns,
  ...viDramaVoiceBind,
  ...viDramaEpisodes,
  ...viDramaHeader,
  ...viDramaLibrary,
  ...viStudioEditor,
  ...viDramaOutlineStep,
  ...viStudioStyle,
  ...viDramaOutline,
  ...viDramaAssets,
  ...viDramaEpisode,
  ...viStoryboard,
  ...viErrors,
  ...viPages,
  ...viStudio,
}
