/** 分集 / 项目画幅与清晰度设置（写入 episode.params 或 project.params） */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, RectangleVertical } from 'lucide-react'
import {
  formatProjectOutputLabel,
  readEpisodeAspectRatio,
  readEpisodeResolution,
  readProjectAspectRatio,
  readProjectResolution,
  type DramaAspectRatio,
  type DramaResolution,
} from '../../lib/dramaProjectOutputSettings'
import {
  aspectRatiosForVideoModel,
  clampVideoAspectRatioForModel,
  clampVideoResolutionForModel,
  hasKnownVideoModelResolutions,
  resolutionsForModel,
} from '../../lib/dramaVideoGenerationOptions'
import { catalogVideoModels, useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import './drama.css'
import { tv } from '../../i18n/tv'

type Props = {
  params: Record<string, unknown>
  /** 分集模式下用于展示继承的项目默认 */
  fallbackParams?: Record<string, unknown>
  scope?: 'episode' | 'project'
  disabled?: boolean
  compact?: boolean
  /** 当前视频模型；用于过滤清晰度 / 比例 */
  videoModelId?: string
  onChange: (
    nextParams: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) => void | Promise<void>
}

/** 渲染输出规格控件 */
export function DramaProjectOutputSettings({
  params,
  fallbackParams = {},
  scope = 'episode',
  disabled = false,
  compact = false,
  videoModelId = '',
  onChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const [saving, setSaving] = useState(false)
  const catalog = useMediaModelsCatalog()
  const videoModels = catalogVideoModels(catalog)
  const resolutionOptions = resolutionsForModel(videoModelId, catalog, videoModels)
  const aspectRatioOptions = aspectRatiosForVideoModel(videoModelId, catalog, videoModels)

  const aspectRatio =
    scope === 'episode'
      ? readEpisodeAspectRatio(params, fallbackParams)
      : readProjectAspectRatio(params)
  const resolution =
    scope === 'episode'
      ? readEpisodeResolution(params, fallbackParams)
      : readProjectResolution(params)
  const clampedAspect = clampVideoAspectRatioForModel(
    videoModelId,
    aspectRatio,
    catalog,
    videoModels,
  ) as DramaAspectRatio
  const clampedResolution = clampVideoResolutionForModel(
    videoModelId,
    resolution,
    catalog,
    videoModels,
  ) as DramaResolution
  const outputLabel = formatProjectOutputLabel(clampedAspect, clampedResolution)
  const scopeHint = scope === 'episode' ? tv('本集', 'Tập này') : tv('项目统一', 'Thống nhất dự án')
  const panelTitle = scope === 'episode' ? tv('分集画幅', 'Tỷ lệ khung của tập') : tv('项目画幅', 'Tỷ lệ khung của dự án')
  const panelNote =
    scope === 'episode'
      ? tv('仅本集分镜使用；未单独设置时继承项目默认。比例与清晰度随当前视频模型过滤，可点选修改。', 'Chỉ phân cảnh của tập này dùng; chưa đặt riêng thì kế thừa mặc định của dự án. Tỷ lệ và độ nét được lọc theo model video hiện tại, có thể bấm chọn để sửa.')
      : tv('全部分集共用同一规格；比例与清晰度随当前视频模型过滤。', 'Tất cả các tập dùng chung một quy cách; tỷ lệ và độ nét được lọc theo model video hiện tại.')

  /* 仅在目录已匹配到模型白名单时静默钳制回写，避免 catalog/modelId 未就绪时把 1080p 写成 720p */
  useEffect(() => {
    if (disabled || saving) return
    if (!hasKnownVideoModelResolutions(videoModelId, catalog, videoModels)) return
    if (clampedAspect === aspectRatio && clampedResolution === resolution) return
    void onChange(
      { ...params, aspect_ratio: clampedAspect, resolution: clampedResolution },
      { quiet: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅钳制驱动
  }, [videoModelId, catalog, clampedAspect, clampedResolution, disabled])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPanelStyle(null)
      return
    }

    function updatePanelPosition() {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
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
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }

  /** 合并写回 params */
  async function applyPatch(patch: Partial<{ aspect_ratio: string; resolution: string }>) {
    if (disabled || saving) return
    const nextParams = { ...params, ...patch }
    setSaving(true)
    try {
      await onChange(nextParams)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`fc-gen-opts drama-project-output-settings${compact ? ' drama-project-output-settings--compact' : ''}`}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <button
        type="button"
        className={`fc-gen-opt-btn drama-project-output-btn${open ? ' active' : ''}`}
        disabled={disabled || saving}
        title={
          scope === 'episode'
            ? tv('本集画幅与清晰度；各镜生成后可直接拼接', 'Tỷ lệ khung và độ nét của tập này; các cảnh tạo xong có thể ghép trực tiếp')
            : tv('全项目统一画幅与清晰度，各分镜生成后可直接拼接', 'Tỷ lệ khung và độ nét thống nhất toàn dự án, các phân cảnh tạo xong có thể ghép trực tiếp')
        }
        onClick={() => setOpen((c) => !c)}
      >
        <RectangleVertical size={14} strokeWidth={1.8} />
        <span className="fc-gen-opt-label">{outputLabel}</span>
        {!compact ? <span className="drama-project-output-hint">{scopeHint}</span> : null}
        {!disabled ? <ChevronDown size={12} strokeWidth={2} /> : null}
      </button>

      {open && panelStyle
        ? createPortal(
            <div
              className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
              style={panelStyle}
              role="dialog"
              aria-label={scope === 'episode' ? tv('分集画幅与清晰度', 'Tỷ lệ khung và độ nét của tập') : tv('项目画幅与清晰度', 'Tỷ lệ khung và độ nét của dự án')}
            >
              <div className="fc-gen-opt-panel-title">{panelTitle}</div>
              <p className="drama-project-output-note">{panelNote}</p>
              <div className="fc-gen-chip-row">
                {aspectRatioOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`fc-gen-chip${clampedAspect === r ? ' selected' : ''}`}
                    disabled={disabled || saving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyPatch({ aspect_ratio: r })}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="fc-gen-opt-panel-title" style={{ marginTop: 12 }}>
                {tv("清晰度", "Độ nét")}
              </div>
              <div className="fc-gen-chip-row">
                {resolutionOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`fc-gen-chip${clampedResolution === r ? ' selected' : ''}`}
                    disabled={disabled || saving}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyPatch({ resolution: r as DramaResolution })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
