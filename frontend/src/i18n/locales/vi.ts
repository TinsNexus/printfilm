import { viCanvasGenPanel } from './vi/canvasGenPanel'
import { viDramaEpisodeSidePane } from './vi/dramaEpisodeSidePane'
import { viDramaEpisodeAssetPanel } from './vi/dramaEpisodeAssetPanel'
import { viDramaProjectSettings } from './vi/dramaProjectSettings'
import { viDramaMention } from './vi/dramaMention'
import { viDramaValidate } from './vi/dramaValidate'
import { viDramaListPage } from './vi/dramaListPage'
import { viSettingsApi } from './vi/settingsApi'
import { viDramaAssetDetail } from './vi/dramaAssetDetail'
import { viDramaScriptPreview } from './vi/dramaScriptPreview'
import { viDramaGenQueue } from './vi/dramaGenQueue'
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
  ...viCanvasGenPanel,
  ...viDramaEpisodeSidePane,
  ...viDramaEpisodeAssetPanel,
  ...viDramaProjectSettings,
  ...viDramaMention,
  ...viDramaValidate,
  ...viDramaListPage,
  ...viSettingsApi,
  ...viDramaAssetDetail,
  ...viDramaScriptPreview,
  ...viDramaGenQueue,
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
