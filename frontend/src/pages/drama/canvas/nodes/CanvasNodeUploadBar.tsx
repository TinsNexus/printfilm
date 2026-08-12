/** 选中节点顶部：本地上传 + 从全局资产库选择 + 角色音色绑定 */
import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { AudioLines, FolderOpen, Loader2, Upload } from 'lucide-react'
import { dramaApi, type DramaAsset } from '../../../../api/drama'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_UPLOADABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'
import {
  canvasKindToLibraryTypes,
  GlobalAssetPickerModal,
} from '../../GlobalAssetPickerModal'
import {
  CharacterVoiceBindModal,
} from '../../CharacterVoiceBindModal'

type CanvasNodeUploadBarProps = {
  nodeId: string
  kind: CanvasNodeKind
  /** 角色节点已绑定音色名（展示「更换音色」） */
  voiceLabel?: string | null
}

/** 渲染选中节点的上传与资产库操作条 */
export function CanvasNodeUploadBar({ nodeId, kind, voiceLabel }: CanvasNodeUploadBarProps) {
  /*
   * uploading 本地上传中
   * pickerOpen 资产库弹窗
   * voiceOpen 音色绑定弹窗
   * voiceAsset 打开弹窗时的角色资产
   * voiceLoading 拉取角色资产中
   */
  const {
    uploadNodeMedia,
    applyLibraryMediaToNode,
    syncNodeFromAsset,
    ensureNodeAsset,
    setErrorMessage,
    projectId,
  } = useCanvasStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceAsset, setVoiceAsset] = useState<DramaAsset | null>(null)
  const [voiceLoading, setVoiceLoading] = useState(false)

  const stopFlowEvent = useCallback((event: MouseEvent) => {
    event.stopPropagation()
  }, [])

  if (!CANVAS_UPLOADABLE_KINDS.has(kind)) return null

  const isCharacter = kind === 'character'
  const hasVoice = Boolean(voiceLabel)

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

  // 打开音色绑定：确保资产存在并拉取最新 params
  async function openVoiceBind() {
    if (voiceLoading) return
    setVoiceLoading(true)
    try {
      const assetId = await ensureNodeAsset(nodeId)
      const list = await dramaApi.listAssets(projectId)
      const asset = list.find((a) => a.id === assetId)
      if (!asset) throw new Error('角色资产不存在')
      setVoiceAsset(asset)
      setVoiceOpen(true)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '打开音色绑定失败')
    } finally {
      setVoiceLoading(false)
    }
  }

  return (
    <>
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
        <button
          type="button"
          className="fc-toolbar-chip"
          disabled={uploading}
          onClick={() => setPickerOpen(true)}
        >
          <FolderOpen size={14} strokeWidth={1.8} />
          从资产库选择
        </button>
        {isCharacter ? (
          <button
            type="button"
            className={`fc-toolbar-chip${hasVoice ? ' is-active' : ''}`}
            disabled={uploading || voiceLoading}
            onClick={() => void openVoiceBind()}
            title={hasVoice ? `已绑定：${voiceLabel}` : '为角色绑定 Seedance 参考音色'}
          >
            {voiceLoading ? (
              <Loader2 size={14} className="fc-spin" />
            ) : (
              <AudioLines size={14} strokeWidth={1.8} />
            )}
            {voiceLoading ? '加载中…' : hasVoice ? '更换音色' : '绑定音色'}
          </button>
        ) : null}
      </div>

      <GlobalAssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        defaultTab="all"
        allowedTypes={canvasKindToLibraryTypes(kind)}
        title="从资产库选择"
        confirmLabel="确认使用"
        onPick={async (source) => {
          await applyLibraryMediaToNode(nodeId, source)
        }}
      />

      {voiceAsset ? (
        <CharacterVoiceBindModal
          asset={voiceAsset}
          projectId={projectId}
          open={voiceOpen}
          onClose={() => {
            setVoiceOpen(false)
            setVoiceAsset(null)
          }}
          onBound={(updated) => {
            syncNodeFromAsset(nodeId, updated)
            setVoiceAsset(updated)
          }}
          onError={setErrorMessage}
        />
      ) : null}
    </>
  )
}
