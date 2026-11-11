/** 角色音色绑定：选择 / 上传 / AI 合成试听，写入 params.voiceAudio */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dramaApi, resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import Modal from '../../components/ui/Modal'
import { AssetCard, AssetEmpty, AssetGrid, AssetTypeFilter } from '../../components/assets/AssetLibrary'
import { useCharacterVoiceGenerationEnabled } from '../../hooks/usePublicCapabilities'
import { VOICE_GENERATION_DISABLED_MESSAGE } from '../../lib/publicCapabilities'
import { tv } from '../../i18n/tv'

const AUDIO_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,.mp3,.wav,.m4a'

/** 是否可作为角色音色资产 */
function isVoiceLikeAsset(asset: DramaAsset): boolean {
  const t = (asset.type || '').toLowerCase()
  return t === 'voice' || t === 'audio'
}

export type VoiceBinding = {
  sourceAssetId: number
  url: string
  label: string
  voicePrompt?: string
}

type Props = {
  asset: DramaAsset
  projectId: number
  open: boolean
  onClose: () => void
  onBound: (asset: DramaAsset) => void
  onError: (message: string) => void
}

// 读取 voice 资产已保存的 speaker
function readVoiceSpeaker(asset: DramaAsset): string {
  const params = (asset.params || {}) as Record<string, unknown>
  return typeof params.speaker === 'string' ? params.speaker.trim() : ''
}

// 读取 voice 资产的音色描述
export function readVoicePrompt(asset: DramaAsset): string {
  const params = (asset.params || {}) as Record<string, unknown>
  return typeof params.voicePrompt === 'string' ? params.voicePrompt.trim() : ''
}

// 从角色资产 params 读取已绑定音色
export function readAssetVoiceBinding(asset: Pick<DramaAsset, 'params'>): VoiceBinding | null {
  const params = (asset.params || {}) as Record<string, unknown>
  const raw = params.voiceAudio
  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const sourceAssetId =
      typeof data.sourceAssetId === 'number'
        ? data.sourceAssetId
        : typeof data.voiceId === 'string'
          ? Number.NaN
          : null
    const url =
      typeof data.url === 'string'
        ? data.url
        : typeof data.previewUrl === 'string'
          ? data.previewUrl
          : ''
    if (typeof sourceAssetId === 'number' && sourceAssetId > 0 && url) {
      return {
        sourceAssetId,
        url,
        label: typeof data.label === 'string' ? data.label : tv('音色', 'Giọng nói'),
        voicePrompt: typeof data.voicePrompt === 'string' ? data.voicePrompt : undefined,
      }
    }
  }
  const canvas = params.canvas
  if (canvas && typeof canvas === 'object') {
    const voiceAudio = (canvas as Record<string, unknown>).voiceAudio
    if (voiceAudio && typeof voiceAudio === 'object') {
      const data = voiceAudio as Record<string, unknown>
      const sourceAssetId = typeof data.sourceAssetId === 'number' ? data.sourceAssetId : null
      const url = typeof data.url === 'string' ? data.url : ''
      if (sourceAssetId && url) {
        return { sourceAssetId, url, label: tv('音色', 'Giọng nói') }
      }
    }
  }
  return null
}

// 构建绑定后的 params（同时写 voiceAudio 与 canvas.voiceAudio）
export function buildBoundParams(asset: DramaAsset, voice: DramaAsset): Record<string, unknown> {
  const url = voice.url || ''
  const binding: VoiceBinding = {
    sourceAssetId: voice.id,
    url,
    label: voice.name || tv('音色', 'Giọng nói'),
    voicePrompt: readVoicePrompt(voice) || undefined,
  }
  const prev = (asset.params || {}) as Record<string, unknown>
  const prevCanvas =
    prev.canvas && typeof prev.canvas === 'object'
      ? (prev.canvas as Record<string, unknown>)
      : {}
  return {
    ...prev,
    voiceAudio: binding,
    canvas: {
      ...prevCanvas,
      voiceAudio: { sourceAssetId: voice.id, url },
    },
  }
}

