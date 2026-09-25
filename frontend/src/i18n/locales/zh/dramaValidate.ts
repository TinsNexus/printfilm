/** 中文：漫剧分集脚本校验提示（dramaEpisodeScriptValidate） */

export const zhDramaValidate = {
  scriptValidate: {
    listSep: '、',
    missingImage: '以下资产缺少参考图，生成时可能自动补图或效果不稳定：{names}',
    missingVoice: '脚本含对白，但以下角色尚未绑定音色：{names}',
    eachDurationMustBetween: '单个 @duration 需在 {DRAMA_SEGMENT_DURATION_MIN}–{DRAMA_SEGMENT_DURATION_HARD_MAX} 秒之间',
    someDurationValuesExceed: '部分 @duration 超过新分镜建议 {DRAMA_SEGMENT_DURATION_MAX}s，旧稿可继续生成',
    shotSDurationTotal: '本镜 @duration 合计 {total}s，超过 Seedance 上限 {DRAMA_SHOT_DURATION_HARD_MAX}s',
    shotSDurationTotal2: '本镜 @duration 合计 {total}s，超过新分镜建议 {FRAGMENT_CONTENT_DURATION_MAX}s（旧稿可继续生成）',
    shotSizeEmptyShot: '检测到「空镜/景别」被标成对白或旁白（会口播并烧字幕）。请改为「【画面·无配音仅环境音】」或「空镜：…」纯画面行',
    mustFixFirst: '【须先修复】',
    recommendedStillContinue: '【建议处理，仍可继续】',
  },
} as const
