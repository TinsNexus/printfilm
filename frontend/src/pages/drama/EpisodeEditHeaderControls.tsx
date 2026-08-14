/** 分集编辑顶栏：视频风格 / 模型 / 画幅（pill 按钮 + 下拉面板） */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, ChevronDown, CircleHelp, RectangleVertical, Smile } from 'lucide-react'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import { SeedanceRulesModal } from '../../components/drama/SeedanceRulesModal'
import {
  getImageStyleLabel,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../lib/dramaImageStyles'
import { MODEL_OPTIONS, RATIO_OPTIONS, RES_OPTIONS } from './dramaEpisodeEditUtils'
import './canvas/nodes/dramaImageGenOptions.css'

type Props = {
  styleId: ImageStyleId | ''
  modelId: string
  aspectRatio: (typeof RATIO_OPTIONS)[number]
  resolution: (typeof RES_OPTIONS)[number]
  linkLastFrame: boolean
  onStyleChange: (id: ImageStyleId | '') => void
  onModelChange: (id: string) => void
  onAspectRatioChange: (r: (typeof RATIO_OPTIONS)[number]) => void
  onResolutionChange: (r: (typeof RES_OPTIONS)[number]) => void
  onLinkLastFrameChange: (enabled: boolean) => void
  disabled?: boolean
}

type OpenPanel = 'style' | 'model' | 'output' | null

const STYLE_PANEL_WIDTH = 420

// 渲染顶栏生成参数控件
export function EpisodeEditHeaderControls({
  styleId,
  modelId,
  aspectRatio,
  resolution,
  linkLastFrame,
  onStyleChange,
  onModelChange,
  onAspectRatioChange,
  onResolutionChange,
  onLinkLastFrameChange,
  disabled = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<OpenPanel>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)

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

  const styleLabel = getImageStyleLabel(styleId) || '视频风格'
  const modelLabel = MODEL_OPTIONS.find((m) => m.id === modelId)?.label || modelId
  const outputLabel = `${aspectRatio} · ${resolution}`

  return (
    <div
      ref={rootRef}
      className="fc-gen-opts drama-ep-header-gen-opts"
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="fc-gen-opts-triggers">
        <button
          type="button"
          className={`fc-gen-opt-btn${open === 'style' || styleId ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'style' ? null : 'style'))}
          title={styleLabel}
        >
          <Smile size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{styleLabel}</span>
          <ChevronDown size={12} strokeWidth={2} />
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
          className={`fc-gen-opt-btn${open === 'output' ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => setOpen((c) => (c === 'output' ? null : 'output'))}
        >
          <RectangleVertical size={14} strokeWidth={1.8} />
          <span className="fc-gen-opt-label">{outputLabel}</span>
          <ChevronDown size={12} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="fc-gen-opt-btn drama-seedance-help-btn"
          disabled={disabled}
          title="Seedance 传值与使用规则"
          aria-label="Seedance 传值与使用规则"
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
                  aria-label="视频风格"
                >
                  <div className="fc-gen-opt-panel-title">视频风格</div>
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
                  aria-label="视频模型"
                >
                  <div className="fc-gen-opt-panel-title">视频模型</div>
                  <div className="fc-gen-model-list">
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`fc-gen-model-item${modelId === opt.id ? ' selected' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onModelChange(opt.id)
                          setOpen(null)
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {open === 'output' ? (
                <div
                  className="fc-gen-opt-panel drama-ep-opt-panel fc-gen-opt-panel--portal"
                  style={panelStyle}
                  role="dialog"
                  aria-label="画幅与清晰度"
                >
                  <div className="fc-gen-opt-panel-title">画幅</div>
                  <div className="fc-gen-chip-row">
                    {RATIO_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`fc-gen-chip${aspectRatio === r ? ' selected' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onAspectRatioChange(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="fc-gen-opt-panel-title" style={{ marginTop: 12 }}>
                    清晰度
                  </div>
                  <div className="fc-gen-chip-row">
                    {RES_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`fc-gen-chip${resolution === r ? ' selected' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onResolutionChange(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="fc-gen-opt-panel-title" style={{ marginTop: 12 }}>
                    镜间衔接
                  </div>
                  <label className="drama-ep-link-last-frame">
                    <input
                      type="checkbox"
                      checked={linkLastFrame}
                      disabled={disabled}
                      onChange={(e) => onLinkLastFrameChange(e.target.checked)}
                    />
                    <span>
                      用上一镜尾帧衔接
                      <em>有角色/场景参考时以参考图附带尾帧（不可与 first_frame 混用）</em>
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
