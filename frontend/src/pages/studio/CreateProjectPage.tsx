import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Clapperboard, Clock3, LoaderCircle, Save, Sparkles } from 'lucide-react'
import { api, type PipelineMode, type Project, type Template, type VoicePreset } from '../../api'
import AppShell from '../../components/layout/AppShell'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import Button from '../../components/ui/Button'
import Stepper from '../../components/ui/Stepper'
import { MediaCostNotice } from '../../components/billing/MediaCostNotice'
import { useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { creationTemplateId } from '../../lib/creationTemplates'
import { resolveShortVideoMediaSettings, shortVideoPipelineMode } from '../../lib/shortVideoSettings'
import { isRunning, kepuSteps } from '../../lib/status'
import { dialog } from '../../lib/dialog'
import './shortVideoCreate.css'
import { tv } from '../../i18n/tv'

const EXAMPLES = ['给小学生讲讲为什么天空是蓝色的', '一只胆小的小猫在雨天遇见新朋友', '用轻松的方式介绍二十四节气里的霜降']

export default function CreateProjectPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = Number(params.get('project')) || null
  const requestedTemplate = creationTemplateId(params.get('template'))
  const requestedPipelineMode = shortVideoPipelineMode(params.get('mode'))
  const returnPath = `/studio/new${params.size ? `?${params}` : ''}`
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [templateId, setTemplateId] = useState(requestedTemplate)
  const [ratio, setRatio] = useState('9:16')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>(requestedPipelineMode)
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const [imageResolution, setImageResolution] = useState('')
  const [videoResolution, setVideoResolution] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [duration, setDuration] = useState(60)
  const [voice, setVoice] = useState('')
  const [mode, setMode] = useState<'idea' | 'copy'>('idea')
  const [idea, setIdea] = useState('')
  const [copy, setCopy] = useState('')
  const [title, setTitle] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(Boolean(editId))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [voiceError, setVoiceError] = useState(false)
  const working = useRef(false)
  const savedProject = useRef<Project | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    let disposed = false
    if (!localStorage.getItem('token')) {
      nav(`/auth?next=${encodeURIComponent(returnPath)}`, { replace: true })
      return
    }
    api.templates().then(rows => { if (!disposed) setTemplates(rows) }).catch(cause => { if (!disposed) setError(cause.message || tv('模板加载失败', 'Tải mẫu thất bại')) })
    api.voices().then(rows => { if (!disposed) setVoices(rows) }).catch(() => { if (!disposed) setVoiceError(true) })
    return () => { disposed = true }
  }, [nav, editId, returnPath])
  useEffect(() => {
    let disposed = false
    if (!editId) {
      savedProject.current = null
      setProject(null)
      setLoading(false)
      setTemplateId(requestedTemplate)
      setRatio('9:16')
      setPipelineMode(requestedPipelineMode)
      setImageModel('')
      setVideoModel('')
      setImageResolution('')
      setVideoResolution('')
      setDuration(60)
      setVoice('')
      setMode('idea')
      setIdea('')
      setCopy('')
      setTitle('')
      setStep(0)
      return
    }
    // 新建后更新 URL 时，保留当前输入与文案。
    if (savedProject.current?.id === editId) return
    setLoading(true)
    api.getProject(editId).then(value => {
      if (disposed) return
      if (value.creation_session_id) {
        nav(`/studio/sessions/${value.creation_session_id}?project=${value.id}`, { replace: true })
        return
      }
      savedProject.current = value
      setProject(value)
      setTemplateId(creationTemplateId(value.template_id))
      setRatio(value.output_ratio || '9:16')
      setPipelineMode(shortVideoPipelineMode(value.pipeline_mode))
      setImageModel(value.image_model || '')
      setVideoModel(value.video_model || '')
      setImageResolution(value.image_resolution || '')
      setVideoResolution(value.video_resolution || '')
      setDuration(value.target_duration_sec || 60)
      setVoice(value.voice_id || '')
      setTitle(value.title)
      setIdea(value.source_text)
      if (value.source_type === 'script') {
        setCopy(value.source_text)
        setMode('copy')
        setStep(1)
      } else setStep(0)
    }).catch(cause => { if (!disposed) setError(cause.message || tv('项目加载失败', 'Tải dự án thất bại')) })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [editId, requestedTemplate, requestedPipelineMode, nav])

  const selectedTemplate = templates.find(item => item.id === templateId)
  const mediaSettings = resolveShortVideoMediaSettings(mediaCatalog, pipelineMode, { imageModel, videoModel, imageResolution, videoResolution, ratio }, project?.ref_image_url ? 3 : 2)
  const running = Boolean(project && (isRunning(project.status) || project.active_tasks?.some(task => ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review', 'cancel_requested'].includes(task.status))))
  const disabled = Boolean(busy || loading || running)
  function payload(text: string, name: string) {
    return {
      template_id: templateId, title: name.trim().slice(0, 200) || text.trim().slice(0, 30),
      source_type: 'script' as const, source_text: text.trim(),
      pipeline_mode: pipelineMode, resolution_mode: 'hd' as const,
      output_ratio: mediaSettings.ratio || ratio, target_duration_sec: duration, voice_id: voice,
      image_model: mediaSettings.imageModel, video_model: mediaSettings.videoModel,
      image_resolution: mediaSettings.imageResolution, video_resolution: mediaSettings.videoResolution,
    }
  }
  const draftFields = payload(copy, title)
  const draftChanged = Boolean(project && (
    project.title !== draftFields.title || project.source_text !== draftFields.source_text ||
    project.template_id !== templateId || project.output_ratio !== draftFields.output_ratio ||
    shortVideoPipelineMode(project.pipeline_mode) !== pipelineMode ||
    (project.target_duration_sec || 60) !== duration || (project.voice_id || '') !== voice ||
    (project.image_model || '') !== draftFields.image_model || (project.video_model || '') !== draftFields.video_model ||
    (project.image_resolution || '') !== draftFields.image_resolution || (project.video_resolution || '') !== draftFields.video_resolution
  ))
  const canSaveDraft = !project?.shots.length && !project?.final_video_url
  async function createDraft(text: string, name: string) {
    if (savedProject.current) return savedProject.current
    const value = await api.createProject(payload(text, name))
    savedProject.current = value
    if (mounted.current) {
      setProject(value)
      nav(`/studio/new?project=${value.id}`, { replace: true })
    }
    return value
  }
  async function saveDraft(text: string, name: string) {
    const old = savedProject.current
    if (!old) return createDraft(text, name)
    // Existing generated assets are changed only after the explicit restart confirmation.
    if (old.shots.length || old.final_video_url) return old
    const value = await api.updateProject(old.id, payload(text, name))
    savedProject.current = value
    if (mounted.current) setProject(value)
    return value
  }
  async function saveCopyDraft() {
    if (!copy.trim() || disabled || working.current || !selectedTemplate || !canSaveDraft) return
    working.current = true
    setBusy(tv('正在保存草稿…', 'Đang lưu bản nháp…'))
    setError('')
    try {
      await saveDraft(copy, title)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tv('草稿保存失败，请重试', 'Lưu bản nháp thất bại, vui lòng thử lại'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }
  async function prepareCopy(event: FormEvent) {
    event.preventDefault()
    if (!idea.trim() || disabled || working.current || !selectedTemplate) return
    working.current = true
    setError('')
    setBusy(mode === 'idea' ? tv('正在生成文案…', 'Đang tạo lời dẫn…') : tv('正在保存文案…', 'Đang lưu lời dẫn…'))
    try {
      const result = mode === 'copy'
        ? { title: title || idea.trim().slice(0, 30), content: idea.trim() }
        : await api.expandContent(`${idea.trim()}\n\n创作要求：约 ${duration} 秒，${selectedTemplate.name} 风格，普通话旁白。请写可直接配音的完整文案，保持内容与时长匹配。`, 'script')
      if (!mounted.current) return
      setCopy(result.content)
      setTitle(result.title)
      setStep(1)
      await saveDraft(result.content, result.title)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tv('文案生成失败，请重试', 'Tạo lời dẫn thất bại, vui lòng thử lại'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }
  async function generateStoryboard() {
    if (!copy.trim() || disabled || working.current || !selectedTemplate) return
    if (!mediaSettings.ready) {
      setError(tv('当前模型不可用或参考图数量不足，请重新选择图片和视频模型、清晰度与画面比例。', 'Model hiện tại không khả dụng hoặc số ảnh tham chiếu không đủ, vui lòng chọn lại model hình ảnh và video, độ nét và tỷ lệ khung.'))
      return
    }
    working.current = true
    try {
      const old = savedProject.current
      if (old?.shots.length) {
        const confirmed = await dialog.confirm({ title: tv('重新生成分镜', 'Tạo lại phân cảnh'), message: tv('新的文案与设置将重新生成分镜，并替换本项目已有的图片、镜头视频、配音和成片。', 'Lời dẫn và cài đặt mới sẽ tạo lại phân cảnh, và thay thế hình ảnh, video cảnh, lồng tiếng và phim hiện có của dự án này.'), confirmText: tv('重新生成', 'Tạo lại'), tone: 'danger' })
        if (!confirmed || !mounted.current) return
      }
      setBusy(tv('正在保存并生成分镜…', 'Đang lưu và tạo phân cảnh…'))
      setError('')
      let value = await createDraft(copy, title)
      value = await api.updateProject(value.id, payload(copy, title))
      savedProject.current = value
      setProject(value)
      await api.generate(value.id, { restart: Boolean(value.shots.length) })
      if (mounted.current) nav(`/studio/${value.id}`)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : tv('分镜生成失败，请重试', 'Tạo phân cảnh thất bại, vui lòng thử lại'))
    } finally {
      working.current = false
      if (mounted.current) setBusy('')
    }
  }

  return <AppShell active="studio">
    <div className="sv-create-page">
      <header className="sv-create-header">
        <div><Link className="sv-back" to="/history"><ArrowLeft size={16} /> {tv("我的短片", "Video ngắn của tôi")}</Link><h1>{editId ? tv('编辑短片', 'Chỉnh sửa video ngắn') : tv('创建短片', 'Tạo video ngắn')}</h1><p>{tv("从一个想法开始，每一步都可以查看和调整。", "Bắt đầu từ một ý tưởng, mỗi bước đều có thể xem và điều chỉnh.")}</p></div>
        <Stepper steps={kepuSteps(pipelineMode)} current={pipelineMode === 'full' && step === 1 ? 2 : step} />
      </header>
      {error && <BillingErrorNotice message={error} />}
      {loading ? <div className="sv-loading"><LoaderCircle className="sv-spin" size={20} /> {tv("正在加载项目…", "Đang tải dự án…")}</div> : <>
        {running && <div className="sv-running-note">{tv("项目正在制作中，请在工作台查看进度或停止任务。", "Dự án đang được sản xuất, vui lòng xem tiến độ hoặc dừng tác vụ ở bàn làm việc.")}<Link to={`/studio/${project!.id}`}>{tv("查看工作台", "Xem bàn làm việc")} <ArrowRight size={15} /></Link></div>}
        <div className="sv-create-grid">
          <main>
            {step === 0 ? <form onSubmit={prepareCopy}>
              <section className="sv-panel">
                <div className="sv-section-heading"><span>01</span><div><h2>{tv("选择画面风格", "Chọn phong cách hình ảnh")}</h2><p>{tv("四种动画与插画风格，生图时使用画风参考图，逐镜延续角色与视觉风格。", "Bốn phong cách hoạt hình và minh họa, khi tạo ảnh dùng ảnh tham chiếu phong cách, kế thừa nhân vật và phong cách hình ảnh từng cảnh.")}</p></div></div>
                <div className="sv-style-grid" role="group" aria-label={tv("画面风格", "Phong cách hình ảnh")}>
                  {templates.map(item => <button key={item.id} type="button" className={`sv-style-card${item.id === templateId ? ' is-selected' : ''}`} disabled={disabled} aria-pressed={item.id === templateId} onClick={() => setTemplateId(item.id)}>
                    <img src={api.assetUrl(item.preview_cover)} alt="" /><div><strong>{item.name}</strong><p>{item.description}</p></div>
                    {item.id === templateId && <span className="sv-style-check"><Check size={14} /></span>}
                  </button>)}
                </div>
              </section>
              <section className="sv-panel">
                <div className="sv-section-heading"><span>02</span><div><h2>{tv("写下你想表达的内容", "Viết điều bạn muốn diễn đạt")}</h2><p>{tv("描述主题、受众和重点，或直接粘贴已有文案。", "Mô tả chủ đề, đối tượng và trọng tâm, hoặc dán trực tiếp lời dẫn có sẵn.")}</p></div></div>
                <div className="sv-input-tabs"><button type="button" className={mode === 'idea' ? 'is-active' : ''} onClick={() => setMode('idea')} disabled={disabled}>{tv("输入想法", "Nhập ý tưởng")}</button><button type="button" className={mode === 'copy' ? 'is-active' : ''} onClick={() => setMode('copy')} disabled={disabled}>{tv("已有文案", "Đã có lời dẫn")}</button></div>
                <label className="sv-field"><span>{mode === 'idea' ? tv('短片想法', 'Ý tưởng video ngắn') : tv('完整文案', 'Lời dẫn hoàn chỉnh')}</span><textarea aria-label={mode === 'idea' ? tv('短片想法', 'Ý tưởng video ngắn') : tv('完整文案', 'Lời dẫn hoàn chỉnh')} value={idea} onChange={event => setIdea(event.target.value)} rows={6} maxLength={20000} disabled={disabled} placeholder={mode === 'idea' ? tv('例如：用 3D 动画给小学生解释天空为什么是蓝色，语言轻松，约 60 秒。', 'Ví dụ: dùng hoạt hình 3D giải thích cho học sinh tiểu học vì sao bầu trời màu xanh, ngôn ngữ nhẹ nhàng, khoảng 60 giây.') : tv('粘贴可以直接配音的文案，下一步可以继续编辑。', 'Dán lời dẫn có thể lồng tiếng trực tiếp, bước sau có thể tiếp tục chỉnh sửa.')} required /></label>
                {mode === 'idea' && <div className="sv-examples">{EXAMPLES.map(example => <button type="button" key={example} onClick={() => setIdea(example)} disabled={disabled}>{example}</button>)}</div>}
                <div className="sv-actions"><span>{tv("文案生成后可修改，再继续生成分镜。", "Lời dẫn sau khi tạo có thể sửa, rồi tiếp tục tạo phân cảnh.")}</span><div className="sv-action-buttons">{copy.trim() && <Button variant="outline" disabled={disabled} onClick={() => setStep(1)}>{tv("编辑已有文案", "Chỉnh sửa lời dẫn có sẵn")}</Button>}<Button type="submit" variant="lime" disabled={disabled || !idea.trim() || !selectedTemplate}>{busy ? <LoaderCircle size={16} className="sv-spin" /> : <Sparkles size={16} />}{busy || (mode === 'idea' ? tv('生成文案', 'Tạo lời dẫn') : tv('下一步：检查文案', 'Bước sau: kiểm tra lời dẫn'))}<ArrowRight size={16} /></Button></div></div>
              </section>
            </form> : <section className="sv-panel">
              <div className="sv-section-heading"><span>02</span><div><h2>{tv("检查文案，再生成分镜", "Kiểm tra lời dẫn, rồi tạo phân cảnh")}</h2><p>{tv("这份文案将作为旁白。确认内容后，再拆分画面与镜头。", "Lời dẫn này sẽ là phần thuyết minh. Sau khi xác nhận nội dung, hãy tách hình ảnh và cảnh quay.")}</p></div></div>
              <label className="sv-field"><span>{tv("短片名称", "Tên video ngắn")}</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} disabled={disabled} /></label>
              <label className="sv-field"><span>{tv("配音文案", "Lời dẫn lồng tiếng")} <small>{copy.length} {tv("字", "chữ")}</small></span><textarea aria-label={tv("配音文案", "Lời dẫn lồng tiếng")} value={copy} onChange={event => setCopy(event.target.value)} rows={13} maxLength={20000} disabled={disabled} /></label>
              <div className="sv-actions"><Button variant="outline" disabled={disabled} onClick={() => setStep(0)}><ArrowLeft size={15} /> {tv("返回调整", "Quay lại điều chỉnh")}</Button><div className="sv-action-buttons">{canSaveDraft && <Button variant="outline" disabled={disabled || !copy.trim() || !selectedTemplate || Boolean(project && !draftChanged)} onClick={() => { void saveCopyDraft() }}><Save size={15} />{tv("保存草稿", "Lưu bản nháp")}</Button>}<Button variant="lime" disabled={disabled || !copy.trim() || !selectedTemplate} onClick={() => { void generateStoryboard() }}>{busy ? <LoaderCircle size={16} className="sv-spin" /> : <Clapperboard size={16} />}{busy || tv('生成分镜脚本', 'Tạo kịch bản phân cảnh')}<ArrowRight size={16} /></Button></div></div>
              {project && <p className="sv-saved-note">{draftChanged ? canSaveDraft ? tv('有未保存的修改，可先保存草稿，或生成分镜时一并保存。', 'Có thay đổi chưa lưu, có thể lưu bản nháp trước, hoặc lưu cùng lúc khi tạo phân cảnh.') : tv('修改将在重新生成分镜时保存。', 'Thay đổi sẽ được lưu khi tạo lại phân cảnh.') : canSaveDraft ? tv('草稿已保存。', 'Đã lưu bản nháp.') : tv('已载入项目文案。', 'Đã nạp lời dẫn của dự án.')}<Link to={`/studio/${project.id}`}>{tv("打开项目工作台", "Mở bàn làm việc dự án")}</Link></p>}
            </section>}
          </main>
          <aside className="sv-panel sv-settings">
            <h2>{tv("短片设置", "Cài đặt video ngắn")}</h2><p>{tv("先用默认设置，也可以按需要调整。", "Dùng cài đặt mặc định trước, cũng có thể chỉnh theo nhu cầu.")}</p>
            <div className="sv-field"><span>{tv("成片方式", "Cách làm phim")}</span><div className="sv-output-modes" role="group" aria-label={tv("成片方式", "Cách làm phim")}>{([{ id: 'full', label: tv('AI 视频', 'Video AI'), desc: tv('参考图生图 → 图生视频 → 合成', 'Ảnh tham chiếu thành hình → ảnh thành video → ghép phim') }, { id: 'image_text', label: tv('静图成片', 'Phim từ ảnh tĩnh'), desc: tv('参考图生图 → 图片运镜与配音', 'Ảnh tham chiếu thành hình → chuyển động máy ảnh và lồng tiếng') }] as const).map(item => <button key={item.id} type="button" className={pipelineMode === item.id ? 'is-selected' : ''} aria-pressed={pipelineMode === item.id} disabled={disabled} onClick={() => setPipelineMode(item.id)}><strong>{item.label}</strong><span>{item.desc}</span>{pipelineMode === item.id && <Check size={14} />}</button>)}</div></div>
            <label className="sv-field"><span>{tv("画面比例", "Tỷ lệ hình ảnh")}</span><select value={mediaSettings.ratio} onChange={event => setRatio(event.target.value)} disabled={disabled || !mediaSettings.ratios.length}>{!mediaSettings.ratios.length && <option value="">{tv("暂无共同支持的画幅", "Chưa có tỷ lệ khung nào cùng được hỗ trợ")}</option>}{mediaSettings.ratios.map(value => <option key={value} value={value}>{value}{value === '9:16' ? tv(' 竖屏', ' dọc') : value === '16:9' ? tv(' 横屏', ' ngang') : value === '1:1' ? tv(' 方形', ' vuông') : ''}</option>)}</select></label>
            <label className="sv-field"><span>{tv("目标时长", "Thời lượng mục tiêu")}</span><select value={duration} onChange={event => setDuration(Number(event.target.value))} disabled={disabled}>{[...new Set([30, 60, 90, 120, 180, duration])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{tv("约", "Khoảng")} {value} {tv("秒", "giây")}</option>)}</select></label>
            {pipelineMode === 'image_text' ? <>
              <label className="sv-field"><span>{tv("旁白音色", "Giọng lời dẫn")}</span><select value={voice} onChange={event => setVoice(event.target.value)} disabled={disabled}><option value="">{tv("默认普通话音色", "Giọng tiếng Phổ thông mặc định")}</option>{voice && !voices.some(item => (item.speaker || item.id) === voice) && <option value={voice}>{tv("项目原有音色", "Giọng gốc của dự án")}</option>}{voices.map(item => <option key={item.id} value={item.speaker || item.id}>{item.label}</option>)}</select></label>
              {voiceError && <p className="sv-saved-note">{tv("音色列表暂未加载，仍可使用默认配音。", "Danh sách giọng nói chưa tải, vẫn có thể dùng lồng tiếng mặc định.")}</p>}
            </> : <p className="sv-saved-note">{tv("视频模型生成旁白与声音。", "Model video tạo lời dẫn và âm thanh.")}</p>}
            <details className="sv-model-settings" open={pipelineMode === 'full'}><summary>{tv("生成模型与清晰度", "Model tạo và độ nét")}</summary>
              <label className="sv-field"><span>{tv("参考图生图模型", "Model ảnh tham chiếu thành hình")}</span><select value={mediaSettings.imageModel} disabled={disabled || !mediaSettings.imageOptions.length} onChange={event => setImageModel(event.target.value)}>{mediaSettings.imageSelectionUnavailable && <option value={mediaSettings.imageModel} disabled>{mediaSettings.imageModel}{tv("（当前不可用）", "(hiện không khả dụng)")}</option>}{!mediaSettings.imageOptions.length && !mediaSettings.imageSelectionUnavailable && <option value="">{mediaCatalog ? tv('暂无可用参考图模型', 'Chưa có model ảnh tham chiếu khả dụng') : tv('正在加载模型…', 'Đang tải model…')}</option>}{mediaSettings.imageOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="sv-field"><span>{tv("图片清晰度", "Độ nét hình ảnh")}</span><select value={mediaSettings.imageResolution} disabled={disabled || !mediaSettings.imageResolutions.length} onChange={event => setImageResolution(event.target.value)}>{!mediaSettings.imageResolutions.length && <option value={mediaSettings.imageResolution}>{mediaSettings.imageResolution || tv('请选择可用模型', 'Vui lòng chọn model khả dụng')}</option>}{mediaSettings.imageResolutions.map(value => <option key={value} value={value}>{value}</option>)}</select><MediaCostNotice modelId={mediaSettings.imageModel} resolution={mediaSettings.imageResolution} /></label>
              {pipelineMode === 'full' && <><label className="sv-field"><span>{tv("图生视频模型", "Model ảnh thành video")}</span><select value={mediaSettings.videoModel} disabled={disabled || !mediaSettings.videoOptions.length} onChange={event => setVideoModel(event.target.value)}>{mediaSettings.videoSelectionUnavailable && <option value={mediaSettings.videoModel} disabled>{mediaSettings.videoModel}{tv("（当前不可用）", "(hiện không khả dụng)")}</option>}{!mediaSettings.videoOptions.length && !mediaSettings.videoSelectionUnavailable && <option value="">{mediaCatalog ? tv('暂无可用图生视频模型', 'Chưa có model ảnh thành video khả dụng') : tv('正在加载模型…', 'Đang tải model…')}</option>}{mediaSettings.videoOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className="sv-field"><span>{tv("视频清晰度", "Độ nét video")}</span><select value={mediaSettings.videoResolution} disabled={disabled || !mediaSettings.videoResolutions.length} onChange={event => setVideoResolution(event.target.value)}>{!mediaSettings.videoResolutions.length && <option value={mediaSettings.videoResolution}>{mediaSettings.videoResolution || tv('请选择可用模型', 'Vui lòng chọn model khả dụng')}</option>}{mediaSettings.videoResolutions.map(value => <option key={value} value={value}>{value}</option>)}</select><MediaCostNotice modelId={mediaSettings.videoModel} resolution={mediaSettings.videoResolution} seconds={1} /></label></>}
              {mediaCatalog && !mediaSettings.ready && <p className="sv-model-error" role="status">{tv("请重新选择可用模型，生图需支持", "Vui lòng chọn lại model khả dụng, tạo ảnh cần hỗ trợ")} {project?.ref_image_url ? 3 : 2} {tv("张参考图", "ảnh tham chiếu")}{pipelineMode === 'full' ? tv('，视频需支持 2 张参考图', ', video cần hỗ trợ 2 ảnh tham chiếu') : ''}{tv("，并确认清晰度和画幅。", ", và xác nhận độ nét cùng tỷ lệ khung.")}</p>}
            </details>
            <div className="sv-setting-summary"><Clapperboard size={17} /><div><strong>{selectedTemplate?.name || tv('3D 动画', 'Hoạt hình 3D')}</strong><span>{pipelineMode === 'full' ? tv('图生视频', 'Ảnh thành video') : tv('图片运镜', 'Chuyển động máy ảnh tĩnh')} {tv("· 普通话旁白 · 中文字幕", "· Lời dẫn tiếng Phổ thông · Phụ đề tiếng Trung")}</span><span>{tv("使用画风参考图，并参考前镜画面保持一致。", "Dùng ảnh tham chiếu phong cách, và tham chiếu hình của cảnh trước để giữ nhất quán.")}</span></div></div>
            <div className="sv-workflow-hint"><Clock3 size={17} /><p>{pipelineMode === 'full' ? tv('确认分镜后先生成参考图画面，再将图片逐镜生成为视频，检查镜头后合成成片。', 'Sau khi xác nhận phân cảnh, trước tiên tạo hình ảnh tham chiếu, rồi tạo từng cảnh thành video, kiểm tra cảnh rồi ghép thành phim.') : tv('检查分镜后生成图片和配音，素材准备好后再合成视频。', 'Kiểm tra phân cảnh rồi tạo hình ảnh và lồng tiếng, tư liệu sẵn sàng rồi mới ghép video.')}</p></div>
          </aside>
        </div>
      </>}
    </div>
  </AppShell>
}
