/** 大纲「项目设置」：画幅/画风/字幕/人物介绍/尾帧衔接（全局可改；分镜页只读） */
import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { DramaImageStyleModal } from './DramaImageStyleModal'
import {
  characterIntroModeEnabled,
  readEpisodeCharacterIntroMode,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'
import { type ImageStyleId } from '../../lib/dramaImageStyles'
import {
  DRAMA_RATIO_OPTIONS,
  readProjectAspectRatio,
  readProjectResolution,
  type DramaAspectRatio,
  type DramaResolution,
} from '../../lib/dramaProjectOutputSettings'
import {
  clampVideoResolutionForModel,
  hasKnownVideoModelResolutions,
  resolutionsForModel,
} from '../../lib/dramaVideoGenerationOptions'
import {
  catalogVideoModels,
  useMediaModelsCatalog,
} from '../../hooks/useMediaModelsCatalog'
import {
  readEpisodeSubtitleMode,
  subtitleModeUsesModelOutput,
  type DramaSubtitleMode,
} from '../../lib/dramaSubtitleSettings'
import type { DramaProject, DramaScript } from '../../api/drama'
import { dramaApi } from '../../api/drama'
import { tv } from '../../i18n/tv'

type Props = {
  open: boolean
  projectId: number
  project: DramaProject
  script: DramaScript | null
  onClose: () => void
  onProjectChange: (p: DramaProject) => void
  onScriptChange: (s: DramaScript) => void
  onError: (msg: string) => void
}

type ChoiceProps<T extends string | boolean> = {
  options: Array<{ value: T; label: string }>
  value: T
  disabled?: boolean
  onChange: (value: T) => void
}

function coerceLinkLastFrame(params: Record<string, unknown> | null | undefined): boolean {
  const raw = params?.linkLastFrame ?? params?.link_last_frame
  if (raw == null) return true
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const n = raw.trim().toLowerCase()
    if (['0', 'false', 'no', 'off', ''].includes(n)) return false
  }
  return Boolean(raw)
}

