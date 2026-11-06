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
import { tv } from '../i18n/tv'

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
      } catch (err) { if (!disposed) setHistoryError(err instanceof Error ? err.message : text(tv('加载失败', 'Tải thất bại'), 'Loading failed')) }
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
    if (incoming.some(file => file.size > 40 * 1024 * 1024)) { setError(text(tv('单个文件不能超过 40MB', 'Mỗi tệp không được vượt quá 40MB'), 'Each file must be under 40 MB')); return }
    if (files.length + incoming.length > limit) { setError(text(tv(`最多选择 ${limit} 个参考文件`, `Chọn tối đa ${limit} tệp tham chiếu`), `Choose up to ${limit} reference files`)); return }
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
    if (invalidParameters) { setError(text(tv('请先选择有效的生成模型和参数', 'Vui lòng chọn model tạo và tham số hợp lệ trước'), 'Choose a valid model and settings first')); return }
    if (kind === 'video' && (referenceError || !quote || estimating || estimateError)) {
      setError(referenceError || estimateError || text(tv('请等待预计消耗计算完成', 'Vui lòng chờ tính xong chi phí dự kiến'), 'Wait for the cost estimate before generating'))
      return
    }
    if (kind === 'image' && files.length > referenceImageLimit) {
      setError(text(tv(`所选模型最多支持 ${referenceImageLimit} 个参考文件，请移除多余文件`, `Model đã chọn hỗ trợ tối đa ${referenceImageLimit} tệp tham chiếu, vui lòng bỏ bớt tệp thừa`), `The selected model supports up to ${referenceImageLimit} reference files. Remove the extra files.`))
      return
    }
    setSubmitting(true); setError(''); setNotice('')
    try {
      const result = await runStudioTool({ toolId: kind === 'audio' ? 'audio' : kind === 'video' ? 't2v' : files.length ? 'i2i' : 't2i',
        prompt, files: kind === 'video' ? serializedReferences.files : files, ratio, duration, voice, modelId: model, resolution,
        ...(kind === 'video' ? { videoMode, references: serializedReferences.references, priceVersion: quote?.price_version ?? 0 } : {}) })
      setNotice(text(tv(`任务 ${result.task_id} 已提交，离开页面后仍会继续生成。`, `Tác vụ ${result.task_id} đã được gửi, rời khỏi trang vẫn tiếp tục tạo.`), `Task ${result.task_id} queued. Generation continues after you leave.`))
      setRevision(value => value + 1)
    } catch (err) { setError(err instanceof Error ? err.message : text(tv('提交失败', 'Gửi thất bại'), 'Submission failed')) }
    finally { setSubmitting(false) }
  }
  async function download(item: ToolRunRecord) {
    setDownloading(item.id); setError('')
    try {
      const url = resolveToolMediaUrl(item.urls[0])
      triggerBlobDownload(await fetchMediaBlob(url), `printfilm_${kind}_${item.id}.${kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png'}`)
    } catch (err) { setError(err instanceof Error ? err.message : text(tv('下载失败', 'Tải xuống thất bại'), 'Download failed')) }
    finally { setDownloading(null) }
  }
  const titles = {
    video: [text(tv('一句话，', 'Một câu,'), 'One idea.'), text(tv('生成你的下一幕', 'tạo màn tiếp theo của bạn'), 'Your next scene.')],
    image: [text(tv('一句话，', 'Một câu,'), 'One idea.'), text(tv('画出你的想象', 'Vẽ ra trí tưởng tượng của bạn'), 'Bring it to life.')],
    audio: [text(tv('一段文字，', 'Một đoạn chữ,'), 'Your words.'), text(tv('让故事开口', 'để câu chuyện cất tiếng'), 'A voice to tell them.')],
  }
  const placeholder = kind === 'audio' ? text(tv('输入你想朗读的文字…', 'Nhập văn bản bạn muốn đọc…'), 'Enter the text you want to read…') : kind === 'image'
    ? text(tv('描述你想生成的图片，或说明如何修改参考图。试试：午后阳光穿过玻璃，桌上一枝白色郁金香，胶片质感。', 'Mô tả hình ảnh bạn muốn tạo, hoặc nói cách sửa ảnh tham chiếu. Thử xem: nắng chiều xuyên qua lớp kính, một cành tulip trắng trên bàn, chất phim.'), 'Describe an image or the changes to your references…')
    : text(tv('描述你想生成的视频：主体 + 动作 + 环境 + 运镜。输入 @ 可提及下方已加入的参考图、视频或音频。', 'Mô tả video bạn muốn tạo: chủ thể + hành động + môi trường + chuyển động máy. Gõ @ để nhắc đến ảnh, video hoặc âm thanh tham chiếu đã thêm bên dưới.'), 'Describe your video: subject, action, setting, camera movement. Type @ to mention a reference you added below.')

  return <GenerationLayout kind={kind}>
    <header className={`gen-hero gen-hero-${kind}`}>
      <div className="gen-eyebrow"><Icon size={22} />{text(kind === 'video' ? tv('AI 视频', 'Video AI') : kind === 'image' ? tv('AI 图片', 'Hình ảnh AI') : tv('AI 音频', 'Âm thanh AI'), `AI ${kind.toUpperCase()}`)}</div>
      <h1>{titles[kind][0]}<span>{titles[kind][1]}</span></h1>
      <p>{kind === 'audio' ? text(tv('选一款音色，为你的文字注入情绪与温度。', 'Chọn một giọng nói, thổi cảm xúc và hơi ấm vào chữ của bạn.'), 'Choose a voice and give your words warmth.') : text(tv('从一个想法开始，让灵感自然发生。', 'Bắt đầu từ một ý tưởng, để cảm hứng tự nhiên xảy ra.'), 'Start with an idea. Let inspiration happen.')}</p>
      <div className="gen-hero-art" aria-hidden>{kind === 'audio' ? <><AudioLines className="gen-wave" /><Mic /></> : <Icon />}</div>
    </header>
    <form className="gen-composer" onSubmit={submit}>
      {kind === 'image' && catalog?.billing_mode === 'fixed_media' && <div className="gen-price-summary">
        <MediaCostNotice modelId={model} resolution={resolution} />
      </div>}
      {catalog && invalidParameters && <p className="gen-inline-error" role="alert">{text(tv('当前模型不支持所选参数，请重新选择分辨率、画幅或时长。', 'Model hiện tại không hỗ trợ tham số đã chọn, vui lòng chọn lại độ phân giải, tỷ lệ khung hoặc thời lượng.'), 'These settings are not supported by the selected model. Please adjust them.')}</p>}
      <div className="gen-composer-heading"><span><Sparkles size={15} />{text(kind === 'audio' ? tv('朗读内容', 'Nội dung đọc') : tv('创作描述', 'Mô tả sáng tạo'), kind === 'audio' ? 'Your script' : 'Your creative brief')}</span><small>{text(tv('把想象，写成下一件作品', 'Viết trí tưởng tượng thành tác phẩm tiếp theo'), 'A little detail goes a long way')}</small></div>
      <div className="gen-input-area">
        {kind === 'video' && <GenerationReferences mode={videoMode} limits={referenceLimits} value={currentReferences}
          onChange={value => { setVideoReferences(previous => ({ ...previous, [videoMode]: value })); setError(''); setNotice('') }} onError={setError} disabled={submitting} />}
        {kind === 'image' && <div className={`gen-references ${files.length ? 'has-files' : ''}`}>
          <span className="gen-ref-count"><ImagePlus size={14} />{files.length}/{referenceImageLimit}</span>
          <div className="gen-ref-grid">
            {previews.map((url, index) => <div className="gen-ref-item" key={url}>
              <img src={url} alt={text(tv('参考图', 'Ảnh tham chiếu'), 'Reference')} />
              <button type="button" aria-label={text(tv('移除参考文件', 'Xóa tệp tham chiếu'), 'Remove reference')} onClick={() => setFiles(items => items.filter((_, i) => i !== index))}><X size={13} /></button>
            </div>)}
            {files.length < referenceImageLimit && <button type="button" className="gen-upload" onClick={() => upload.current?.click()}
              onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); pickFiles(Array.from(event.dataTransfer.files)) }}>
              <Plus size={24} /><span>{text(tv('选择参考图', 'Chọn ảnh tham chiếu'), 'Add reference')}</span>
            </button>}
          </div>
          <input type="file" hidden ref={upload} multiple accept="image/png,image/jpeg,image/webp" onChange={event => { pickFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
        </div>}
        <div className="gen-prompt-wrap">
          <textarea ref={promptRef} aria-label={text(tv('生成内容', 'Nội dung tạo'), 'Generation prompt')} placeholder={placeholder} maxLength={maxLength} value={prompt}
            onChange={event => { setPrompt(event.target.value); setNotice(''); syncMention() }}
            onKeyDown={onPromptKeyDown} onKeyUp={syncMention} onClick={syncMention} onBlur={() => window.setTimeout(() => setMention(null), 120)} />
          <span className="gen-counter">{prompt.length.toLocaleString()} / {maxLength.toLocaleString()}{kind === 'audio' ? text(tv(` · 约 ${Math.ceil(prompt.length / 4)} 秒`, ` · Khoảng ${Math.ceil(prompt.length / 4)} giây`), ` · ~${Math.ceil(prompt.length / 4)} sec`) : ''}</span>
        </div>
      </div>
      <div className="gen-toolbar">
        {kind === 'video' && <GenerationSelect label={text(tv('生成方式', 'Cách tạo'), 'Generation mode')} icon={<Sparkles size={18} />} value={videoMode} disabled={submitting}
          onChange={value => { setVideoMode(value as VideoGenerationMode); setError(''); setNotice(''); setMention(null) }} options={[
            { value: 'text_to_video', label: text(tv('文生视频', 'Văn bản thành video'), 'Text to video'), description: text(tv('只写一句话，画面由模型生成', 'Chỉ cần viết một câu, hình ảnh do model tạo'), 'Describe your idea without reference media') },
            { value: 'first_last_frame', label: text(tv('首尾帧', 'Khung đầu cuối'), 'First / last frame'), description: text(tv('指定首帧，可选尾帧，补全中间运动', 'Chỉ định khung đầu, tùy chọn khung cuối, bổ sung chuyển động ở giữa'), 'Choose the first frame and an optional final frame') },
            { value: 'omni_reference', label: text(tv('全能参考', 'Tham chiếu đa năng'), 'Omni reference'), description: text(tv(`图片 ${referenceLimits.images} 张 / 视频 ${referenceLimits.videos} 段 / 音频 ${referenceLimits.audios} 段 · 最多 12 份`, `Ảnh ${referenceLimits.images} / Video ${referenceLimits.videos} / Âm thanh ${referenceLimits.audios} · Tối đa 12 tài liệu`), `${referenceLimits.images} images / ${referenceLimits.videos} videos / ${referenceLimits.audios} audio clips · 12 total`) },
          ]} />}
        {kind === 'audio' ? <span className="gen-control gen-model">{model || text(tv('站点默认模型', 'Model mặc định của site'), 'Default model')}</span> : <GenerationSelect label={text(tv('生成模型', 'Model tạo'), 'Model')} icon={<Icon size={19} />} value={model} onChange={setModel} options={models.filter(item => item.available !== false).map(item => ({ value: item.id, label: item.label, description: item.pricing_hint }))} />}
        {kind === 'audio' ? <GenerationSelect label={text(tv('音色', 'Giọng nói'), 'Voice')} icon={<Mic size={18} />} value={voice} onChange={setVoice} options={[
          { value: 'narrator_calm', label: text(tv('沉静旁白', 'Lời dẫn trầm lắng'), 'Calm narrator'), description: text(tv('平稳自然，适合故事旁白', 'Ổn định tự nhiên, phù hợp lời dẫn truyện'), 'Steady and natural, for narration') },
          { value: 'warm_storyteller', label: text(tv('温暖讲述', 'Kể chuyện ấm áp'), 'Warm storyteller'), description: text(tv('柔和亲切，适合温馨叙事', 'Mềm mại thân thiện, phù hợp tự sự ấm cúng'), 'Warm and gentle, for storytelling') },
          { value: 'teacher_clear', label: text(tv('清晰男声', 'Giọng nam rõ ràng'), 'Clear male voice'), description: text(tv('清楚明快，适合知识讲解', 'Rõ ràng nhanh gọn, phù hợp giảng giải kiến thức'), 'Clear and bright, for explainers') },
        ]} /> : <>
          <GenerationSelect label={text(tv('分辨率', 'Độ phân giải'), 'Resolution')} value={resolution} onChange={setResolution} options={allowedResolutions.map(value => ({ value, label: value, description: selectedModel?.prices?.[value] ? `¥${selectedModel.prices[value]}/${kind === 'video' ? tv('秒', 'giây') : tv('张', 'ảnh')}` : '' }))} />
          <GenerationSelect label={text(tv('画幅', 'Tỷ lệ khung'), 'Aspect ratio')} value={ratio} onChange={setRatio} options={(selectedModel?.allowed_aspect_ratios ?? []).map(value => ({ value, label: value, icon: value === '1:1' ? <Square size={19} /> : value === '9:16' || value === '3:4' ? <RectangleVertical size={19} /> : <RectangleHorizontal size={21} /> }))} />
          {kind === 'video' && <GenerationSelect label={text(tv('视频时长', 'Thời lượng video'), 'Duration')} icon={<Clock3 size={18} />} value={duration} onChange={setDuration} options={Array.from({ length: (selectedModel?.duration_max ?? 30) - (selectedModel?.duration_min ?? 4) + 1 }, (_, index) => (selectedModel?.duration_min ?? 4) + index).map(value => ({ value: `${value}s`, label: text(tv(`${value} 秒`, `${value} giây`), `${value} sec`), description: text(tv(`${resolution} · 单次生成一个片段`, `${resolution} · Mỗi lần tạo một đoạn`), `${resolution} · One video per request`) }))} />}
          <span className="gen-control gen-output-count"><Layers size={17} /><span><small>{text(tv('生成数量', 'Số lượng tạo'), 'Output')}</small><strong>× 1</strong></span></span>
        </>}
        {kind === 'video' && <PromptMentionPopover open={Boolean(mention)} items={mentionItems} anchorRect={mention?.rect ?? null}
          activeIndex={mentionActiveIndex} onActiveIndexChange={setMentionActiveIndex} onSelect={selectMention} onClose={() => setMention(null)} />}
        <div className="gen-submit-group">
          {kind === 'video' ? <div className="gen-estimate" aria-live="polite">
            {estimateError ? <><strong>{text(tv('预计消耗暂不可用', 'Tạm thời không có chi phí dự kiến'), 'Estimate unavailable')}</strong><button type="button" onClick={retryEstimate}>{text(tv('重新计算', 'Tính lại'), 'Retry estimate')}</button></> : quote ? <>
              <span>{text(tv('预计消耗', 'Chi phí dự kiến'), 'Estimated cost')} <strong>{quote.billing_enabled ? `¥${(quote.estimate_fen / 100).toFixed(2)}` : text(tv('本次不扣费', 'Lần này không trừ phí'), 'No charge')}</strong></span>
              <small>{text(quote.billing_enabled ? quote.billing_mode === 'fixed_media' ? tv(`${duration.replace('s', '')} 秒 × 1 条 · 按当前价格结算`, `${duration.replace('s', '')} giây × 1 mục · quyết toán theo giá hiện tại`) : tv('按当前配置估算，最终按实际用量结算', 'Ước tính theo cấu hình hiện tại, cuối cùng quyết toán theo mức dùng thực tế') : tv('当前站点未开启计费', 'Site hiện tại chưa bật tính phí'), quote.billing_enabled ? quote.billing_mode === 'fixed_media' ? `${duration.replace('s', '')} sec × 1 video · Current pricing` : 'Estimated; settled on actual usage' : 'Billing is disabled on this site')}</small>
            </> : <span>{text(estimating ? tv('正在计算预计消耗…', 'Đang tính chi phí dự kiến…') : referenceError || tv('选择模型和参数后显示预计消耗', 'Chọn model và tham số sẽ hiển thị chi phí dự kiến'), estimating ? 'Estimating cost…' : referenceError ? 'Add valid reference media to estimate cost' : 'Choose a model and settings to estimate cost')}</span>}
          </div> : <span>{text(tv('生成记录自动保存', 'Bản ghi tạo tự động lưu'), 'Creations saved automatically')}</span>}
          <button className="gen-primary" disabled={submitting || !prompt.trim() || invalidParameters || (kind === 'video' && Boolean(referenceError || !quote || estimating || estimateError))} type="submit">{submitting ? <Loader2 className="gen-spin" size={18} /> : <Icon size={18} />}{text(submitting ? tv('提交中', 'Đang gửi') : kind === 'audio' ? tv('生成语音', 'Tạo giọng nói') : tv('创作', 'Sáng tạo'), submitting ? 'Submitting' : 'Generate')}</button>
        </div>
      </div>
    </form>
    {referenceError && <p className="gen-inline-error" role="alert">{referenceError}</p>}
    {estimateError && <p className="gen-inline-error" role="alert">{estimateError}</p>}
    {error && <BillingErrorNotice message={error} />}
    {notice && <div className="gen-notice" role="status"><Check size={18} />{notice}<Link to={`/tasks?kind=${kind}`}>{text(tv('查看任务', 'Xem tác vụ'), 'View task')}<ArrowRight size={15} /></Link></div>}
    <section className="gen-recent">
      <header><h2>{text(tv('最近生成', 'Tạo gần đây'), 'Recent creations')}</h2><Link to={`/tasks?kind=${kind}`}>{text(tv(`查看全部 ${recentTotal} 个`, `Xem tất cả ${recentTotal}`), `View all ${recentTotal}`)}<ArrowRight size={17} /></Link></header>
      {historyError && <p className="gen-inline-error" role="alert">{historyError}</p>}
      {!recent.length && !historyError ? <div className="gen-empty"><Icon size={34} /><strong>{text(tv('你的灵感，从这里开始', 'Cảm hứng của bạn, bắt đầu từ đây'), 'Your next idea starts here')}</strong><p>{text(tv('提交第一个生成任务，作品会自动出现在这里。', 'Gửi tác vụ tạo đầu tiên, tác phẩm sẽ tự động xuất hiện ở đây.'), 'Submit your first generation. Your creations will appear here.')}</p></div> : <div className="gen-gallery">
        {recent.map(item => <article key={item.id} className="gen-gallery-item">
          <button type="button" className="gen-gallery-preview" onClick={() => openDetail(item)} aria-label={text(tv(`查看生成详情：${item.prompt || '未命名创作'}`, `Xem chi tiết tạo: ${item.prompt || '未命名创作'}`), `View generation details: ${item.prompt || 'Untitled creation'}`)}>
            {kind === 'image' && (item.preview_url || item.urls[0]) ? <img src={resolveToolMediaUrl(item.preview_url || item.urls[0])} alt={item.prompt} /> : kind === 'video' && item.urls[0] ? <video src={resolveToolMediaUrl(item.urls[0])} poster={resolveToolMediaUrl(item.preview_url)} muted preload="metadata" /> : kind === 'video' && item.preview_url ? <img src={resolveToolMediaUrl(item.preview_url)} alt={item.prompt} /> : <Icon size={38} />}
            <span className={`gen-result-status is-${item.status}`}>{text(item.status === 'succeeded' ? tv('已完成', 'Đã hoàn tất') : item.status === 'failed' ? tv('失败', 'Thất bại') : item.status === 'cancelled' ? tv('已取消', 'Đã hủy') : tv('处理中', 'Đang xử lý'), item.status)}</span>
            <span className="gen-cover-overlay" aria-hidden><Eye size={20} /><span>{text(tv('查看详情', 'Xem chi tiết'), 'View details')}</span></span>
          </button>
          {kind === 'audio' && item.urls[0] && <audio controls src={resolveToolMediaUrl(item.urls[0])} preload="metadata" />}
          <div className="gen-gallery-caption"><button type="button" className="gen-gallery-title" title={item.prompt} onClick={() => openDetail(item)}>{item.prompt || text(tv('未命名创作', 'Sáng tạo chưa đặt tên'), 'Untitled creation')}</button>{item.status === 'succeeded' && item.urls[0] && <button type="button" className="gen-icon-button" disabled={downloading === item.id} onClick={() => void download(item)} aria-label={text(tv('下载', 'Tải xuống'), 'Download')}><Download size={16} /></button>}</div>
        </article>)}
      </div>}
    </section>
    {detail && detailAsset && <AssetDetailDialog asset={detailAsset} onClose={closeDetail}
      notice={<section className="pf-asset-detail-prompt"><div className="pf-asset-detail-text">
        <p role="status">{text(detail.status === 'succeeded' ? tv('已完成', 'Đã hoàn tất') : detail.status === 'failed' ? tv('生成失败', 'Tạo thất bại') : detail.status === 'cancelled' ? tv('已取消', 'Đã hủy') : tv('正在生成，结果会自动更新。', 'Đang tạo, kết quả sẽ tự cập nhật.'), detail.status === 'succeeded' ? 'Completed' : detail.status === 'failed' ? 'Generation failed' : detail.status === 'cancelled' ? 'Cancelled' : 'Generating. Results will update automatically.')}</p>
        {(detail.error || detailError) && <p role="alert">{formatGenerationErrorMessage(detail.error || detailError)}</p>}
      </div></section>}
      actions={detail.urls.length > 1 && <div className="pf-asset-detail-utilities" role="group" aria-label={text(tv('生成结果', 'Kết quả tạo'), 'Generation results')}>
        {detail.urls.map((url, index) => <button type="button" key={url} className="pf-btn pf-btn-sm" aria-pressed={resultIndex === index} onClick={() => selectResult(index)}>{text(tv(`结果 ${index + 1}`, `Kết quả ${index + 1}`), `Result ${index + 1}`)}</button>)}
      </div>}>
    </AssetDetailDialog>}
  </GenerationLayout>
}
