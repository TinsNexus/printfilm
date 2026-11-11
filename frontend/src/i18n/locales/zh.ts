import { zhFeDramaCanvas } from "./zh/feDramaCanvas.ts";
import { zhFeDramaEpisodeCanvas } from "./zh/feDramaEpisodeCanvas.ts";
import { zhFeDrama } from "./zh/feDrama.ts";
import { zhFePages } from "./zh/fePages.ts";
import { zhFeApi } from "./zh/feApi.ts";
import { zhFeLib } from "./zh/feLib.ts";
import { zhFeHooks } from "./zh/feHooks.ts";
import { zhFeComponents } from "./zh/feComponents.ts";
import { zhFeFeaturesTeams } from "./zh/feFeaturesTeams.ts";
import { zhFeCommon } from "./zh/feCommon.ts";
import { zhPages } from './zh/pages.ts'
import { zhShell } from './zh/shell.ts'

export const zh = {
  ...zhFeDramaCanvas,
  ...zhFeDramaEpisodeCanvas,
  ...zhFeDrama,
  ...zhFePages,
  ...zhFeApi,
  ...zhFeLib,
  ...zhFeHooks,
  ...zhFeComponents,
  ...zhFeFeaturesTeams,
  ...zhFeCommon,
  ...zhShell,
  ...zhPages,
}
