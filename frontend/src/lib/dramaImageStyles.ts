import { tr } from '../i18n/translate'
/** Drama image style options (aligned with manju imageStyles). */

export const IMAGE_STYLE_IDS = [
  'retro-sci-fi-atompunk',
  'palace-intrigue-cold',
  'domestic-suspense-cold',
  'ancient-romance-soft',
  'ancient-chinese-mythology',
  'japanese-youth-film',
  'japanese-daily-natural',
  'korean-urban-soft',
  'chinese-urban-realistic',
  'wuxia-realistic-photo',
  '90s-realistic-film',
  'retro-narrative-film',
  'american-retro-hollywood',
  'neon-cyberpunk-film',
  '90s-rural-china-film',
  'cgi-3d-animation',
  'ghibli-handdrawn-anime',
  'tezuka-era-cartoon',
  'shanghai-animation',
  'pixel-art',
  'shadow-puppet-illustration',
] as const

export type ImageStyleId = (typeof IMAGE_STYLE_IDS)[number]

export const IMAGE_STYLE_OPTIONS: Array<{ id: ImageStyleId; label: string }> = [
  { id: 'retro-sci-fi-atompunk', get label() { return tr('imageStyle.retroSciFiAtompunk') } },
  { id: 'palace-intrigue-cold', get label() { return tr('imageStyle.palaceIntrigueColdStern') } },
  { id: 'domestic-suspense-cold', get label() { return tr('imageStyle.chineseSuspenseCoolTone') } },
  { id: 'ancient-romance-soft', get label() { return tr('imageStyle.ancientRomanceSoftGlow') } },
  { id: 'ancient-chinese-mythology', get label() { return tr('imageStyle.chineseAncientMythologyEpic') } },
  { id: 'japanese-youth-film', get label() { return tr('imageStyle.japaneseYouthFilm') } },
  { id: 'japanese-daily-natural', get label() { return tr('imageStyle.japaneseDailyLifeNatural') } },
  { id: 'korean-urban-soft', get label() { return tr('imageStyle.koreanDramaUrbanSoft') } },
  { id: 'chinese-urban-realistic', get label() { return tr('imageStyle.chineseUrbanRealism') } },
  { id: 'wuxia-realistic-photo', get label() { return tr('imageStyle.wuxiaJianghuRealisticPhotography') } },
  { id: '90s-realistic-film', get label() { return tr('imageStyle.1990sRealistCinema') } },
  { id: 'retro-narrative-film', get label() { return tr('imageStyle.retroNarrativeCinema') } },
  { id: 'american-retro-hollywood', get label() { return tr('imageStyle.americanRetroHollywood') } },
  { id: 'neon-cyberpunk-film', get label() { return tr('imageStyle.neonCyberpunkCinema') } },
  { id: '90s-rural-china-film', get label() { return tr('imageStyle.1990sRuralChinaCinema') } },
  { id: 'cgi-3d-animation', get label() { return tr('imageStyle.3dAnimation') } },
  { id: 'ghibli-handdrawn-anime', get label() { return tr('imageStyle.miyazakiStyleHandDrawn') } },
  { id: 'tezuka-era-cartoon', get label() { return tr('imageStyle.tezukaEraCartoonStyle') } },
  { id: 'shanghai-animation', get label() { return tr('imageStyle.shanghaiAnimationStyle') } },
  { id: 'pixel-art', get label() { return tr('imageStyle.pixelArt') } },
  { id: 'shadow-puppet-illustration', get label() { return tr('imageStyle.shadowPuppetIllustration') } },
]

export const EPISODE_COUNT_PRESETS = [1, 12, 24, 36, 48] as const

export function getImageStyleLabel(styleId: string | undefined | null): string | null {
  if (!styleId) return null
  return IMAGE_STYLE_OPTIONS.find((o) => o.id === styleId)?.label ?? null
}
