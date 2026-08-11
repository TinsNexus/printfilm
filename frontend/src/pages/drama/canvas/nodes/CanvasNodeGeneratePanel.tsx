/** 选中节点底部：AI 生图提示词面板（含风格/模型/画幅） */
import { useEffect, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowUp, Loader2, Sparkles } from 'lucide-react'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_GENERATABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'
import {
  defaultOptionsForAssetKind,
  type ImageGenerationOptions,
} from '../../../../lib/dramaGenerationOptions'
import { DramaImageGenOptionsBar } from './DramaImageGenOptionsBar'

type CanvasNodeGeneratePanelProps = {
  nodeId: string
  kind: CanvasNodeKind
  generating?: boolean
  defaultPrompt?: string
}

/** 渲染 AI 生图编辑面板 */
export function CanvasNodeGeneratePanel({
  nodeId,
  kind,
  generating = false,
  defaultPrompt = '',
}: CanvasNodeGeneratePanelProps) {
  const { generateNodeImage, setErrorMessage, projectImageStyleId } = useCanvasStore()
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [busy, setBusy] = useState(false)
  // options 生图风格/模型/画幅
  const [options, setOptions] = useState<ImageGenerationOptions>(() => ({
    ...defaultOptionsForAssetKind(kind),
    image_style_id: projectImageStyleId || undefined,
  }))

  /* 切换节点或资产带入 visualImage 时同步提示词 */
  useEffect(() => {
    setPrompt(defaultPrompt)
  }, [defaultPrompt, nodeId])

  /* 节点类型或项目风格变化时同步默认选项 */
  useEffect(() => {
    setOptions((prev) => ({
      ...defaultOptionsForAssetKind(kind),
      image_style_id: prev.image_style_id || projectImageStyleId || undefined,
      model_id: prev.model_id,
      resolution: prev.resolution,
    }))
  }, [kind, nodeId, projectImageStyleId])

  const isBusy = busy || generating
  const canSubmit = prompt.trim().length > 0 && !isBusy

  if (!CANVAS_GENERATABLE_KINDS.has(kind)) return null

  const stopFlowEvent = (event: MouseEvent) => {
    event.stopPropagation()
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await generateNodeImage(nodeId, prompt, options)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '生图失败')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form
      className="fc-generate-panel nodrag nopan nowheel"
      onMouseDown={stopFlowEvent}
      onPointerDown={stopFlowEvent}
      onSubmit={handleSubmit}
    >
      <div className="fc-generate-head">
        <Sparkles size={14} strokeWidth={1.8} />
        <span>AI 生图</span>
      </div>
      <textarea
        className="fc-generate-input"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述你想要生成的画面内容…"
        rows={3}
        disabled={isBusy}
      />
      <DramaImageGenOptionsBar value={options} onChange={setOptions} disabled={isBusy} />
      <div className="fc-generate-actions">
        <span className="fc-generate-hint">Enter 生成 · Shift+Enter 换行</span>
        <button type="submit" className="fc-generate-submit" disabled={!canSubmit} aria-label="生成">
          {isBusy ? <Loader2 size={16} className="fc-spin" /> : <ArrowUp size={16} strokeWidth={2} />}
        </button>
      </div>
    </form>
  )
}
