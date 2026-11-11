import type { Template } from '../api'
import { tv } from '../i18n/tv'

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
    name: tv('3D 动画', 'Hoạt hình 3D'),
    description: tv('圆润的三维角色与柔和光影，适合知识讲解和故事短片。', 'Nhân vật ba chiều tròn trịa và ánh sáng mềm mại, phù hợp giảng giải kiến thức và phim ngắn kể chuyện.'),
    category: ['3D', tv('动画', 'Hoạt hình')],
  },
  soft_anime: {
    name: tv('二维动漫', 'Anime 2D'),
    description: tv('干净线稿与柔和赛璐璐色彩，适合青春故事和情感表达。', 'Nét vẽ sạch và màu cel mềm, phù hợp truyện thanh xuân và biểu đạt cảm xúc.'),
    category: [tv('二维', '2D'), tv('动漫', 'Anime')],
  },
  kids_flat: {
    name: tv('绘本插画', 'Tranh minh họa truyện'),
    description: tv('柔和粉彩与亲切的插画角色，适合儿童科普和温暖故事。', 'Màu phấn mềm và nhân vật minh họa thân thiện, phù hợp khoa học thiếu nhi và câu chuyện ấm áp.'),
    category: [tv('绘本', 'Truyện tranh'), tv('插画', 'Minh họa')],
  },
  ink_guofeng: {
    name: tv('国风水墨', 'Thủy mặc Trung Hoa'),
    description: tv('水墨留白与写意笔触，适合历史文化和诗意故事。', 'Để trắng kiểu thủy mặc và nét bút tả ý, phù hợp lịch sử văn hóa và câu chuyện thi vị.'),
    category: [tv('国风', 'Phong cách Trung Hoa'), tv('水墨', 'Thủy mặc')],
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
