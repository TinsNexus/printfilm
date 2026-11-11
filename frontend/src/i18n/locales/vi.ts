import { viFeStudio } from "./vi/feStudio.ts";
import { viFeFeaturesMarketplace } from "./vi/feFeaturesMarketplace.ts";
import { viFeDramaCanvas } from "./vi/feDramaCanvas.ts";
import { viFeDramaEpisodeCanvas } from "./vi/feDramaEpisodeCanvas.ts";
import { viFeDrama } from "./vi/feDrama.ts";
import { viFePages } from "./vi/fePages.ts";
import { viFeApi } from "./vi/feApi.ts";
import { viFeLib } from "./vi/feLib.ts";
import { viFeHooks } from "./vi/feHooks.ts";
import { viFeComponents } from "./vi/feComponents.ts";
import { viFeFeaturesTeams } from "./vi/feFeaturesTeams.ts";
import { viFeCommon } from "./vi/feCommon.ts";
import { viPages } from './vi/pages.ts'
import { viShell } from './vi/shell.ts'

export const vi = {
  ...viFeStudio,
  ...viFeFeaturesMarketplace,
  ...viFeDramaCanvas,
  ...viFeDramaEpisodeCanvas,
  ...viFeDrama,
  ...viFePages,
  ...viFeApi,
  ...viFeLib,
  ...viFeHooks,
  ...viFeComponents,
  ...viFeFeaturesTeams,
  ...viFeCommon,
  ...viShell,
  ...viPages,
}
