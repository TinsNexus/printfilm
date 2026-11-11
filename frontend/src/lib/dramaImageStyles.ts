import { tr } from '../i18n/translate.ts'
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
  { id: 'retro-sci-fi-atompunk', get label() { return tr('dramaImageStyles.retroSciFiAtompunk') } },
  { id: 'palace-intrigue-cold', get label() { return tr('dramaImageStyles.palaceIntrigueCold') } },
  { id: 'domestic-suspense-cold', get label() { return tr('dramaImageStyles.domesticSuspenseCold') } },
  { id: 'ancient-romance-soft', get label() { return tr('dramaImageStyles.ancientRomanceSoft') } },
  { id: 'ancient-chinese-mythology', get label() { return tr('dramaImageStyles.ancientChineseMythology') } },
  { id: 'japanese-youth-film', get label() { return tr('dramaImageStyles.japaneseYouthFilm') } },
  { id: 'japanese-daily-natural', get label() { return tr('dramaImageStyles.japaneseDailyNatural') } },
  { id: 'korean-urban-soft', get label() { return tr('dramaImageStyles.koreanUrbanSoft') } },
  { id: 'chinese-urban-realistic', get label() { return tr('dramaImageStyles.chineseUrbanRealistic') } },
  { id: 'wuxia-realistic-photo', get label() { return tr('dramaImageStyles.wuxiaRealisticPhoto') } },
  { id: '90s-realistic-film', get label() { return tr('dramaImageStyles.s90sRealisticFilm') } },
  { id: 'retro-narrative-film', get label() { return tr('dramaImageStyles.retroNarrativeFilm') } },
  { id: 'american-retro-hollywood', get label() { return tr('dramaImageStyles.americanRetroHollywood') } },
  { id: 'neon-cyberpunk-film', get label() { return tr('dramaImageStyles.neonCyberpunkFilm') } },
  { id: '90s-rural-china-film', get label() { return tr('dramaImageStyles.s90sRuralChinaFilm') } },
  { id: 'cgi-3d-animation', get label() { return tr('dramaImageStyles.cgi3dAnimation') } },
  { id: 'ghibli-handdrawn-anime', get label() { return tr('dramaImageStyles.ghibliHanddrawnAnime') } },
  { id: 'tezuka-era-cartoon', get label() { return tr('dramaImageStyles.tezukaEraCartoon') } },
  { id: 'shanghai-animation', get label() { return tr('dramaImageStyles.shanghaiAnimation') } },
  { id: 'pixel-art', get label() { return tr('dramaImageStyles.pixelArt') } },
  { id: 'shadow-puppet-illustration', get label() { return tr('dramaImageStyles.shadowPuppetIllustration') } },
]

export const EPISODE_COUNT_PRESETS = [1, 12, 24, 36, 48] as const

export function getImageStyleLabel(styleId: string | undefined | null): string | null {
  if (!styleId) return null
  return IMAGE_STYLE_OPTIONS.find((o) => o.id === styleId)?.label ?? null
}
