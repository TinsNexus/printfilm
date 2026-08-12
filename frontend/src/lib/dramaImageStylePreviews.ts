/** 漫剧画面风格预览图 URL */
import type { ImageStyleId } from './dramaImageStyles'

// 返回风格预览图 URL（优先 jpg，回退 svg）
export function getDramaImageStylePreviewUrl(styleId: ImageStyleId): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}image-styles/${styleId}.jpg`
}

// 返回风格预览占位 SVG
export function getDramaImageStylePreviewFallbackUrl(styleId: ImageStyleId): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}image-styles/${styleId}.svg`
}
