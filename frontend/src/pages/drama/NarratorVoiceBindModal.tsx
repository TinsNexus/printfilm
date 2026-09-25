/**
 * 旁白音色绑定：从漫剧 voice 资产选择，写入 project.params.narrationVoiceAudio
 * 供 Seedance 生成时作为全局 reference_audio 注入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaAsset, type DramaProject } from '../../api/drama'
import Modal from '../../components/ui/Modal'
import type { VoiceBinding } from './CharacterVoiceBindModal'
import { tRich, useI18n } from '../../i18n'
import { tr } from '../../i18n/translate'

type Props = {
  project: DramaProject
  open: boolean
  onClose: () => void
  onUpdated: (project: DramaProject) => void
  onError: (message: string) => void
}

function readNarrationVoiceBinding(project: DramaProject): VoiceBinding | null {
  const params = project.params || {}
  const raw = (params as Record<string, unknown>).narrationVoiceAudio
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const sourceAssetId = typeof data.sourceAssetId === 'number' ? data.sourceAssetId : null
  const url = typeof data.url === 'string' ? data.url : ''
  const label = typeof data.label === 'string' ? data.label : tr('narratorBind.narrationVoice')
  if (!sourceAssetId || !url) return null
  return {
    sourceAssetId,
    url,
    label,
    voicePrompt: typeof data.voicePrompt === 'string' ? data.voicePrompt : undefined,
  }
}

export function NarratorVoiceBindModal({ project, open, onClose, onUpdated, onError }: Props) {
  const { t: tx } = useI18n()
  const [voiceAssets, setVoiceAssets] = useState<DramaAsset[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const current = useMemo(() => readNarrationVoiceBinding(project), [project])

  const selectedVoice = useMemo(
    () => voiceAssets.find((v) => v.id === selectedId) || null,
    [voiceAssets, selectedId],
  )
  const previewUrl = selectedVoice?.url ? resolveDramaMediaUrl(selectedVoice.url) : ''

  const boundRef = useRef(false)
  useEffect(() => {
    if (!open) {
      boundRef.current = false
      return
    }
    if (boundRef.current) return
    boundRef.current = true

    setSelectedId(current?.sourceAssetId ?? null)
    dramaApi
      .listAssets(project.id)
      .then((list) => {
        const voices = list.filter((a) => (a.type || '').toLowerCase() === 'voice')
        setVoiceAssets(voices)
      })
      .catch((err) => onError(err instanceof Error ? err.message : tr('narratorBind.couldLoadVoiceAssets')))
  }, [current?.sourceAssetId, onError, open, project.id])

  const handleConfirm = useCallback(async () => {
    if (!selectedVoice?.url || busy) {
      onError(tr('narratorBind.chooseNarrationVoiceAlready'))
      return
    }
    setBusy(true)
    try {
      const binding: VoiceBinding = {
        sourceAssetId: selectedVoice.id,
        url: selectedVoice.url,
        label: selectedVoice.name || '旁白音色', // 写入项目 params 的兜底名，固定中文，不随界面语言变化
        // Narrator 端当前不依赖 voicePrompt；但保留字段给后续扩展
        voicePrompt:
          selectedVoice.params && typeof selectedVoice.params === 'object' && typeof (selectedVoice.params as any).voicePrompt === 'string'
            ? (selectedVoice.params as any).voicePrompt
            : undefined,
      }
      const nextParams = {
        ...(project.params || {}),
        narrationVoiceAudio: binding,
      }
      const updated = await dramaApi.updateProject(project.id, { params: nextParams })
      onUpdated(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : tr('narratorBind.bindingFailed'))
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, onError, onUpdated, project.id, project.params, selectedVoice])

  const handleUnbind = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const nextParams = { ...(project.params || {}) }
      delete (nextParams as Record<string, unknown>).narrationVoiceAudio
      const updated = await dramaApi.updateProject(project.id, { params: nextParams })
      onUpdated(updated)
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : tr('narratorBind.unbindingFailed'))
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, onError, onUpdated, project.id, project.params])

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tx('narratorBind.bindNarrationVoice')}
      size="lg"
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="pf-btn" onClick={onClose} disabled={busy}>
            {tx('narratorBind.cancel')}
          </button>
          {current ? (
            <button type="button" className="pf-btn" onClick={() => void handleUnbind()} disabled={busy}>
              {tx('narratorBind.unbind')}
            </button>
          ) : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime"
            onClick={() => void handleConfirm()}
            disabled={!selectedVoice?.url || busy}
          >
            {busy ? tx('narratorBind.binding') : tx('narratorBind.confirmBinding')}
          </button>
        </>
      }
    >
      <p className="drama-muted">
        {tRich(tx('narratorBind.note'), { ref: <strong>reference_audio</strong> })}
      </p>

      <div className="drama-voice-mode-tabs" style={{ marginTop: 12 }}>
        <button type="button" className="active">
          {tx('narratorBind.chooseExisting')}
        </button>
      </div>

      <div className="drama-voice-list" style={{ marginTop: 10 }}>
        {voiceAssets.length === 0 ? (
          <p className="drama-muted">{tx('narratorBind.voiceAssetsYetSynthesize')}</p>
        ) : (
          voiceAssets.map((voice) => {
            const hasAudio = Boolean(voice.url)
            const selected = selectedId === voice.id
            return (
              <label key={voice.id} className="drama-voice-option" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="drama-narrator-voice"
                  checked={selected}
                  onChange={() => setSelectedId(voice.id)}
                />
                <span>
                  {voice.name || tx('narratorBind.voice', { voiceId: voice.id })} <small>{hasAudio ? tx('narratorBind.synthesized') : tx('narratorBind.synthesized2')}</small>
                </span>
              </label>
            )
          })
        )}
      </div>

      {previewUrl ? (
        <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <AudioLines size={16} />
          <audio className="drama-voice-audio" controls src={previewUrl} />
        </div>
      ) : null}
    </Modal>
  )
}

