import { tr } from '../i18n/translate'
/**
 * 漫剧运镜 / 景别词库（对齐 docs/EPISODE_RULES.md §5）
 * 供分集编辑 @ 菜单插入画面行前缀或运镜短语
 */

export type DramaCameraLexiconGroup = 'shot' | 'move'

export type DramaCameraLexiconItem = {
  id: string
  group: DramaCameraLexiconGroup
  /** 列表展示名 */
  label: string
  /** 插入到脚本的文本（用户可继续补描写） */
  insert: string
  /** 一行说明 */
  hint: string
}

/** 景别标签：写入画面行，勿标成对白 */
export const DRAMA_SHOT_SIZE_LEXICON: DramaCameraLexiconItem[] = [
  { id: 'empty', group: 'shot', get label() { return tr('camera.emptyShot') }, insert: '空镜：', get hint() { return tr('camera.setsSceneDialogueNarration') } },
  { id: 'wide', group: 'shot', get label() { return tr('camera.wideShot') }, insert: '远景：', get hint() { return tr('camera.showsSpatialRelationships') } },
  { id: 'full', group: 'shot', get label() { return tr('camera.fullShot') }, insert: '全景：', get hint() { return tr('camera.fullBodyEnvironmentFrame') } },
  { id: 'medium', group: 'shot', get label() { return tr('camera.mediumShot') }, insert: '中景：', get hint() { return tr('camera.waistUpCommonDialogue') } },
  { id: 'close', group: 'shot', get label() { return tr('camera.mediumCloseUp') }, insert: '近景：', get hint() { return tr('camera.chestUpCloserEmotion') } },
  { id: 'closeup', group: 'shot', get label() { return tr('camera.closeUp') }, insert: '特写：', get hint() { return tr('camera.faceKeyProp') } },
  { id: 'ecu', group: 'shot', get label() { return tr('camera.extremeCloseUp') }, insert: '大特写：', get hint() { return tr('camera.eyesHandsDetails') } },
  { id: 'establish', group: 'shot', get label() { return tr('camera.establishingShot') }, insert: '建立镜头：', get hint() { return tr('camera.setsSceneMoodOpening') } },
  { id: 'atmosphere', group: 'shot', get label() { return tr('camera.atmosphereShot') }, insert: '气氛镜头：', get hint() { return tr('camera.lightWeatherObjectsBuild') } },
]

/** 运镜短语：单段运动轴建议 ≤ 2 */
export const DRAMA_CAMERA_MOVE_LEXICON: DramaCameraLexiconItem[] = [
  { id: 'push', group: 'move', get label() { return tr('camera.push') }, insert: '推镜：', get hint() { return tr('camera.cameraMovesForwardToward') } },
  { id: 'pull', group: 'move', get label() { return tr('camera.pullOut') }, insert: '拉镜：', get hint() { return tr('camera.cameraPullsBackReveal') } },
  { id: 'pan', group: 'move', get label() { return tr('camera.pan') }, insert: '摇镜：', get hint() { return tr('camera.cameraStaysPutSweeps') } },
  { id: 'truck', group: 'move', get label() { return tr('camera.truck') }, insert: '移镜：', get hint() { return tr('camera.cameraSlidesSidewaysFollow') } },
  { id: 'follow', group: 'move', get label() { return tr('camera.followShot') }, insert: '跟拍：', get hint() { return tr('camera.followsCharacterSMovement') } },
  { id: 'high', group: 'move', get label() { return tr('camera.highAngle') }, insert: '俯拍：', get hint() { return tr('camera.highAngleLookingDown') } },
  { id: 'low', group: 'move', get label() { return tr('camera.lowAngle') }, insert: '仰拍：', get hint() { return tr('camera.lowAngleLookingUp') } },
  { id: 'aerial', group: 'move', get label() { return tr('camera.aerial') }, insert: '航拍：', get hint() { return tr('camera.wideOverheadView') } },
]

/** 合并词库（插入列表用） */
export const DRAMA_CAMERA_LEXICON: DramaCameraLexiconItem[] = [
  ...DRAMA_SHOT_SIZE_LEXICON,
  ...DRAMA_CAMERA_MOVE_LEXICON,
]

/** 运镜使用提示（只展示，不插入） */
export function dramaCameraUsageTips(): string[] {
  return [tr('camera.tip1'), tr('camera.tip2'), tr('camera.tip3'), tr('camera.tip4')]
}

// 按关键字过滤词库（匹配 label / insert / hint）
export function filterDramaCameraLexicon(
  items: DramaCameraLexiconItem[],
  query: string,
): DramaCameraLexiconItem[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.insert.toLowerCase().includes(q) ||
      item.hint.toLowerCase().includes(q),
  )
}
