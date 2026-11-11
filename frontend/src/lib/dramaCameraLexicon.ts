import { tr } from '../i18n/translate.ts'
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
  { id: 'empty', group: 'shot', get label() { return tr('dramaCameraLexicon.emptyLabel') }, insert: '空镜：', get hint() { return tr('dramaCameraLexicon.emptyHint') } },
  { id: 'wide', group: 'shot', get label() { return tr('dramaCameraLexicon.wideLabel') }, insert: '远景：', get hint() { return tr('dramaCameraLexicon.wideHint') } },
  { id: 'full', group: 'shot', get label() { return tr('dramaCameraLexicon.fullLabel') }, insert: '全景：', get hint() { return tr('dramaCameraLexicon.fullHint') } },
  { id: 'medium', group: 'shot', get label() { return tr('dramaCameraLexicon.mediumLabel') }, insert: '中景：', get hint() { return tr('dramaCameraLexicon.mediumHint') } },
  { id: 'close', group: 'shot', get label() { return tr('dramaCameraLexicon.closeLabel') }, insert: '近景：', get hint() { return tr('dramaCameraLexicon.closeHint') } },
  { id: 'closeup', group: 'shot', get label() { return tr('dramaCameraLexicon.closeupLabel') }, insert: '特写：', get hint() { return tr('dramaCameraLexicon.closeupHint') } },
  { id: 'ecu', group: 'shot', get label() { return tr('dramaCameraLexicon.ecuLabel') }, insert: '大特写：', get hint() { return tr('dramaCameraLexicon.ecuHint') } },
  { id: 'establish', group: 'shot', get label() { return tr('dramaCameraLexicon.establishLabel') }, insert: '建立镜头：', get hint() { return tr('dramaCameraLexicon.establishHint') } },
  { id: 'atmosphere', group: 'shot', get label() { return tr('dramaCameraLexicon.atmosphereLabel') }, insert: '气氛镜头：', get hint() { return tr('dramaCameraLexicon.atmosphereHint') } },
]

/** 运镜短语：单段运动轴建议 ≤ 2 */
export const DRAMA_CAMERA_MOVE_LEXICON: DramaCameraLexiconItem[] = [
  { id: 'push', group: 'move', get label() { return tr('dramaCameraLexicon.pushLabel') }, insert: '推镜：', get hint() { return tr('dramaCameraLexicon.pushHint') } },
  { id: 'pull', group: 'move', get label() { return tr('dramaCameraLexicon.pullLabel') }, insert: '拉镜：', get hint() { return tr('dramaCameraLexicon.pullHint') } },
  { id: 'pan', group: 'move', get label() { return tr('dramaCameraLexicon.panLabel') }, insert: '摇镜：', get hint() { return tr('dramaCameraLexicon.panHint') } },
  { id: 'truck', group: 'move', get label() { return tr('dramaCameraLexicon.truckLabel') }, insert: '移镜：', get hint() { return tr('dramaCameraLexicon.truckHint') } },
  { id: 'follow', group: 'move', get label() { return tr('dramaCameraLexicon.followLabel') }, insert: '跟拍：', get hint() { return tr('dramaCameraLexicon.followHint') } },
  { id: 'high', group: 'move', get label() { return tr('dramaCameraLexicon.highLabel') }, insert: '俯拍：', get hint() { return tr('dramaCameraLexicon.highHint') } },
  { id: 'low', group: 'move', get label() { return tr('dramaCameraLexicon.lowLabel') }, insert: '仰拍：', get hint() { return tr('dramaCameraLexicon.lowHint') } },
  { id: 'aerial', group: 'move', get label() { return tr('dramaCameraLexicon.aerialLabel') }, insert: '航拍：', get hint() { return tr('dramaCameraLexicon.aerialHint') } },
]

/** 合并词库（插入列表用） */
export const DRAMA_CAMERA_LEXICON: DramaCameraLexiconItem[] = [
  ...DRAMA_SHOT_SIZE_LEXICON,
  ...DRAMA_CAMERA_MOVE_LEXICON,
]

/** 运镜使用提示（只展示，不插入） */
export const DRAMA_CAMERA_USAGE_TIPS = [
  tr('dramaCameraLexicon.tip1'),
  tr('dramaCameraLexicon.tip2'),
  tr('dramaCameraLexicon.tip3'),
  tr('dramaCameraLexicon.tip4'),
] as const

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
