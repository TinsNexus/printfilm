import { getActiveLocale } from '../i18n/detect.ts'
import { tr } from '../i18n/translate.ts'

/** 漫剧生成语言：剧本、台词、资产名称描述用哪种语言写（存 project.params.contentLanguage） */
export type DramaContentLanguage = 'zh' | 'en' | 'vi'

export const DRAMA_CONTENT_LANGUAGES: DramaContentLanguage[] = ['zh', 'en', 'vi']

/** 规整成支持的语言；非法值返回 null */
export function normalizeDramaContentLanguage(raw: unknown): DramaContentLanguage | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value.startsWith('zh')) return 'zh'
  if (value.startsWith('en')) return 'en'
  if (value.startsWith('vi')) return 'vi'
  return null
}

/** 读项目生成语言；老项目没设过按中文（与后端默认一致） */
export function readDramaContentLanguage(params: Record<string, unknown> | null | undefined): DramaContentLanguage {
  return normalizeDramaContentLanguage(params?.contentLanguage ?? params?.content_language) ?? 'zh'
}

/** 新建项目默认跟随当前界面语言 */
export function defaultDramaContentLanguage(): DramaContentLanguage {
  return getActiveLocale()
}

/** 下拉/选项条用的选项 */
export function dramaContentLanguageOptions(): Array<{ value: DramaContentLanguage; label: string }> {
  return DRAMA_CONTENT_LANGUAGES.map((value) => ({ value, label: tr(`dramaContentLanguage.${value}`) }))
}
