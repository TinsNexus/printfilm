import type { Template } from '../api'
import { tr } from '../i18n/translate.ts'

/** 新建短片的公开精选名单；历史项目仍通过 getTemplate(id) 读取原模板。 */
export const CREATION_TEMPLATE_IDS = [
  'anim_3d',
  'soft_anime',
  'kids_flat',
  'ink_guofeng',
] as const

export const DEFAULT_CREATION_TEMPLATE_ID = CREATION_TEMPLATE_IDS[0]

const PRESENTATION = {
  anim_3d: {
    name: tr('creationTemplates.n3dAnimation'),
    description: tr('creationTemplates.rounded3dCharactersSoftLighting'),
    category: ['3D', tr('creationTemplates.animation')],
  },
  soft_anime: {
    name: tr('creationTemplates.n2dAnime'),
    description: tr('creationTemplates.cleanLineArtSoftCel'),
    category: [tr('creationTemplates.n2d'), tr('creationTemplates.anime')],
  },
  kids_flat: {
    name: tr('creationTemplates.pictureBookIllustration'),
    description: tr('creationTemplates.softPastelsFriendlyIllustratedCharacters'),
    category: [tr('creationTemplates.pictureBook'), tr('creationTemplates.illustration')],
  },
  ink_guofeng: {
    name: tr('creationTemplates.chineseInkPainting'),
    description: tr('creationTemplates.inkWashNegativeSpaceExpressive'),
    category: [tr('creationTemplates.chineseStyle'), tr('creationTemplates.inkWash')],
  },
}

export function creationTemplateId(id?: string | null): string {
  return CREATION_TEMPLATE_IDS.find((candidate) => candidate === id)
    ?? DEFAULT_CREATION_TEMPLATE_ID
}

/** 兼容尚未更新的服务端列表，同时保留真实素材与模型配置，不伪造可用模板。 */
export function curatedCreationTemplates(templates: Template[]): Template[] {
  const byId = new Map(templates.map((template) => [template.id, template]))
  return CREATION_TEMPLATE_IDS.flatMap((id, sort_order) => {
    const template = byId.get(id)
    if (!template) return []
    const presentation = PRESENTATION[id]
    return [{
      ...template,
      ...presentation,
      category: [...presentation.category],
      default_ratio: '9:16',
      sort_order,
    }]
  })
}
