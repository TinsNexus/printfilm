/** 英文：漫剧分集脚本校验提示（dramaEpisodeScriptValidate） */

export const enDramaValidate = {
  scriptValidate: {
    listSep: ', ',
    missingImage: 'These assets have no reference image; generation may fill one in automatically or be unstable: {names}',
    missingVoice: 'The script has dialogue, but these characters have no voice bound yet: {names}',
    eachDurationMustBetween: 'Each @duration must be between {DRAMA_SEGMENT_DURATION_MIN} and {DRAMA_SEGMENT_DURATION_HARD_MAX} seconds',
    someDurationValuesExceed: 'Some @duration values exceed the recommended {DRAMA_SEGMENT_DURATION_MAX}s for new shots; older drafts can still be generated',
    shotSDurationTotal: 'This shot’s @duration total is {total}s, over the Seedance limit of {DRAMA_SHOT_DURATION_HARD_MAX}s',
    shotSDurationTotal2: 'This shot’s @duration total is {total}s, over the recommended {FRAGMENT_CONTENT_DURATION_MAX}s for new shots (older drafts can still be generated)',
    shotSizeEmptyShot: 'A “空镜 / shot size” (empty shot / framing) line is tagged as dialogue or narration (it would be voiced and burned in as subtitles). Change it to “【画面·无配音仅环境音】” or a plain visual line such as “空镜：…”.',
    mustFixFirst: '[Must fix first]',
    recommendedStillContinue: '[Recommended — you can still continue]',
  },
} as const