/** 项目设置内选项条（复用大纲 chip 样式） */
function SettingsChoiceRow<T extends string | boolean>({
  options,
  value,
  disabled,
  onChange,
}: ChoiceProps<T>) {
  return (
    <div className="drama-project-settings-chips" role="group">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`drama-outline-chip-btn${value === opt.value ? ' is-on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** 项目级全局成片设置弹窗 */
export function DramaProjectSettingsModal({
  open,
  projectId,
  project,
  script,
  onClose,
  onProjectChange,
  onScriptChange,
  onError,
}: Props) {
  const [saving, setSaving] = useState(false)
  const projectParams = (project.params || {}) as Record<string, unknown>
  const styleId = (String(script?.params?.image_style_id || projectParams.image_style_id || '') ||
    '') as ImageStyleId | ''
  const aspectRatio = readProjectAspectRatio(projectParams)
  const resolution = readProjectResolution(projectParams)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  const videoModelId =
    String(projectParams.video_model || projectParams.model_id || '').trim() ||
    catalog?.defaults.video_model ||
    ''
  const resolutionOptions = resolutionsForModel(videoModelId, catalog, videoModels)
  const clampedResolution = clampVideoResolutionForModel(
    videoModelId,
    resolution,
    catalog,
    videoModels,
  ) as DramaResolution
  const subtitleMode = readEpisodeSubtitleMode(projectParams)
  const characterIntroMode = readEpisodeCharacterIntroMode(projectParams)
  const linkLastFrame = coerceLinkLastFrame(projectParams)

  useEffect(() => {
    if (!open || saving) return
    if (!hasKnownVideoModelResolutions(videoModelId, catalog, videoModels)) return
    if (clampedResolution === resolution) return
    void patchProjectParams({ resolution: clampedResolution })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoModelId, catalog, clampedResolution])

  async function patchProjectParams(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const nextParams = { ...projectParams, ...patch }
      const updated = await dramaApi.updateProject(projectId, { params: nextParams })
      onProjectChange(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('项目设置保存失败', 'Lưu cài đặt dự án thất bại'))
    } finally {
      setSaving(false)
    }
  }

  async function handleStyleChange(id: ImageStyleId | '') {
    setSaving(true)
    try {
      const updated = await dramaApi.updateScript(projectId, {
        image_style_id: id || undefined,
      })
      onScriptChange(updated)
      const p = await dramaApi.getProject(projectId)
      onProjectChange(p)
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('风格保存失败', 'Lưu phong cách thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tv("项目设置", "Cài đặt dự án")}
      size="md"
      className="drama-project-settings-modal"
      footer={
        <button type="button" className="drama-btn-primary" onClick={onClose} disabled={saving}>
          {tv("完成", "Xong")}
        </button>
      }
    >
      <div className="drama-project-settings">
        <p className="drama-muted drama-project-settings-lead">
          {tv("全项目统一；分镜页只读展示。修改画幅后请重新生成相关镜头。", "Thống nhất toàn dự án; trang phân cảnh chỉ hiển thị, không sửa. Sau khi đổi tỷ lệ khung hãy tạo lại các cảnh liên quan.")}
        </p>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>{tv("画幅", "Tỷ lệ khung")}</h4>
          </div>
          <SettingsChoiceRow
            value={aspectRatio}
            disabled={saving}
            options={DRAMA_RATIO_OPTIONS.map((r) => ({ value: r as DramaAspectRatio, label: r }))}
            onChange={(ratio) => void patchProjectParams({ aspect_ratio: ratio })}
          />
          <div className="drama-project-settings-head">
            <h4>{tv("清晰度", "Độ nét")}</h4>
          </div>
          <SettingsChoiceRow
            value={clampedResolution}
            disabled={saving}
            options={resolutionOptions.map((r) => ({ value: r as DramaResolution, label: r }))}
            onChange={(res) => void patchProjectParams({ resolution: res })}
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>{tv("画面风格", "Phong cách hình ảnh")}</h4>
          </div>
          <DramaImageStyleModal
            variant="field"
            fieldLabel=""
            title={tv("选择项目风格", "Chọn phong cách dự án")}
            emptyLabel={tv("选择风格", "Chọn phong cách")}
            value={styleId}
            disabled={saving}
            onChange={(id) => void handleStyleChange(id)}
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>{tv("字幕方式", "Cách làm phụ đề")}</h4>
          </div>
          <SettingsChoiceRow
            value={subtitleMode}
            disabled={saving}
            options={[
              { value: 'post' as DramaSubtitleMode, label: tv('后期字幕', 'Phụ đề hậu kỳ') },
              { value: 'model' as DramaSubtitleMode, label: tv('模型字幕', 'Phụ đề do model') },
            ]}
            onChange={(mode) =>
              void patchProjectParams({
                subtitleMode: mode,
                subtitleEnabled: subtitleModeUsesModelOutput(mode),
              })
            }
          />
          <p className="drama-muted">{tv("后期字幕成片后拼接；模型字幕生成时烧录。", "Phụ đề hậu kỳ được ghép sau khi có phim; phụ đề do model được đốt khi tạo.")}</p>
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>{tv("人物介绍叠字", "Chữ giới thiệu nhân vật")}</h4>
          </div>
          <SettingsChoiceRow
            value={characterIntroMode}
            disabled={saving}
            options={[
              { value: 'off' as DramaCharacterIntroMode, label: tv('无介绍叠字', 'Không chữ giới thiệu') },
              { value: 'model' as DramaCharacterIntroMode, label: tv('人物介绍', 'Giới thiệu nhân vật') },
            ]}
            onChange={(mode) =>
              void patchProjectParams({
                characterIntroMode: mode,
                characterIntroEnabled: characterIntroModeEnabled(mode),
              })
            }
          />
        </section>

        <section className="drama-project-settings-section">
          <div className="drama-project-settings-head">
            <h4>{tv("镜间衔接", "Nối giữa các cảnh")}</h4>
          </div>
          <SettingsChoiceRow
            value={linkLastFrame}
            disabled={saving}
            options={[
              { value: true, label: tv('尾帧衔接', 'Nối khung cuối') },
              { value: false, label: tv('并发生成', 'Tạo đồng thời') },
            ]}
            onChange={(enabled) => void patchProjectParams({ linkLastFrame: enabled })}
          />
          <p className="drama-muted">{tv("开启后后一镜会参考前一镜尾帧，风格更连贯。", "Khi bật, cảnh sau sẽ tham chiếu khung cuối cảnh trước, phong cách liền mạch hơn.")}</p>
        </section>
      </div>
    </Modal>
  )
}
