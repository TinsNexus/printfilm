import { getActiveLocale } from './detect.ts'

/** 按当前语言取文案：越南语用 vi，其余语言保持原中文（未接入 t() 的硬编码文案使用） */
export function tv(zh: string, vi: string): string {
  return getActiveLocale() === 'vi' ? vi : zh
}
