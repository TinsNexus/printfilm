import { points } from '../lib/points'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, AudioLines, Check, Clock3, Download, Eye, ImagePlus, Layers, Loader2, Mic, Plus, RectangleHorizontal, RectangleVertical, Sparkles, Square, X } from 'lucide-react'
import { getGenerationConfig, listToolRuns, resolveToolMediaUrl, runStudioTool, type ToolRunRecord } from '../api/tools'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import GenerationLayout from '../components/tools/GenerationLayout'
import GenerationSelect from '../components/tools/GenerationSelect'
import GenerationReferences from '../components/tools/GenerationReferences'
import PromptMentionPopover from '../components/tools/PromptMentionPopover'
import { AssetDetailDialog } from '../components/assets/AssetDetailDialog'
import { useToolRunDetail } from '../hooks/useToolRunDetail'
import { mediaIcons, type MediaKind, useGenerationText } from '../lib/generationMedia'
import { formatGenerationErrorMessage } from '../lib/generationError'
import { fetchMediaBlob, triggerBlobDownload } from '../lib/clientDownload'
import { useMediaModelsCatalog } from '../hooks/useMediaModelsCatalog'
import { MediaCostNotice } from '../components/billing/MediaCostNotice'
import { useGenerationEstimate } from '../hooks/useGenerationEstimate'
import { generationReferenceLimits, serializeGenerationReferences, validateGenerationReferences, type GenerationReference, type VideoGenerationMode } from '../lib/generationReferences'
import { detectPromptMentionTrigger, measureTextareaCaretRect, type MentionCaretRect } from '../lib/promptMention'
import { tr } from '../i18n/translate.ts'

/** 图片、视频、音频使用明确的独立生成入口。 */
export default function GenerationPage({ kind }: { kind: MediaKind }) {
  if (!localStorage.getItem('token')) return <Navigate to={`/auth?next=${encodeURIComponent(`/tools/${kind}`)}`} replace />
  return <GenerationWorkspace kind={kind} key={kind} />
}

