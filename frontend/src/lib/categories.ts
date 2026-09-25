import { tr } from '../i18n'

export const CATEGORY_ORDER = [
  '开源',
  '科普',
  '获客',
  '纪录片',
  '写实感',
  '真人感',
  '电影感',
  '儿童',
  '动漫',
  '国风',
  '科幻',
  '奇幻',
  '悬疑',
  '商业',
  '复古',
  '图文',
]

// 模板分类的短展示名（值仍是后端中文分类）；未登记的分类原样显示
export function categoryLabel(value: string): string {
  const path = `category.${value}`
  const label = tr(path)
  return label === path ? value : label
}

// 模板库分类的展示名（含更长的营销向叫法）
export function homeCategoryLabel(value: string): string {
  const path = `homeCategory.${value}`
  const label = tr(path)
  return label === path ? value : label
}
