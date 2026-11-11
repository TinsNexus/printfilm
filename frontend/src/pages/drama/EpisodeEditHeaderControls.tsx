/** 分集编辑顶栏：画幅/清晰度 / 视频风格 / 字幕 / 人物介绍 / 模型 / 镜间衔接 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'

import { createPortal } from 'react-dom'

import { BarChart3, ChevronDown, CircleHelp, Link2, Smile, Type, Users } from 'lucide-react'

import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'

import { DramaMediaModelPicker } from '../../components/drama/DramaMediaModelPicker'
import { SeedanceRulesModal } from '../../components/drama/SeedanceRulesModal'

import {
  getImageStyleLabel,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../lib/dramaImageStyles'

import { subtitleModeUsesModelOutput, type DramaSubtitleMode } from '../../lib/dramaSubtitleSettings'
import {
  characterIntroModeEnabled,
  type DramaCharacterIntroMode,
} from '../../lib/dramaCharacterIntro'

import {
  catalogModelLabel,
  catalogVideoModels,
  useMediaModelsCatalog,
} from '../../hooks/useMediaModelsCatalog'

import { DramaProjectOutputSettings } from './DramaProjectOutputSettings'

import './canvas/nodes/dramaImageGenOptions.css'
import { tv } from '../../i18n/tv'
type Props = {
  styleId: ImageStyleId | ''
  modelId: string
  episodeParams: Record<string, unknown>
  projectParams: Record<string, unknown>
  linkLastFrame: boolean
  subtitleMode: DramaSubtitleMode
  characterIntroMode: DramaCharacterIntroMode
  onStyleChange: (id: ImageStyleId | '') => void
  onModelChange: (id: string) => void
  onEpisodeOutputChange: (
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) => void | Promise<void>
  onLinkLastFrameChange: (enabled: boolean) => void
  onSubtitleModeChange: (mode: DramaSubtitleMode) => void
  onCharacterIntroModeChange: (mode: DramaCharacterIntroMode) => void
  disabled?: boolean
  /** 风格/字幕/介绍/衔接为项目全局，分镜页只展示不可改；画幅/清晰度仍可改（随模型过滤） */
  globalSettingsReadOnly?: boolean
}

type OpenPanel = 'style' | 'model' | 'link' | 'subtitle' | 'intro' | null

const STYLE_PANEL_WIDTH = 420

