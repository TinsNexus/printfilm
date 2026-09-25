/** 中文：漫剧输出规格设置（DramaProjectOutputSettings） */

export const zhDramaOutputSettings = {
  outputSettings: {
    episode: '本集',
    projectWide: '项目统一',
    episodeAspectRatio: '分集画幅',
    projectAspectRatio: '项目画幅',
    usedOnlyEpisodeS: '仅本集分镜使用；未单独设置时继承项目默认。比例与清晰度随当前视频模型过滤，可点选修改。',
    allEpisodesShareOne: '全部分集共用同一规格；比例与清晰度随当前视频模型过滤。',
    episodeSAspectRatio: '本集画幅与清晰度；各镜生成后可直接拼接',
    projectWideAspectRatio: '全项目统一画幅与清晰度，各分镜生成后可直接拼接',
    episodeAspectRatioResolution: '分集画幅与清晰度',
    projectAspectRatioResolution: '项目画幅与清晰度',
    resolution: '清晰度',
  },
} as const
