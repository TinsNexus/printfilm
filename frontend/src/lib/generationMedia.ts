import { useCallback } from 'react'
import { AudioLines, Image, Video } from 'lucide-react'
import { useI18n } from '../i18n'

export type MediaKind = 'video' | 'image' | 'audio'
export const mediaKinds: MediaKind[] = ['video', 'image', 'audio']
export const mediaIcons = { video: Video, image: Image, audio: AudioLines }

export function useGenerationText() {
  const { locale } = useI18n()
  // 三语取文案：越南语缺省时回退英文
  return useCallback((zh: string, en: string, vi?: string) => locale === 'vi' ? (vi ?? en) : locale === 'en' ? en : zh, [locale])
}