// 渲染角色音色绑定弹窗
export function CharacterVoiceBindModal({
  asset,
  projectId,
  open,
  onClose,
  onBound,
  onError,
}: Props) {
  const voiceGenerationEnabled = useCharacterVoiceGenerationEnabled()
  /*
   * voiceAssets 项目内 voice/audio 资产
   * selectedId 选中音色
   * newPrompt / newName 新建合成表单
   * busy / synthBusy / promptBusy / uploadBusy 各操作中
   * mode pick | upload | create
   */
  const [voiceAssets, setVoiceAssets] = useState<DramaAsset[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newPrompt, setNewPrompt] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [synthBusy, setSynthBusy] = useState(false)
  const [promptBusy, setPromptBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [suggestedSpeaker, setSuggestedSpeaker] = useState('')
  const [mode, setMode] = useState<'pick' | 'upload' | 'create'>('pick')
  const promptRequestedRef = useRef(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const bound = useMemo(() => readAssetVoiceBinding(asset), [asset])
  const selectedVoice = voiceAssets.find((v) => v.id === selectedId) || null
  const previewUrl = selectedVoice?.url ? resolveDramaMediaUrl(selectedVoice.url) : ''

  // 根据角色设定 AI 生成音色描述
  const fetchVoicePrompt = useCallback(
    async (force = false) => {
      if (!voiceGenerationEnabled) return
      if (promptBusy) return
      if (!force && newPrompt.trim()) return
      setPromptBusy(true)
      try {
        const result = await dramaApi.suggestVoicePrompt({
          project_id: projectId,
          asset_id: asset.id,
        })
        setNewPrompt(result.voice_prompt || '')
        setSuggestedSpeaker(result.speaker || '')
      } catch (err) {
        onError(err instanceof Error ? err.message : tv('AI 生成音色描述失败', 'AI tạo mô tả giọng nói thất bại'))
      } finally {
        setPromptBusy(false)
      }
    },
    [asset.id, newPrompt, onError, projectId, promptBusy, voiceGenerationEnabled],
  )

  useEffect(() => {
    if (!open) {
      promptRequestedRef.current = false
      return
    }
    setSelectedId(bound?.sourceAssetId ?? null)
    setNewPrompt('')
    setSuggestedSpeaker('')
    setNewName(tv(`${asset.name || '角色'}音色`, `Giọng ${asset.name || '角色'}`))
    setMode('pick')
    promptRequestedRef.current = false

    dramaApi
      .listAssets(projectId)
      .then((list) => {
        const voices = list.filter(isVoiceLikeAsset)
        setVoiceAssets(voices)
        if (!bound?.sourceAssetId && voices[0]) {
          setSelectedId(voices[0].id)
        }
        if (voices.length === 0) {
          setMode('upload')
        }
      })
      .catch((err) => onError(err instanceof Error ? err.message : tv('加载音色失败', 'Tải giọng nói thất bại')))
  }, [open, asset, projectId, bound?.sourceAssetId, onError])

  // 进入「AI 合成」时自动生成音色描述
  useEffect(() => {
    if (!open || !voiceGenerationEnabled || mode !== 'create' || promptRequestedRef.current) return
    promptRequestedRef.current = true
    void fetchVoicePrompt(true)
  }, [open, mode, fetchVoicePrompt, voiceGenerationEnabled])

  useEffect(() => {
    if (!voiceGenerationEnabled && mode === 'create') setMode('pick')
  }, [voiceGenerationEnabled, mode])

  if (!open) return null

  const anyBusy = busy || synthBusy || promptBusy || uploadBusy

  // 本地上传音频并记为音色资产
  async function handleUploadAudio(file: File) {
    if (uploadBusy) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a)$/i.test(file.name)) {
      onError(tv('请上传 mp3 / wav / m4a 音频文件', 'Vui lòng tải tệp âm thanh mp3 / wav / m4a'))
      return
    }
    setUploadBusy(true)
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '').trim()
      const created = await dramaApi.createAsset({
        project_id: projectId,
        type: 'voice',
        asset_type: 'audio',
        name: baseName || tv(`${asset.name || '角色'}音色`, `Giọng ${asset.name || '角色'}`),
        params: {
          source: 'upload',
          originalFilename: file.name,
        },
      })
      const uploaded = await dramaApi.uploadAssetMedia(created.id, file)
      if (!(uploaded.url || '').trim()) throw new Error(tv('上传成功但未得到可播放地址', 'Tải lên thành công nhưng chưa có địa chỉ phát được'))
      setVoiceAssets((prev) => [uploaded, ...prev.filter((v) => v.id !== uploaded.id)])
      setSelectedId(uploaded.id)
      setMode('pick')
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('上传失败', 'Tải lên thất bại'))
    } finally {
      setUploadBusy(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  // 按提示词新建并合成 voice 资产
  async function handleCreateAndSynth() {
    if (!voiceGenerationEnabled) { onError(VOICE_GENERATION_DISABLED_MESSAGE); return }
    const prompt = newPrompt.trim()
    if (!prompt || synthBusy) return
    setSynthBusy(true)
    try {
      const result = await dramaApi.generateVoice({
        project_id: projectId,
        name: newName.trim() || undefined,
        voice_prompt: prompt,
        speaker: suggestedSpeaker || undefined,
        character_asset_id: asset.id,
      })
      const created = result.asset
      if (!created) throw new Error(tv('合成失败', 'Tổng hợp thất bại'))
      setVoiceAssets((prev) => [...prev, created])
      setSelectedId(created.id)
      setMode('pick')
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('音色合成失败', 'Tổng hợp giọng nói thất bại'))
    } finally {
      setSynthBusy(false)
    }
  }

  // 对已有 voice 资产重新合成
  async function handleResynth(voice: DramaAsset) {
    if (!voiceGenerationEnabled) { onError(VOICE_GENERATION_DISABLED_MESSAGE); return }
    const prompt = readVoicePrompt(voice)
    if (!prompt || synthBusy) return
    setSynthBusy(true)
    try {
      const result = await dramaApi.generateVoice({
        project_id: projectId,
        asset_id: voice.id,
        voice_prompt: prompt,
        speaker: readVoiceSpeaker(voice) || suggestedSpeaker || undefined,
        character_asset_id: asset.id,
      })
      if (result.asset) {
        setVoiceAssets((prev) => prev.map((v) => (v.id === voice.id ? result.asset! : v)))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('重新合成失败', 'Tổng hợp lại thất bại'))
    } finally {
      setSynthBusy(false)
    }
  }

  // 确认绑定到角色
  async function handleConfirm() {
    if (!selectedVoice?.url || busy) {
      onError(tv('请先选择或上传一段可试听的音频', 'Vui lòng chọn hoặc tải lên một đoạn âm thanh nghe thử được trước'))
      return
    }
    setBusy(true)
    try {
      const updated = await dramaApi.updateAsset(asset.id, {
        params: buildBoundParams(asset, selectedVoice),
      })
      onBound(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('绑定失败', 'Gắn thất bại'))
    } finally {
      setBusy(false)
    }
  }

  // 解除绑定
  async function handleUnbind() {
    if (busy) return
    setBusy(true)
    try {
      const prev = (asset.params || {}) as Record<string, unknown>
      const nextParams = { ...prev }
      delete nextParams.voiceAudio
      if (nextParams.canvas && typeof nextParams.canvas === 'object') {
        const canvas = { ...(nextParams.canvas as Record<string, unknown>) }
        delete canvas.voiceAudio
        nextParams.canvas = canvas
      }
      const updated = await dramaApi.updateAsset(asset.id, { params: nextParams })
      onBound(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('解绑失败', 'Gỡ gắn thất bại'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tv("绑定音色", "Gắn giọng nói")}
      size="lg"
      dismissible={!anyBusy}
      className="drama-voice-bind-modal"
      footer={
        <>
          <button type="button" className="pf-btn" onClick={onClose} disabled={anyBusy}>
            {tv("取消", "Hủy")}
          </button>
          {bound ? (
            <button
              type="button"
              className="pf-btn"
              onClick={() => void handleUnbind()}
              disabled={anyBusy}
            >
              {tv("解除绑定", "Gỡ gắn")}
            </button>
          ) : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            onClick={() => void handleConfirm()}
            disabled={!selectedVoice?.url || anyBusy}
          >
            {busy ? tv('绑定中…', 'Đang gắn…') : tv('确认绑定', 'Xác nhận gắn')}
          </button>
        </>
      }
    >
      <p className="drama-muted">
        {tv("给「", "Gắn cho “")}{asset.name || tv('角色', 'Nhân vật')}{tv("」配上说话声音。选择已有音色或上传录音", "” giọng nói để nói. Chọn giọng có sẵn hoặc tải bản ghi âm lên")}{voiceGenerationEnabled ? tv('，也可用 AI 合成', ', cũng có thể dùng AI tổng hợp') : ''}{tv("。 之后生成带对白的镜头时，会尽量按这段声音来念。", ". Sau đó khi tạo cảnh có thoại, hệ thống sẽ cố gắng đọc theo giọng này.")}
      </p>
      <p className="drama-muted" style={{ marginTop: -6, fontSize: 12 }}>
        {tv("画布里也可以把「音频」节点连到角色，效果一样。", "Trên canvas cũng có thể nối nút “Âm thanh” vào nhân vật, hiệu quả như nhau.")}
      </p>

      <div className="pf-library-toolbar">
        <AssetTypeFilter
          options={[{ value: 'pick', label: tv('选择已有', 'Chọn có sẵn') }, { value: 'upload', label: tv('上传音频', 'Tải âm thanh lên') }, ...(voiceGenerationEnabled ? [{ value: 'create' as const, label: tv('AI 合成', 'AI tổng hợp') }] : [])] as const}
          value={mode}
          disabled={anyBusy}
          ariaLabel={tv("音色来源", "Nguồn giọng nói")}
          onChange={(value) => { setMode(value); if (value === 'create' && !newPrompt.trim() && !promptBusy) promptRequestedRef.current = false }}
        />
      </div>

      {mode === 'pick' ? (
        <AssetGrid picker>
          {voiceAssets.length === 0 ? (
            <AssetEmpty>{tv("还没有可用音色，请先「上传音频」", "Chưa có giọng nói dùng được, vui lòng “Tải âm thanh lên” trước")}{voiceGenerationEnabled ? tv('或「AI 合成」', 'hoặc “AI tổng hợp”') : ''}。</AssetEmpty>
          ) : (
            voiceAssets.map((voice) => {
              const hasAudio = Boolean(voice.url)
              const canResynth = Boolean(readVoicePrompt(voice))
              const statusLabel = !hasAudio
                ? tv('待生成', 'Chờ tạo')
                : canResynth
                  ? tv('已合成', 'Đã tổng hợp')
                  : tv('已上传', 'Đã tải lên')
              return (
                <AssetCard
                  key={voice.id}
                  asset={voice}
                  selected={selectedId === voice.id}
                  subtitle={statusLabel}
                  footer={tv("项目音色", "Giọng nói dự án")}
                  onOpen={() => setSelectedId(voice.id)}
                  actions={voiceGenerationEnabled && hasAudio && canResynth ? <>
                    <button
                      type="button"
                      className="pf-btn pf-btn-sm"
                      disabled={synthBusy}
                      onClick={(e) => {
                        e.preventDefault()
                        void handleResynth(voice)
                      }}
                    >
                      {tv("重合成", "Tổng hợp lại")}
                    </button>
                  </> : undefined}
                />
              )
            })
          )}
        </AssetGrid>
      ) : mode === 'upload' ? (
        <div className="drama-voice-create-form">
          <p className="drama-muted" style={{ margin: 0 }}>
            {tv("支持 mp3 / wav / m4a。建议 2 秒以上的清晰人声，效果更稳。", "Hỗ trợ mp3 / wav / m4a. Gợi ý giọng người rõ ràng từ 2 giây trở lên, hiệu quả ổn định hơn.")}
          </p>
          <input
            ref={uploadInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUploadAudio(file)
            }}
          />
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            disabled={uploadBusy}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploadBusy ? tv('上传中…', 'Đang tải lên…') : tv('选择音频文件', 'Chọn tệp âm thanh')}
          </button>
        </div>
      ) : voiceGenerationEnabled ? (
        <div className="drama-voice-create-form">
          <label className="drama-field">
            <span>{tv("音色名称", "Tên giọng nói")}</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tv("例如：沉稳男声、俏皮少女", "Ví dụ: giọng nam trầm ổn, giọng thiếu nữ tinh nghịch")}
            />
          </label>
          <label className="drama-field">
            <span className="drama-voice-prompt-label">
              {tv("声音什么样（随便写）", "Giọng nói như thế nào (viết tùy ý)")}
              <button
                type="button"
                className="pf-btn pf-btn-sm"
                disabled={promptBusy || synthBusy}
                onClick={() => void fetchVoicePrompt(true)}
              >
                {promptBusy ? tv('生成中…', 'Đang tạo…') : tv('按角色设定帮我写', 'Viết giúp tôi theo thiết lập nhân vật')}
              </button>
            </span>
            <textarea
              rows={4}
              value={
                promptBusy && !newPrompt
                  ? tv('正在根据角色设定写一段声音描述…', 'Đang viết mô tả giọng nói theo thiết lập nhân vật…')
                  : newPrompt
              }
              readOnly={promptBusy && !newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder={tv("例如：三十岁左右男性，声音沉稳偏磁性，语速不急…", "Ví dụ: nam khoảng ba mươi tuổi, giọng trầm ổn hơi từ tính, tốc độ không vội…")}
            />
          </label>
          {suggestedSpeaker ? (
            <p className="drama-muted" style={{ margin: 0, fontSize: 12 }}>
              {tv("已匹配声线：", "Đã khớp giọng:")}{suggestedSpeaker}
            </p>
          ) : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            disabled={!newPrompt.trim() || synthBusy || promptBusy}
            onClick={() => void handleCreateAndSynth()}
          >
            {synthBusy ? tv('合成中…', 'Đang tổng hợp…') : tv('合成试听', 'Tổng hợp nghe thử')}
          </button>
        </div>
      ) : null}

      {previewUrl ? (
        <audio className="drama-voice-audio" controls src={previewUrl} />
      ) : null}
    </Modal>
  )
}
