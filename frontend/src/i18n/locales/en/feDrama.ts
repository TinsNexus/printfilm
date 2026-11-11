/** 英文：前端文案：src/pages/drama */

export const enFeDrama = {
  dramaProjectCardMenu: {
    moreActions: "More actions",
    rename: "Rename",
    delete: "Delete",
  },
  episodeEditPromptEditor: {
    describeVisualsDialogueNarrationType: "Describe the visuals, dialogue and narration; type @ to reference assets or insert a duration…",
    shotScript: "Shot script",
  },
  episodesPage: {
    couldNotOpenStoryboard: "Could not open the storyboard",
    openingStoryboard: "Opening the storyboard…",
  },
  dramaWorkspaceUtils: {
    episode: "Episode {episodeNumber}",
  },
  dramaStatusNotice: {
    dismiss: "Dismiss",
    cannotReachServiceRightNow: "Cannot reach the service right now",
    actionNotCompleted: "Action not completed",
    checkNetworkConnectionTryAgain: "Check your network connection and try again. If a generation task is running, check its status later.",
    viewErrorDetails: "View error details",
  },
  episodeEditContentView: {
    noScriptYetClickEdit: "No script yet. Click “Edit” to start writing",
    asset: "Asset {assetId}",
  },
  dramaEpisodeCountPopover: {
    episodes: "episodes",
    customEpisodeCount: "Custom episode count",
    ok: "OK",
  },
  dramaEpisodeDir: {
    episode: "Episode {epNo}",
    unnumbered: "Unnumbered · {id}",
    episode2: "Episode {id}",
    shots: "{fragCount} shots",
    episodes: "Episodes",
    noEpisodesYet: "No episodes yet",
  },
  dramaImageStyleModal: {
    projectStyle: "Project style",
    visualStyle: "Visual style",
    chooseStyle: "Choose style",
    styleLibrary: "Style library",
    coverImageSentStyleReference: "The cover image is sent as a style reference. The model only borrows its colors, brushwork and lighting, not its characters or composition.",
    noStyle: "No style",
  },
} as const;
