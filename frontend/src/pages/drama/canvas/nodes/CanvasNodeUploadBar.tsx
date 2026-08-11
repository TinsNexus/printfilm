/** 选中节点顶部：本地上传图片操作条 */
import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_UPLOADABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'

type CanvasNodeUploadBarProps = {
  nodeId: string
  kind: CanvasNodeKind
}

/** 渲染选中节点的上传操作条 */
export function CanvasNodeUploadBar({ nodeId, kind }: CanvasNodeUploadBarProps) {
  const { uploadNodeMedia, setErrorMessage } = useCanvasStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!CANVAS_UPLOADABLE_KINDS.has(kind)) return null

  const stopFlowEvent = useCallback((event: MouseEvent) => {
    event.stopPropagation()
  }, [])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('请选择图片文件')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('图片不能超过 20MB')
      return
    }

    setUploading(true)
    void uploadNodeMedia(nodeId, file)
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : '上传失败'))
      .finally(() => setUploading(false))
  }

  return (
    <div className="fc-node-toolbar nodrag nopan" onMouseDown={stopFlowEvent} onPointerDown={stopFlowEvent}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="fc-hidden-input"
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="fc-toolbar-chip"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 size={14} className="fc-spin" /> : <Upload size={14} strokeWidth={1.8} />}
        {uploading ? '上传中…' : '上传图片'}
      </button>
    </div>
  )
}
