/** 选中节点顶部：本地上传 + 从全局资产库选择 + 角色音色生成/绑定/试听 */
import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { AudioLines, FolderOpen, Loader2, Upload } from 'lucide-react'
import { dramaApi, type DramaAsset } from '../../../../api/drama'
import { CharacterVoicePreviewButton } from '../../../../components/drama/CharacterVoicePreviewButton'
import { generateAndBindCharacterVoice } from '../../../../lib/characterVoiceGenerate'
import { DRAMA_VOICE_BINDING_ENABLED } from '../../../../lib/dramaVoiceBinding'
import { useCharacterVoiceGenerationEnabled } from '../../../../hooks/usePublicCapabilities'
import { VOICE_GENERATION_DISABLED_MESSAGE } from '../../../../lib/publicCapabilities'
import { CharacterVoiceBindModal } from '../../CharacterVoiceBindModal'
import { useCanvasStore } from '../CanvasStore'
import { CANVAS_UPLOADABLE_KINDS, type CanvasNodeKind } from '../canvasTypes'
import {
  canvasKindToLibraryTypes,
  GlobalAssetPickerModal,
} from '../../GlobalAssetPickerModal'
import { tv } from '../../../../i18n/tv'

type CanvasNodeUploadBarProps = {
  nodeId: string
  kind: CanvasNodeKind
  /** 角色节点已绑定音色名 */
  voiceLabel?: string | null
  /** 角色节点已绑定音色试听地址 */
  voiceUrl?: string | null
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const AUDIO_ACCEPT =
  'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.webm'

/** 渲染选中节点的上传与资产库操作条 */
export function CanvasNodeUploadBar({
  nodeId,
  kind,
  voiceLabel,
  voiceUrl,
}: CanvasNodeUploadBarProps) {
  const voiceGenerationEnabled = useCharacterVoiceGenerationEnabled()
  /*
   * uploading 本地上传中
   * pickerOpen 资产库弹窗
   * voiceLoading 一键生成音色中
   * bindOpen 绑定/更换弹窗
   * bindAsset 弹窗用角色资产快照
   * bindBusy 打开弹窗前拉资产中
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
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [bindOpen, setBindOpen] = useState(false)
  const [bindAsset, setBindAsset] = useState<DramaAsset | null>(null)
  const [bindBusy, setBindBusy] = useState(false)

  const stopFlowEvent = useCallback((event: MouseEvent) => {
    event.stopPropagation()
  }, [])

  if (!CANVAS_UPLOADABLE_KINDS.has(kind)) return null

  const isCharacter = kind === 'character'
  const isAudio = kind === 'audio'
  const hasVoice = Boolean(voiceUrl || voiceLabel)
  const uploadLabel = isAudio ? tv('上传音频', 'Tải âm thanh lên') : tv('上传图片', 'Tải ảnh lên')
  const accept = isAudio ? AUDIO_ACCEPT : IMAGE_ACCEPT
  const toolbarBusy = uploading || voiceLoading || bindBusy

  /** 确保角色资产存在并打开绑定弹窗 */
  async function openVoiceBindModal() {
    if (bindBusy || voiceLoading) return
    setBindBusy(true)
    try {
      const assetId = await ensureNodeAsset(nodeId)
      const list = await dramaApi.listAssets(projectId)
      const asset = list.find((a) => a.id === assetId)
      if (!asset) throw new Error(tv('角色资产不存在', 'Tài sản nhân vật không tồn tại'))
      setBindAsset(asset)
      setBindOpen(true)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : tv('无法打开音色绑定', 'Không mở được phần gắn giọng nói'))
    } finally {
      setBindBusy(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (isAudio) {
      const name = (file.name || '').toLowerCase()
      const okType =
        file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(name)
      if (!okType) {
        setErrorMessage(tv('请选择音频文件（MP3 / WAV / M4A 等）', 'Vui lòng chọn tệp âm thanh (MP3 / WAV / M4A…)'))
        return
      }
      if (file.size > 30 * 1024 * 1024) {
        setErrorMessage(tv('音频不能超过 30MB', 'Âm thanh không được vượt quá 30MB'))
        return
      }
    } else {
      if (!file.type.startsWith('image/')) {
        setErrorMessage(tv('请选择图片文件', 'Vui lòng chọn tệp ảnh'))
        return
      }
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage(tv('图片不能超过 20MB', 'Ảnh không được vượt quá 20MB'))
        return
      }
    }

    setUploading(true)
    void uploadNodeMedia(nodeId, file)
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : tv('上传失败', 'Tải lên thất bại')))
      .finally(() => setUploading(false))
  }

  /** 一键 AI 生成音色并绑定到角色节点 */
  async function handleGenerateVoice() {
    if (!voiceGenerationEnabled) { setErrorMessage(VOICE_GENERATION_DISABLED_MESSAGE); return }
    if (voiceLoading) return
    setVoiceLoading(true)
    try {
      const assetId = await ensureNodeAsset(nodeId)
      const list = await dramaApi.listAssets(projectId)
      const asset = list.find((a) => a.id === assetId)
      if (!asset) throw new Error(tv('角色资产不存在', 'Tài sản nhân vật không tồn tại'))
      const { character } = await generateAndBindCharacterVoice(projectId, asset)
      // syncNodeFromAsset 内部 markDirty，写入 voiceLabel/voiceUrl 并触发自动保存
      syncNodeFromAsset(nodeId, character)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : tv('音色生成失败', 'Tạo giọng nói thất bại'))
    } finally {
      setVoiceLoading(false)
    }
  }

  return (
    <>
      <div
        className="fc-node-toolbar nodrag nopan"
        onMouseDown={stopFlowEvent}
        onPointerDown={stopFlowEvent}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="fc-hidden-input"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="fc-toolbar-chip"
          disabled={toolbarBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="fc-spin" /> : <Upload size={14} strokeWidth={1.8} />}
          {uploading ? tv('上传中…', 'Đang tải lên…') : uploadLabel}
        </button>
        <button
          type="button"
          className="fc-toolbar-chip"
          disabled={toolbarBusy}
          onClick={() => setPickerOpen(true)}
        >
          <FolderOpen size={14} strokeWidth={1.8} />
          {tv("从资产库选择", "Chọn từ thư viện tài sản")}
        </button>
        {DRAMA_VOICE_BINDING_ENABLED && isCharacter ? (
          hasVoice && voiceUrl ? (
            <>
              <CharacterVoicePreviewButton
                url={voiceUrl}
                label={voiceLabel || undefined}
                variant="chip"
                className="is-active"
                onError={setErrorMessage}
              />
              <button
                type="button"
                className="fc-toolbar-chip"
                disabled={toolbarBusy}
                onClick={() => void openVoiceBindModal()}
                title={tv("更换或解绑音色；也可改连其他音频节点", "Đổi hoặc gỡ giọng nói; cũng có thể nối sang nút âm thanh khác")}
              >
                {bindBusy ? <Loader2 size={14} className="fc-spin" /> : <AudioLines size={14} strokeWidth={1.8} />}
                {bindBusy ? tv('打开中…', 'Đang mở…') : tv('更换', 'Đổi')}
              </button>
            </>
          ) : (
            <>
              {voiceGenerationEnabled && <button
                type="button"
                className="fc-toolbar-chip"
                disabled={toolbarBusy}
                onClick={() => void handleGenerateVoice()}
                title={tv("按角色设定 AI 生成音色", "AI tạo giọng nói theo thiết lập nhân vật")}
              >
                {voiceLoading ? (
                  <Loader2 size={14} className="fc-spin" />
                ) : (
                  <AudioLines size={14} strokeWidth={1.8} />
                )}
                {voiceLoading ? tv('生成中…', 'Đang tạo…') : tv('生成音色', 'Tạo giọng nói')}
              </button>}
              <button
                type="button"
                className="fc-toolbar-chip"
                disabled={toolbarBusy}
                onClick={() => void openVoiceBindModal()}
                title={tv("上传/选择音色，或把「音频」节点连到本角色", "Tải lên/chọn giọng nói, hoặc nối nút “Âm thanh” vào nhân vật này")}
              >
                {bindBusy ? <Loader2 size={14} className="fc-spin" /> : null}
                {bindBusy ? tv('打开中…', 'Đang mở…') : tv('绑定音色', 'Gắn giọng nói')}
              </button>
            </>
          )
        ) : null}
      </div>

      <GlobalAssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        defaultTab="all"
        allowedTypes={canvasKindToLibraryTypes(kind)}
        title={tv("从资产库选择", "Chọn từ thư viện tài sản")}
        confirmLabel={tv("确认使用", "Xác nhận sử dụng")}
        onPick={async (source) => {
          await applyLibraryMediaToNode(nodeId, source)
        }}
      />

      {DRAMA_VOICE_BINDING_ENABLED && bindAsset ? (
        <CharacterVoiceBindModal
          asset={bindAsset}
          projectId={projectId}
          open={bindOpen}
          onClose={() => {
            setBindOpen(false)
            setBindAsset(null)
          }}
          onBound={(updated) => {
            syncNodeFromAsset(nodeId, updated)
            setBindOpen(false)
            setBindAsset(null)
          }}
          onError={setErrorMessage}
        />
      ) : null}
    </>
  )
}