// 渲染顶栏生成参数控件
export function EpisodeEditHeaderControls({
  styleId,
  modelId,
  episodeParams,
  projectParams,
  linkLastFrame,
  subtitleMode,
  characterIntroMode,
  onStyleChange,
  onModelChange,
  onEpisodeOutputChange,
  onLinkLastFrameChange,
  onSubtitleModeChange,
  onCharacterIntroModeChange,
  disabled = false,
  globalSettingsReadOnly = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<OpenPanel>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPanelStyle(null)
      return
    }
    // 固定定位下拉面板，避免与 top/bottom 冲突导致高度被压扁
    function updatePanelPosition() {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const width =
        open === 'style'
          ? Math.min(STYLE_PANEL_WIDTH, window.innerWidth - 24)
          : open === 'model'
            ? Math.min(400, window.innerWidth - 24)
            : Math.min(360, window.innerWidth - 24)
      let left = rect.right - width
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
      const top = Math.min(rect.bottom + 8, window.innerHeight - 24)
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        bottom: 'auto',
        right: 'auto',
        zIndex: 320,
      })
    }
    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    function onDoc(e: Event) {
      const target = e.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      if ((target as Element).closest?.('.fc-gen-opt-panel--portal')) return
      setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }
  const styleLabel = getImageStyleLabel(styleId) || tv('视频风格', 'Phong cách video')
  const modelLabel = catalogModelLabel(modelId, videoModels, tv('视频模型', 'Model video'))
  const subtitleLabel = subtitleMode === 'model' ? tv('模型字幕', 'Phụ đề do model') : tv('后期字幕', 'Phụ đề hậu kỳ')
  const subtitleUsesModel = subtitleModeUsesModelOutput(subtitleMode)
  const introLabel = characterIntroMode === 'model' ? tv('人物介绍', 'Giới thiệu nhân vật') : tv('无介绍叠字', 'Không chữ giới thiệu')
  const introEnabled = characterIntroModeEnabled(characterIntroMode)
  const globalLocked = disabled || globalSettingsReadOnly
  return (
    <div
      ref={rootRef}
      className="fc-gen-opts drama-ep-header-gen-opts"
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="fc-gen-opts-triggers">
        <DramaProjectOutputSettings
          scope="episode"
          params={episodeParams}
          fallbackParams={projectParams}
          disabled={disabled}
          compact
          videoModelId={modelId}
          onChange={onEpisodeOutputChange}
        />
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'style' || styleId ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'style' ? null : 'style'))
          }}
          title={globalSettingsReadOnly ? tv(`${styleLabel}（项目设置，分镜只读）`, `${styleLabel} (cài đặt dự án, phân cảnh chỉ đọc)`) : styleLabel}
        >
          <Smile size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{styleLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'subtitle' || !subtitleUsesModel ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'subtitle' ? null : 'subtitle'))
          }}
          title={globalSettingsReadOnly ? tv(`${subtitleLabel}（项目设置，分镜只读）`, `${subtitleLabel} (cài đặt dự án, phân cảnh chỉ đọc)`) : tv('字幕设置', 'Cài đặt phụ đề')}
        >
          <Type size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{subtitleLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'intro' || !introEnabled ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'intro' ? null : 'intro'))
          }}
          title={globalSettingsReadOnly ? tv(`${introLabel}（项目设置，分镜只读）`, `${introLabel} (cài đặt dự án, phân cảnh chỉ đọc)`) : tv('人物介绍叠字', 'Chữ giới thiệu nhân vật')}
        >
          <Users size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{introLabel}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'model' ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'model' ? null : 'model'))}
        >
          <BarChart3 size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{modelLabel}</span>
          <ChevronDown size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'link' || linkLastFrame ? ' active' : ''}${globalSettingsReadOnly ? ' is-readonly' : ''}`}
          disabled={globalLocked}
          onClick={() => {
            if (globalSettingsReadOnly) return
            setOpen((c) => (c === 'link' ? null : 'link'))
          }}
          title={globalSettingsReadOnly ? tv(`${linkLastFrame ? '尾帧衔接' : '并发生成'}（项目设置，分镜只读）`, `${linkLastFrame ? '尾帧衔接' : '并发生成'} (cài đặt dự án, phân cảnh chỉ đọc)`) : tv('镜间尾帧衔接', 'Nối khung cuối giữa các phân cảnh')}
        >
          <Link2 size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{linkLastFrame ? tv('尾帧衔接', 'Nối khung cuối') : tv('并发生成', 'Tạo đồng thời')}</span>
          {!globalSettingsReadOnly ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </button>
        <button
          type="button"
          className="fc-gen-opt-btn drama-seedance-help-btn"
          disabled={disabled}
          title={tv("Seedance 传值与使用规则", "Cách truyền giá trị và quy tắc dùng Seedance")}
          aria-label={tv("Seedance 传值与使用规则", "Cách truyền giá trị và quy tắc dùng Seedance")}
          onClick={() => setRulesOpen(true)}
        >
          <CircleHelp size={14} strokeWidth={1.8} />
        </button>
      </div>
      <SeedanceRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {open && panelStyle
        ? createPortal(
            <>
              {open === 'style' ? (
                <div
                  className="fc-gen-opt-panel fc-gen-style-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label={tv("视频风格", "Phong cách video")}
                >
                  <div className="fc-gen-opt-panel-title">{tv("视频风格", "Phong cách video")}</div>
                  <div className="fc-gen-style-grid">
                    {IMAGE_STYLE_OPTIONS.map((opt) => {
                      const selected = styleId === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`fc-gen-style-card${selected ? ' selected' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onStyleChange(opt.id)
                            setOpen(null)
                          }}
                        >
                          <DramaImageStylePreviewImg styleId={opt.id} alt={opt.label} />
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {open === 'model' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label={tv("视频模型", "Model video")}
                >
                  <div className="fc-gen-opt-panel-title">{tv("视频模型", "Model video")}</div>
                  <DramaMediaModelPicker
                    models={videoModels}
                    selectedId={modelId}
                    emptyHint={tv("请先在管理后台「模型」保存预设默认模型", "Vui lòng lưu model mặc định preset ở “Model” trong trang quản trị trước")}
                    onSelect={(opt) => {
                      onModelChange(opt.id)
                      setOpen(null)
                    }}
                  />
                </div>
              ) : null}
              {open === 'link' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label={tv("镜间衔接", "Nối giữa các cảnh")}
                >
                  <div className="fc-gen-opt-panel-title">{tv("镜间衔接", "Nối giữa các cảnh")}</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="checkbox"
                      checked={linkLastFrame}
                      disabled={disabled}
                      onChange={(e) => onLinkLastFrameChange(e.target.checked)}
                    />
                    <span>
                      {tv("用上一镜尾帧衔接", "Nối bằng khung cuối cảnh trước")}
                      <em>
                        {tv("默认开启。按镜序生成，可提前提交下一镜并在队列中等待上一镜完成；关闭后默认并发生成。切换时会立刻重排未开始的任务。有角色/场景参考时以参考图附带尾帧（不可与 first_frame 混用）", "Mặc định bật. Tạo theo thứ tự cảnh, có thể gửi trước cảnh tiếp theo và chờ cảnh trước hoàn tất trong hàng đợi; khi tắt mặc định tạo đồng thời. Khi chuyển sẽ sắp xếp lại ngay các tác vụ chưa bắt đầu. Khi có tham chiếu nhân vật/bối cảnh thì ảnh tham chiếu kèm khung cuối (không được dùng lẫn với first_frame)")}
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
              {open === 'subtitle' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label={tv("字幕设置", "Cài đặt phụ đề")}
                >
                  <div className="fc-gen-opt-panel-title">{tv("字幕设置", "Cài đặt phụ đề")}</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-subtitle-mode"
                      checked={subtitleMode === 'model'}
                      disabled={disabled}
                      onChange={() => onSubtitleModeChange('model')}
                    />
                    <span>
                      {tv("模型自出字幕", "Model tự tạo phụ đề")}
                      <em>
                        {tv("切换后会立刻在当前分镜正文里补回「同步字幕 / 字幕 cue」提示词，生成时由模型直接出字幕。", "Sau khi chuyển sẽ bổ sung lại ngay prompt “同步字幕 / 字幕 cue” vào nội dung phân cảnh hiện tại, khi tạo model trực tiếp ra phụ đề.")}
                      </em>
                    </span>
                  </label>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-subtitle-mode"
                      checked={subtitleMode === 'post'}
                      disabled={disabled}
                      onChange={() => onSubtitleModeChange('post')}
                    />
                    <span>
                      {tv("后期拼接字幕", "Ghép phụ đề hậu kỳ")}
                      <em>
                        {tv("切换后会立刻去掉当前分镜里的字幕提示词，字幕可在后期剪辑时添加。", "Sau khi chuyển sẽ bỏ ngay prompt phụ đề trong phân cảnh hiện tại, phụ đề có thể thêm khi dựng hậu kỳ.")}
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
              {open === 'intro' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label={tv("人物介绍", "Giới thiệu nhân vật")}
                >
                  <div className="fc-gen-opt-panel-title">{tv("人物介绍叠字", "Chữ giới thiệu nhân vật")}</div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-character-intro-mode"
                      checked={characterIntroMode === 'model'}
                      disabled={disabled}
                      onChange={() => onCharacterIntroModeChange('model')}
                    />
                    <span>
                      {tv("模型叠字介绍", "Model chèn chữ giới thiệu")}
                      <em>
                        {tv("开启后，重新规划分镜时会为首次出场重要角色写入「人物介绍·画面叠字·角色身旁」；生成时由模型把介绍贴在角色身旁。", "Khi bật, lúc lập kế hoạch lại phân cảnh sẽ ghi “人物介绍·画面叠字·角色身旁” cho nhân vật quan trọng xuất hiện lần đầu; khi tạo model sẽ dán phần giới thiệu bên cạnh nhân vật.")}
                      </em>
                    </span>
                  </label>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="radio"
                      name="episode-character-intro-mode"
                      checked={characterIntroMode === 'off'}
                      disabled={disabled}
                      onChange={() => onCharacterIntroModeChange('off')}
                    />
                    <span>
                      {tv("关闭人物介绍", "Tắt giới thiệu nhân vật")}
                      <em>
                        {tv("切换后会立刻去掉当前分镜里的人物介绍叠字行；生成时禁止画面内介绍字卡。已去掉的介绍需重新分镜才会回来。", "Sau khi chuyển sẽ bỏ ngay dòng chữ giới thiệu nhân vật trong phân cảnh hiện tại; khi tạo cấm thẻ chữ giới thiệu trong hình. Phần giới thiệu đã bỏ phải chia lại phân cảnh mới quay lại.")}
                      </em>
                    </span>
                  </label>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