function GenerationWorkspace({ kind }: { kind: MediaKind }) {
  const text = useGenerationText()
  const Icon = mediaIcons[kind]
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState(kind === 'image' ? '1:1' : '9:16')
  const [duration, setDuration] = useState('5s')
  const [voice, setVoice] = useState('narrator_calm')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  // 每种视频模式保留各自素材，切换模式不会把首帧误当普通参考或丢失选择。
  const [videoMode, setVideoMode] = useState<VideoGenerationMode>('text_to_video')
  const [videoReferences, setVideoReferences] = useState<Record<VideoGenerationMode, GenerationReference[]>>({ text_to_video: [], first_last_frame: [], omni_reference: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // @ 引用：触发位置与光标锚点、键盘高亮项（候选来自已加入的参考资料）
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; query: string; rect: MentionCaretRect } | null>(null)
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [recent, setRecent] = useState<ToolRunRecord[]>([])
  const [recentTotal, setRecentTotal] = useState(0)
  // 详情仅编排数据与任务状态，界面复用全局资产组件。
  const { detail, asset: detailAsset, error: detailError, resultIndex, selectResult, openDetail, closeDetail } = useToolRunDetail()
  const [historyError, setHistoryError] = useState('')
  const [model, setModel] = useState('')
  const [resolution, setResolution] = useState(kind === 'image' ? '2K' : '480p')
  const catalog = useMediaModelsCatalog()
  const models = useMemo(() => (kind === 'image' ? catalog?.image_models : catalog?.video_models) ?? [], [catalog, kind])
  const selectedModel = models.find(item => item.id === model)
  const referenceImageLimit = selectedModel?.reference_limits?.images ?? 9
  // memo 化：引用稳定，避免作为 effect 依赖时每次渲染都重跑
  const referenceLimits = useMemo(() => generationReferenceLimits(selectedModel?.reference_limits), [selectedModel])
  const currentReferences = videoReferences[videoMode]
  const serializedReferences = useMemo(() => serializeGenerationReferences(currentReferences), [currentReferences])
  const referenceError = kind === 'video' ? validateGenerationReferences(videoMode, currentReferences, referenceLimits) : null
  // @ 提及候选：当前模式已加入的参考资料，按 @ 后的词本地过滤，不请求资产库
  const mentionItems = useMemo(() => {
    if (!mention) return []
    const needle = mention.query.trim().toLowerCase()
    return currentReferences.filter(item => !needle || item.name.toLowerCase().includes(needle))
  }, [mention, currentReferences])
  const allowedResolutions = selectedModel?.available_resolutions ?? selectedModel?.allowed_resolutions ?? []
  const invalidParameters = kind !== 'audio' && (!catalog || !selectedModel || selectedModel.available === false || !allowedResolutions.includes(resolution) || !selectedModel.allowed_aspect_ratios?.includes(ratio) || (kind === 'video' && (Number(duration.replace('s', '')) < (selectedModel.duration_min ?? 4) || Number(duration.replace('s', '')) > (selectedModel.duration_max ?? 30))))
  const { quote, error: estimateError, loading: estimating, retry: retryEstimate } = useGenerationEstimate(kind === 'video' && !invalidParameters && !referenceError ? {
    tool_id: 't2v', model_id: model, video_mode: videoMode, resolution, ratio, duration, references: serializedReferences.references,
  } : null)
  const [revision, setRevision] = useState(0)
  const [downloading, setDownloading] = useState<number | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const maxLength = kind === 'audio' ? 2000 : 7000
  useEffect(() => {
    let disposed = false
    getGenerationConfig().then(data => { if (!disposed && kind === 'audio') setModel(data.models[kind] || '') }).catch(() => {})
    return () => { disposed = true }
  }, [kind])
  useEffect(() => {
    if (catalog && kind !== 'audio' && !models.some(item => item.id === model && item.available !== false)) {
      const defaultId = kind === 'image' ? catalog.defaults.image_model : catalog.defaults.video_model
      setModel(models.find(item => item.id === defaultId && item.available !== false)?.id || models.find(item => item.available !== false)?.id || '')
    }
  }, [catalog, model, kind, models])
  useEffect(() => {
    if (!selectedModel || kind === 'audio') return
    const resolutions = selectedModel.available_resolutions ?? selectedModel.allowed_resolutions ?? []
    const ratios = selectedModel.allowed_aspect_ratios ?? []
    if (resolutions.length && !resolutions.includes(resolution)) setResolution(resolutions.includes(selectedModel.defaults?.resolution || '') ? selectedModel.defaults!.resolution : resolutions[0])
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios.includes(selectedModel.defaults?.aspect_ratio || '') ? selectedModel.defaults!.aspect_ratio : ratios[0])
    if (kind === 'video') {
      const seconds = Number(duration.replace('s', ''))
      const next = Math.min(selectedModel.duration_max ?? 30, Math.max(selectedModel.duration_min ?? 4, seconds))
      if (next !== seconds) setDuration(`${next}s`)
    }
  }, [selectedModel, kind, resolution, ratio, duration])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const data = await listToolRuns(1, 6, { kind })
        if (disposed) return
        setRecent(data.items); setRecentTotal(data.total); setHistoryError('')
      } catch (err) { if (!disposed) setHistoryError(err instanceof Error ? err.message : tr('generationPage.failedLoad')) }
      finally { if (!disposed) timer = setTimeout(refresh, 5000) }
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [kind, revision, text])
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [files])

  function pickFiles(incoming: File[]) {
    const limit = referenceImageLimit
    if (incoming.some(file => file.size > 40 * 1024 * 1024)) { setError(tr('generationPage.eachFileMust40Mb')); return }
    if (files.length + incoming.length > limit) { setError(tr('generationPage.chooseUpReferenceFiles', { limit })); return }
    setFiles(previous => [...previous, ...incoming]); setError('')
  }

  // 输入或光标移动后同步 @ 触发态；仅支持参考资料的视频模式启用
  function syncMention() {
    const textarea = promptRef.current
    if (kind !== 'video' || videoMode === 'text_to_video' || !textarea) { setMention(null); return }
    const trigger = detectPromptMentionTrigger(textarea.value, textarea.selectionStart)
    if (!trigger) { setMention(null); return }
    setMention({ ...trigger, rect: measureTextareaCaretRect(textarea, textarea.selectionStart) })
    setMentionActiveIndex(0)
  }

  // 插入 @ 提及词，指向参考资料面板中已绑定的该份资料
  function selectMention(reference: GenerationReference) {
    const textarea = promptRef.current
    if (!textarea || !mention) return
    const caret = textarea.selectionStart
    const token = `@${reference.name} `
    setPrompt(`${prompt.slice(0, mention.start)}${token}${prompt.slice(caret)}`)
    setMention(null)
    setError('')
    const caretPos = mention.start + token.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caretPos, caretPos)
    })
  }

  // 提及弹层打开时接管方向键 / 回车 / Esc
  function onPromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention) return
    if (event.key === 'Escape') { event.preventDefault(); setMention(null); return }
    if (!mentionItems.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setMentionActiveIndex(index => Math.min(index + 1, mentionItems.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setMentionActiveIndex(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter') { event.preventDefault(); selectMention(mentionItems[Math.min(mentionActiveIndex, mentionItems.length - 1)]) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || !prompt.trim()) return
    if (invalidParameters) { setError(tr('generationPage.chooseValidModelSettingsFirst')); return }
    if (kind === 'video' && (referenceError || !quote || estimating || estimateError)) {
      setError(referenceError || estimateError || tr('generationPage.waitCostEstimateFinish'))
      return
    }
    if (kind === 'image' && files.length > referenceImageLimit) {
      setError(tr('generationPage.selectedModelSupportsUpReference', { referenceImageLimit }))
      return
    }
    setSubmitting(true); setError(''); setNotice('')
    try {
      const result = await runStudioTool({ toolId: kind === 'audio' ? 'audio' : kind === 'video' ? 't2v' : files.length ? 'i2i' : 't2i',
        prompt, files: kind === 'video' ? serializedReferences.files : files, ratio, duration, voice, modelId: model, resolution,
        ...(kind === 'video' ? { videoMode, references: serializedReferences.references, priceVersion: quote?.price_version ?? 0 } : {}) })
      setNotice(tr('generationPage.taskSubmittedKeepsGeneratingEven', { task_id: result.task_id }))
      setRevision(value => value + 1)
    } catch (err) { setError(err instanceof Error ? err.message : tr('generationPage.submissionFailed')) }
    finally { setSubmitting(false) }
  }
  async function download(item: ToolRunRecord) {
    setDownloading(item.id); setError('')
    try {
      const url = resolveToolMediaUrl(item.urls[0])
      triggerBlobDownload(await fetchMediaBlob(url), `printfilm_${kind}_${item.id}.${kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png'}`)
    } catch (err) { setError(err instanceof Error ? err.message : tr('generationPage.downloadFailed')) }
    finally { setDownloading(null) }
  }
  const titles = {
    video: [tr('generationPage.oneSentence'), tr('generationPage.nextScene')],
    image: [tr('generationPage.oneSentence'), tr('generationPage.drawWhatImagine')],
    audio: [tr('generationPage.fewWords'), tr('generationPage.storySpeaks')],
  }
  const placeholder = kind === 'audio' ? tr('generationPage.enterTextReadAloud') : kind === 'image'
    ? tr('generationPage.describeImageWantHowChange')
    : tr('generationPage.describeVideoSubjectActionSetting')

  return <GenerationLayout kind={kind}>
    <header className={`gen-hero gen-hero-${kind}`}>
      <div className="gen-eyebrow"><Icon size={22} />{(kind === 'video' ? tr('generationPage.aiVideo') : kind === 'image' ? tr('generationPage.aiImage') : tr('generationPage.aiAudio'))}</div>
      <h1>{titles[kind][0]}<span>{titles[kind][1]}</span></h1>
      <p>{kind === 'audio' ? tr('generationPage.pickVoiceGiveWordsEmotion') : tr('generationPage.startIdeaLetInspirationFlow')}</p>
      <div className="gen-hero-art" aria-hidden>{kind === 'audio' ? <><AudioLines className="gen-wave" /><Mic /></> : <Icon />}</div>
    </header>
    <form className="gen-composer" onSubmit={submit}>
      {kind === 'image' && catalog?.billing_mode === 'fixed_media' && <div className="gen-price-summary">
        <MediaCostNotice modelId={model} resolution={resolution} />
      </div>}
      {catalog && invalidParameters && <p className="gen-inline-error" role="alert">{tr('generationPage.currentModelDoesNotSupport')}</p>}
      <div className="gen-composer-heading"><span><Sparkles size={15} />{(kind === 'audio' ? tr('generationPage.textRead') : tr('generationPage.description'))}</span><small>{tr('generationPage.turnImaginationIntoNextPiece')}</small></div>
      <div className="gen-input-area">
        {kind === 'video' && <GenerationReferences mode={videoMode} limits={referenceLimits} value={currentReferences}
          onChange={value => { setVideoReferences(previous => ({ ...previous, [videoMode]: value })); setError(''); setNotice('') }} onError={setError} disabled={submitting} />}
        {kind === 'image' && <div className={`gen-references ${files.length ? 'has-files' : ''}`}>
          <span className="gen-ref-count"><ImagePlus size={14} />{files.length}/{referenceImageLimit}</span>
          <div className="gen-ref-grid">
            {previews.map((url, index) => <div className="gen-ref-item" key={url}>
              <img src={url} alt={tr('generationPage.referenceImages')} />
              <button type="button" aria-label={tr('generationPage.removeReferenceFile')} onClick={() => setFiles(items => items.filter((_, i) => i !== index))}><X size={13} /></button>
            </div>)}
            {files.length < referenceImageLimit && <button type="button" className="gen-upload" onClick={() => upload.current?.click()}
              onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); pickFiles(Array.from(event.dataTransfer.files)) }}>
              <Plus size={24} /><span>{tr('generationPage.chooseReferenceImage')}</span>
            </button>}
          </div>
          <input type="file" hidden ref={upload} multiple accept="image/png,image/jpeg,image/webp" onChange={event => { pickFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
        </div>}
        <div className="gen-prompt-wrap">
          <textarea ref={promptRef} aria-label={tr('generationPage.output')} placeholder={placeholder} maxLength={maxLength} value={prompt}
            onChange={event => { setPrompt(event.target.value); setNotice(''); syncMention() }}
            onKeyDown={onPromptKeyDown} onKeyUp={syncMention} onClick={syncMention} onBlur={() => window.setTimeout(() => setMention(null), 120)} />
          <span className="gen-counter">{prompt.length.toLocaleString()} / {maxLength.toLocaleString()}{kind === 'audio' ? tr('generationPage.aboutS', { ceil: Math.ceil(prompt.length / 4) }) : ''}</span>
        </div>
      </div>
      <div className="gen-toolbar">
        {kind === 'video' && <GenerationSelect label={tr('generationPage.generationMode')} icon={<Sparkles size={18} />} value={videoMode} disabled={submitting}
          onChange={value => { setVideoMode(value as VideoGenerationMode); setError(''); setNotice(''); setMention(null) }} options={[
            { value: 'text_to_video', label: tr('generationPage.textVideo'), description: tr('generationPage.writeOneSentenceModelCreates') },
            { value: 'first_last_frame', label: tr('generationPage.firstLastFrame'), description: tr('generationPage.setFirstFrameOptionallyLast') },
            { value: 'omni_reference', label: tr('generationPage.multiReference'), description: tr('generationPage.imagesVideosAudioUp12', { images: referenceLimits.images, videos: referenceLimits.videos, audios: referenceLimits.audios }) },
          ]} />}
        {kind === 'audio' ? <span className="gen-control gen-model">{model || tr('generationPage.siteDefaultModel')}</span> : <GenerationSelect label={tr('generationPage.model')} icon={<Icon size={19} />} value={model} onChange={setModel} options={models.filter(item => item.available !== false).map(item => ({ value: item.id, label: item.label, description: item.pricing_hint }))} />}
        {kind === 'audio' ? <GenerationSelect label={tr('generationPage.voice')} icon={<Mic size={18} />} value={voice} onChange={setVoice} options={[
          { value: 'narrator_calm', label: tr('generationPage.calmNarrator'), description: tr('generationPage.steadyNaturalGreatStoryNarration') },
          { value: 'warm_storyteller', label: tr('generationPage.warmStoryteller'), description: tr('generationPage.softFriendlyGreatHeartwarmingStories') },
          { value: 'teacher_clear', label: tr('generationPage.clearMaleVoice'), description: tr('generationPage.clearBriskGreatExplainers') },
        ]} /> : <>
          <GenerationSelect label={tr('generationPage.resolution')} value={resolution} onChange={setResolution} options={allowedResolutions.map(value => ({ value, label: value, description: selectedModel?.prices?.[value] ? `¥${selectedModel.prices[value]}/${kind === 'video' ? tr('generationPage.s') : tr('generationPage.images')}` : '' }))} />
          <GenerationSelect label={tr('generationPage.aspectRatio')} value={ratio} onChange={setRatio} options={(selectedModel?.allowed_aspect_ratios ?? []).map(value => ({ value, label: value, icon: value === '1:1' ? <Square size={19} /> : value === '9:16' || value === '3:4' ? <RectangleVertical size={19} /> : <RectangleHorizontal size={21} /> }))} />
          {kind === 'video' && <GenerationSelect label={tr('generationPage.videoDuration')} icon={<Clock3 size={18} />} value={duration} onChange={setDuration} options={Array.from({ length: (selectedModel?.duration_max ?? 30) - (selectedModel?.duration_min ?? 4) + 1 }, (_, index) => (selectedModel?.duration_min ?? 4) + index).map(value => ({ value: `${value}s`, label: tr('generationPage.s2', { value }), description: tr('generationPage.oneClipPerGeneration', { resolution }) }))} />}
          <span className="gen-control gen-output-count"><Layers size={17} /><span><small>{tr('generationPage.count')}</small><strong>× 1</strong></span></span>
        </>}
        {kind === 'video' && <PromptMentionPopover open={Boolean(mention)} items={mentionItems} anchorRect={mention?.rect ?? null}
          activeIndex={mentionActiveIndex} onActiveIndexChange={setMentionActiveIndex} onSelect={selectMention} onClose={() => setMention(null)} />}
        <div className="gen-submit-group">
          {kind === 'video' ? <div className="gen-estimate" aria-live="polite">
            {estimateError ? <><strong>{tr('generationPage.estimateUnavailable')}</strong><button type="button" onClick={retryEstimate}>{tr('generationPage.retryEstimate')}</button></> : quote ? <>
              <span>{tr('generationPage.estimatedCost')} <strong>{quote.billing_enabled ? points(quote.estimate_fen) : tr('generationPage.noCharge')}</strong></span>
              <small>{quote.billing_enabled ? quote.billing_mode === 'fixed_media' ? tr('generationPage.fixedMediaQuote', { seconds: duration.replace('s', '') }) : tr('generationPage.estimatedQuote') : tr('generationPage.billingDisabled')}</small>
            </> : <span>{estimating ? tr('generationPage.estimatingCost') : referenceError || tr('generationPage.chooseModelForEstimate')}</span>}
          </div> : <span>{tr('generationPage.creationsSavedAutomatically')}</span>}
          <button className="gen-primary" disabled={submitting || !prompt.trim() || invalidParameters || (kind === 'video' && Boolean(referenceError || !quote || estimating || estimateError))} type="submit">{submitting ? <Loader2 className="gen-spin" size={18} /> : <Icon size={18} />}{submitting ? tr('generationPage.submitting') : kind === 'audio' ? tr('generationPage.generateSpeech') : tr('generationPage.create')}</button>
        </div>
      </div>
    </form>
    {referenceError && <p className="gen-inline-error" role="alert">{referenceError}</p>}
    {estimateError && <p className="gen-inline-error" role="alert">{estimateError}</p>}
    {error && <BillingErrorNotice message={error} />}
    {notice && <div className="gen-notice" role="status"><Check size={18} />{notice}<Link to={`/tasks?kind=${kind}`}>{tr('generationPage.viewTasks')}<ArrowRight size={15} /></Link></div>}
    <section className="gen-recent">
      <header><h2>{tr('generationPage.recentGenerations')}</h2><Link to={`/tasks?kind=${kind}`}>{tr('generationPage.viewAll', { recentTotal })}<ArrowRight size={17} /></Link></header>
      {historyError && <p className="gen-inline-error" role="alert">{historyError}</p>}
      {!recent.length && !historyError ? <div className="gen-empty"><Icon size={34} /><strong>{tr('generationPage.ideasStartHere')}</strong><p>{tr('generationPage.submitFirstGenerationResultsAppear')}</p></div> : <div className="gen-gallery">
        {recent.map(item => <article key={item.id} className="gen-gallery-item">
          <button type="button" className="gen-gallery-preview" onClick={() => openDetail(item)} aria-label={tr('generationPage.viewGenerationDetails', { prompt: item.prompt || '未命名创作' })}>
            {kind === 'image' && (item.preview_url || item.urls[0]) ? <img src={resolveToolMediaUrl(item.preview_url || item.urls[0])} alt={item.prompt} /> : kind === 'video' && item.urls[0] ? <video src={resolveToolMediaUrl(item.urls[0])} poster={resolveToolMediaUrl(item.preview_url)} muted preload="metadata" /> : kind === 'video' && item.preview_url ? <img src={resolveToolMediaUrl(item.preview_url)} alt={item.prompt} /> : <Icon size={38} />}
            <span className={`gen-result-status is-${item.status}`}>{(item.status === 'succeeded' ? tr('generationPage.done') : item.status === 'failed' ? tr('generationPage.failed') : item.status === 'cancelled' ? tr('generationPage.cancelled') : tr('generationPage.processing'))}</span>
            <span className="gen-cover-overlay" aria-hidden><Eye size={20} /><span>{tr('generationPage.viewDetails')}</span></span>
          </button>
          {kind === 'audio' && item.urls[0] && <audio controls src={resolveToolMediaUrl(item.urls[0])} preload="metadata" />}
          <div className="gen-gallery-caption"><button type="button" className="gen-gallery-title" title={item.prompt} onClick={() => openDetail(item)}>{item.prompt || tr('generationPage.untitledCreation')}</button>{item.status === 'succeeded' && item.urls[0] && <button type="button" className="gen-icon-button" disabled={downloading === item.id} onClick={() => void download(item)} aria-label={tr('generationPage.download')}><Download size={16} /></button>}</div>
        </article>)}
      </div>}
    </section>
    {detail && detailAsset && <AssetDetailDialog asset={detailAsset} onClose={closeDetail}
      notice={<section className="pf-asset-detail-prompt"><div className="pf-asset-detail-text">
        <p role="status">{(detail.status === 'succeeded' ? tr('generationPage.done') : detail.status === 'failed' ? tr('generationPage.generationFailed') : detail.status === 'cancelled' ? tr('generationPage.cancelled') : tr('generationPage.generatingResultsUpdateAutomatically'))}</p>
        {(detail.error || detailError) && <p role="alert">{formatGenerationErrorMessage(detail.error || detailError)}</p>}
      </div></section>}
      actions={detail.urls.length > 1 && <div className="pf-asset-detail-utilities" role="group" aria-label={tr('generationPage.results')}>
        {detail.urls.map((url, index) => <button type="button" key={url} className="pf-btn pf-btn-sm" aria-pressed={resultIndex === index} onClick={() => selectResult(index)}>{tr('generationPage.result', { n: index + 1 })}</button>)}
      </div>}>
    </AssetDetailDialog>}
  </GenerationLayout>
}
