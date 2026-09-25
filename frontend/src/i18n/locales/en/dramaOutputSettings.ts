/** 英文：漫剧输出规格设置（DramaProjectOutputSettings） */

export const enDramaOutputSettings = {
  outputSettings: {
    episode: 'This episode',
    projectWide: 'Project-wide',
    episodeAspectRatio: 'Episode aspect ratio',
    projectAspectRatio: 'Project aspect ratio',
    usedOnlyEpisodeS: 'Used only by this episode’s shots; inherits the project default when not set separately. Ratios and resolutions are filtered by the current video model and can be changed by clicking.',
    allEpisodesShareOne: 'All episodes share one spec; ratios and resolutions are filtered by the current video model.',
    episodeSAspectRatio: 'This episode’s aspect ratio and resolution; shots can be joined directly once generated',
    projectWideAspectRatio: 'Project-wide aspect ratio and resolution; shots can be joined directly once generated',
    episodeAspectRatioResolution: 'Episode aspect ratio & resolution',
    projectAspectRatioResolution: 'Project aspect ratio & resolution',
    resolution: 'Resolution',
  },
} as const
