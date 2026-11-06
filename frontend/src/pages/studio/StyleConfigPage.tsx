import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, defaultsFromTemplate, resolveVoiceId } from '../../api'
import type { MediaModelOption, PipelineMode, Project, Template, VoicePreset } from '../../api'
import { resolveCatalogModelSelection, useMediaModelsCatalog } from '../../hooks/useMediaModelsCatalog'
import { MediaCostNotice } from '../../components/billing/MediaCostNotice'
import AppShell from '../../components/layout/AppShell'
import Stepper from '../../components/ui/Stepper'
import ComingSoon from '../../components/ui/ComingSoon'
import { IconChevronLeft, IconPlay } from '../../components/ui/Icons'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import { handleBillingError } from '../../lib/billingError'
import { kepuStepIndex, kepuSteps } from '../../lib/status'
import { tv } from '../../i18n/tv'

const OUTPUT_MODES: { id: PipelineMode; label: string; desc: string; image: string }[] = [
  { id: 'full', label: tv('AI 视频', 'Video AI'), desc: tv('图→视频→配音→合成', 'Ảnh → video → lồng tiếng → ghép phim'), image: '/mode-presets/full.jpg' },
  {
    id: 'image_text',
    label: tv('静图成片', 'Phim từ ảnh tĩnh'),
    desc: tv('静图+叠字+配音，不生成 AI 视频', 'Ảnh tĩnh + chữ chèn + lồng tiếng, không tạo video AI'),
    image: '/mode-presets/image_text.jpg',
  },
]

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: '16:9', label: '16:9', w: 36, h: 20 },
  { id: '9:16', label: '9:16', w: 18, h: 32 },
  { id: '1:1', label: '1:1', w: 24, h: 24 },
  { id: '4:3', label: '4:3', w: 28, h: 21 },
  { id: '21:9', label: '21:9', w: 40, h: 17 },
]

/** 画幅是否竖向（高 > 宽），用于预览卡与实时预览比例 */
/** 音色卡片与 API 试听共用的 speaker 键 */
function voiceKey(v: VoicePreset): string {
  return v.speaker || v.id
}

function isPortraitRatio(ratio: string | undefined | null): boolean {
  const raw = String(ratio || '').trim()
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i)
  if (!m) return false
  return Number(m[2]) > Number(m[1])
}

export default function StyleConfigPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [voices, setVoices] = useState<VoicePreset[]>([])
  const [stylePrompt, setStylePrompt] = useState('')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('full')
  const [ratio, setRatio] = useState('16:9')
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const mediaCatalog = useMediaModelsCatalog()
  const [imageResolution, setImageResolution] = useState('2K')
  const [videoResolution, setVideoResolution] = useState('480p')
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!mediaCatalog) return
    setImageModel(previous => resolveCatalogModelSelection(mediaCatalog, 'image', previous))
    setVideoModel(previous => resolveCatalogModelSelection(mediaCatalog, 'video', previous))
  }, [mediaCatalog, imageModel, videoModel])

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
    }
    api.voices().then(setVoices)
    Promise.all([api.templates(), api.getProject(projectId)])
      .then(async ([list, p]) => {
        if (p.pipeline_mode === 'image_text') {
          nav(`/studio/new?project=${p.id}`, { replace: true })
          return
        }
        // 下架的风格不再展示给新用户，历史项目仍可加载其原模板。
        if (p.template_id && !list.some((item) => item.id === p.template_id)) {
          const legacy = await api.getTemplate(p.template_id)
          list = [...list, legacy]
        }
        setTemplates(list)
        setProject(p)
        setStylePrompt(p.style_prompt || '')
        setExtraPrompt(p.extra_prompt || '')
        setVoiceId(p.voice_id || '')
        setPipelineMode(p.pipeline_mode || 'full')
        setRatio(p.output_ratio || '16:9')
        if (p.image_model) setImageModel(p.image_model)
        if (p.video_model) setVideoModel(p.video_model)
        if (p.image_resolution) setImageResolution(p.image_resolution)
        if (p.video_resolution) setVideoResolution(p.video_resolution)
      })
      .catch((err) => setError(err instanceof Error ? err.message : tv('加载失败', 'Tải thất bại')))
  }, [nav, projectId])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!voices.length) return
    setVoiceId((prev) => {
      const next = resolveVoiceId(prev, voices)
      return next === prev ? prev : next
    })
  }, [voices])

  const currentTpl = useMemo(
    () => templates.find((t) => t.id === project?.template_id),
    [templates, project?.template_id],
  )

  const selectedVoice = voices.find((v) => voiceKey(v) === voiceId || v.id === voiceId)

  useEffect(() => {
    if (!project || !currentTpl) return
    if (!stylePrompt) {
      const d = defaultsFromTemplate(currentTpl)
      setStylePrompt((v) => v || d.style_prompt)
      setExtraPrompt((v) => v || d.extra_prompt)
      setVoiceId((v) => v || d.voice_id)
    }
  }, [project, currentTpl])

  useEffect(() => {
    if (!project || project.output_ratio || !currentTpl?.default_ratio) return
    setRatio(currentTpl.default_ratio)
  }, [project?.id, project?.output_ratio, currentTpl?.default_ratio])

  function pickRatio(r: (typeof RATIOS)[0]) {
    setRatio(r.id)
  }

  function stopPreview() {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  function selectVoice(v: VoicePreset) {
    const vid = voiceKey(v)
    if (vid !== voiceId) stopPreview()
    setVoiceId(vid)
  }

  async function previewVoice(v: VoicePreset, e: MouseEvent) {
    e.stopPropagation()
    const vid = voiceKey(v)
    selectVoice(v)
    setError('')

    if (playingId === vid && audioRef.current && !audioRef.current.paused) {
      stopPreview()
      return
    }

    stopPreview()
    setPreviewBusy(vid)
    try {
      const res = await api.previewVoice(vid)
      const url = api.assetUrl(res.url)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        setPlayingId(null)
        setError(tv('试听播放失败', 'Phát nghe thử thất bại'))
      }
      setPlayingId(vid)
      await audio.play()
    } catch (err) {
      setError(err instanceof Error ? err.message : tv('试听失败', 'Nghe thử thất bại'))
      setPlayingId(null)
    } finally {
      setPreviewBusy(null)
    }
  }

  async function generate() {
    if (!project) return
    const image = mediaCatalog?.image_models.find(item => item.id === imageModel)
    const video = mediaCatalog?.video_models.find(item => item.id === videoModel)
    if (!image || image.available === false || !(image.available_resolutions ?? image.allowed_resolutions ?? []).includes(imageResolution) || !image.allowed_aspect_ratios?.includes(ratio) ||
        (pipelineMode === 'full' && (!video || video.available === false || !(video.available_resolutions ?? video.allowed_resolutions ?? []).includes(videoResolution) || !video.allowed_aspect_ratios?.includes(ratio)))) {
      setError(tv('所选模型不支持当前参数或尚未配置价格，请检查模型、分辨率和画幅。', 'Model đã chọn không hỗ trợ tham số hiện tại hoặc chưa cấu hình giá, vui lòng kiểm tra model, độ phân giải và tỷ lệ khung.'))
      return
    }
    stopPreview()
    setBusy(true)
    setError('')
    try {
      const d = currentTpl ? defaultsFromTemplate(currentTpl) : null
      /*
       * styleOut 风格提示词；与模板相同则留空，生成时读后台
       * extraOut 额外提示词
       */
      const styleOut = stylePrompt.trim()
      const extraOut = extraPrompt.trim()
      const sameStyle = Boolean(d) && styleOut === d!.style_prompt
      const sameExtra = Boolean(d) && extraOut === d!.extra_prompt
      await api.updateProject(project.id, {
        style_prompt: sameStyle ? '' : styleOut,
        character_prompt: '',
        extra_prompt: sameExtra ? '' : extraOut,
        voice_id: voiceId,
        pipeline_mode: pipelineMode,
        output_ratio: ratio,
        image_model: imageModel,
        video_model: videoModel,
        image_resolution: imageResolution,
        video_resolution: videoResolution,
      })
      const started = await api.generate(project.id)
      nav(`/studio/${started.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : tv('生成失败', 'Tạo thất bại')
      if (msg.includes('合成成片')) {
        try {
          const composed = await api.compose(project.id)
          nav(`/studio/${composed.id}`)
          return
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : tv('合成失败', 'Tổng hợp thất bại'))
          return
        }
      }
      setError(msg)
      await handleBillingError(err, nav)
    } finally {
      setBusy(false)
    }
  }

  // project 初始加载失败时不得穿透主页面（下方存在 project.xxx 非空访问，会白屏崩溃）
  if (!project) {
    return (
      <AppShell active="studio">
        {error ? <BillingErrorNotice message={error} /> : <p className="pf-muted">{tv("加载中…", "Đang tải…")}</p>}
      </AppShell>
    )
  }

  return (
    <AppShell active="studio" wide>
      <header className="pf-page-head">
        <div className="pf-page-head-row">
          <div>
            <button type="button" className="pf-back" onClick={() => nav('/studio/new')}>
              <IconChevronLeft size={18} />
              {tv("返回创作台", "Quay lại bàn sáng tạo")}
            </button>
            <h1 className="pf-page-title">{project?.title || tv('风格配置', 'Cấu hình phong cách')}</h1>
          </div>
          <Stepper
            steps={kepuSteps(pipelineMode)}
            current={kepuStepIndex('style', { status: 'DRAFT', pipeline_mode: pipelineMode })}
            doneThrough={0}
          />
        </div>
      </header>

      <div className="pf-style-layout">
        <aside className="pf-create-col">
          <h3>{tv("项目信息", "Thông tin dự án")}</h3>
          {currentTpl ? (
            <div>
              <div
                className={[
                  'pf-style-side-thumb',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
              </div>
              <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>{currentTpl.name}</p>
              <div className="pf-tags">
                {currentTpl.category.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="pf-meta-list" style={{ marginTop: '0.85rem' }}>
            <li>
              <span>{tv("主题", "Chủ đề")}</span>
              <span style={{ maxWidth: '55%', textAlign: 'right' }}>
                {(project?.source_text || '').slice(0, 40)}
              </span>
            </li>
            <li>
              <span>{tv("时长", "Thời lượng")}</span>
              <span>{tv("~1–3 分钟", "~1–3 phút")}</span>
            </li>
            <li>
              <span>{tv("分镜数", "Số phân cảnh")}</span>
              <span>{tv("AI 自动", "AI tự động")}</span>
            </li>
          </ul>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm" disabled>
            {tv("预览模板", "Xem trước mẫu")} <ComingSoon />
          </button>
        </aside>

        <section className="pf-create-col">
          <div className="pf-style-block">
            <h3>{tv("画面风格", "Phong cách hình ảnh")}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {tv("已由选题时选择的模板锁定，出图与出视频会自动带上画风。是否出角色由模板规则和主题让 AI 决定，不必再选一套人设。", "Đã bị khóa theo mẫu chọn khi chọn chủ đề, tạo ảnh và video sẽ tự mang phong cách hình ảnh. Có tạo nhân vật hay không do quy tắc mẫu và chủ đề để AI quyết định, không cần chọn thêm bộ nhân vật.")}
            </p>
            {currentTpl ? (
              <div
                className={[
                  'pf-style-opt',
                  'selected',
                  isPortraitRatio(currentTpl.default_ratio) ? 'portrait' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ maxWidth: 280, textAlign: 'left' }}
              >
                <span className="pf-style-opt-media">
                  <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
                  {currentTpl.default_ratio ? (
                    <span className="pf-style-opt-ratio">{currentTpl.default_ratio}</span>
                  ) : null}
                </span>
                <div className="cap">{currentTpl.name}</div>
                <div className="cap-sub">{tv("模板画风", "Phong cách hình ảnh của mẫu")}</div>
              </div>
            ) : null}
            <label className="pf-field" style={{ marginTop: '0.75rem' }}>
              <span className="pf-field-label">{tv("风格提示词（可选覆盖）", "Prompt phong cách (tùy chọn ghi đè)")}</span>
              <textarea
                className="pf-field-input"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                rows={2}
                style={{ resize: 'vertical', minHeight: 64 }}
              />
            </label>
          </div>

          <div className="pf-style-block">
            <h3>
              {tv("配音音色", "Giọng lồng tiếng")}
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
                {tv("更多音色", "Thêm giọng nói")} <ComingSoon />
              </button>
            </h3>
            <div className="pf-voice-row">
              {voices.map((v) => {
                const vid = voiceKey(v)
                const selected = voiceId === vid
                const loading = previewBusy === vid
                const playing = playingId === vid
                return (
                  <div
                    key={v.id}
                    className={selected ? 'pf-voice-card selected' : 'pf-voice-card'}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectVoice(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectVoice(v)
                      }
                    }}
                  >
                    <strong className="pf-voice-name">{v.label}</strong>
                    <span className="pf-voice-meta">
                      {v.gender === 'female' ? tv('女声', 'Giọng nữ') : v.gender === 'male' ? tv('男声', 'Giọng nam') : v.gender}
                    </span>
                    <button
                      type="button"
                      className={[
                        'pf-btn',
                        'pf-btn-sm',
                        'pf-btn-icon',
                        playing ? 'pf-btn-lime' : 'pf-btn-ghost',
                        'pf-voice-preview',
                      ].join(' ')}
                      disabled={loading || busy}
                      onClick={(e) => previewVoice(v, e)}
                    >
                      {loading ? (
                        tv('生成中…', 'Đang tạo…')
                      ) : playing ? (
                        tv('播放中', 'Đang phát')
                      ) : (
                        <>
                          <IconPlay size={12} />
                          {tv("试听", "Nghe thử")}
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {selectedVoice ? (
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0.55rem 0 0' }}>
                {tv("当前：", "Hiện tại:")}{selectedVoice.label} {tv("· 成片用该音色整片配音；点击「试听」可听约 5 秒样例", "· Phim dùng giọng này lồng tiếng toàn phim; bấm “Nghe thử” để nghe mẫu khoảng 5 giây")}
              </p>
            ) : null}
          </div>

          <div className="pf-style-block">
            <h3>{tv("成片方式", "Cách làm phim")}</h3>
            <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              {tv("任意模板都可选择是否生成 AI 视频，与画幅无关。", "Mọi mẫu đều có thể chọn có tạo video AI hay không, không liên quan tỷ lệ khung.")}
            </p>
            <div className="pf-style-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {OUTPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={pipelineMode === m.id ? 'pf-style-opt selected' : 'pf-style-opt'}
                  onClick={() => setPipelineMode(m.id)}
                >
                  <img src={m.image} alt="" />
                  <div className="cap">{m.label}</div>
                  <div className="cap-sub">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {mediaCatalog ? (
            <div className="pf-style-block">
              <h3>{tv("图片模型", "Model hình ảnh")}</h3>
              <label>{tv("分辨率", "Độ phân giải")} <select value={imageResolution} onChange={event => setImageResolution(event.target.value)}>
                {(mediaCatalog.image_models.find(item => item.id === imageModel)?.available_resolutions ?? mediaCatalog.image_models.find(item => item.id === imageModel)?.allowed_resolutions ?? []).map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <MediaCostNotice modelId={imageModel} resolution={imageResolution} />
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {tv("使用管理后台「模型」中已勾选的 TokenFree 模型。", "Dùng các model TokenFree đã tích chọn trong “Model” của trang quản trị.")}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.image_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={imageModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    disabled={m.available === false}
                    onClick={() => setImageModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">{tv("推荐", "Đề xuất")}</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">{Object.entries(m.prices ?? {}).map(([resolution, price]) => tv(`${resolution} ¥${price}/张`, `${resolution} ¥${price}/ảnh`)).join(' · ') || m.pricing_hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mediaCatalog && pipelineMode === 'full' ? (
            <div className="pf-style-block">
              <h3>{tv("视频模型", "Model video")}</h3>
              <label>{tv("分辨率", "Độ phân giải")} <select value={videoResolution} onChange={event => setVideoResolution(event.target.value)}>
                {(mediaCatalog.video_models.find(item => item.id === videoModel)?.available_resolutions ?? mediaCatalog.video_models.find(item => item.id === videoModel)?.allowed_resolutions ?? []).map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <MediaCostNotice modelId={videoModel} resolution={videoResolution} seconds={1} />
              <p className="pf-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
                {tv("图生视频所用模型；静图成片模式不调用。", "Model dùng cho ảnh thành video; chế độ phim ảnh tĩnh không gọi.")}
              </p>
              <div className="pf-model-grid">
                {mediaCatalog.video_models.map((m: MediaModelOption) => (
                  <button
                    key={m.id}
                    type="button"
                    className={videoModel === m.id ? 'pf-model-opt selected' : 'pf-model-opt'}
                    disabled={m.available === false}
                    onClick={() => setVideoModel(m.id)}
                  >
                    <div className="pf-model-opt-title">
                      <span>{m.label}</span>
                      {m.recommended ? <span className="pf-model-badge">{tv("推荐", "Đề xuất")}</span> : null}
                    </div>
                    <div className="pf-model-opt-desc">{m.description}</div>
                    <div className="pf-model-opt-provider">{Object.entries(m.prices ?? {}).map(([resolution, price]) => tv(`${resolution} ¥${price}/秒`, `${resolution} ¥${price}/giây`)).join(' · ') || m.pricing_hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pf-style-block">
            <h3>{tv("输出比例", "Tỷ lệ đầu ra")}</h3>
            <div className="pf-ratio-row">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={ratio === r.id ? 'pf-ratio selected' : 'pf-ratio'}
                  onClick={() => pickRatio(r)}
                >
                  <div className="box" style={{ width: r.w, height: r.h }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="pf-create-col">
          <h3>{tv("实时预览", "Xem trước thời gian thực")}</h3>
          <div
            className={[
              'pf-editor-preview',
              isPortraitRatio(ratio) ? 'portrait' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ marginBottom: '0.85rem' }}
          >
            {currentTpl ? (
              <img src={api.assetUrl(currentTpl.preview_cover)} alt="" />
            ) : (
              <span className="empty">{tv("预览占位", "Giữ chỗ xem trước")}</span>
            )}
          </div>
          <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
            {tv("生成后可在分镜台查看真实画面。当前为模板预览。", "Sau khi tạo có thể xem hình thật ở bàn phân cảnh. Hiện là bản xem trước mẫu.")}
          </p>
          <h3 style={{ marginTop: '1rem' }}>{tv("当前配置概览", "Tổng quan cấu hình hiện tại")}</h3>
          <ul className="pf-meta-list">
            <li>
              <span>{tv("风格", "Phong cách")}</span>
              <span>{currentTpl?.name || '—'}</span>
            </li>
            <li>
              <span>{tv("角色", "Nhân vật")}</span>
              <span>{tv("AI 按模板与主题决定", "AI quyết định theo mẫu và chủ đề")}</span>
            </li>
            <li>
              <span>{tv("配音", "Lồng tiếng")}</span>
              <span>{selectedVoice?.label || tv('默认', 'Mặc định')}</span>
            </li>
            <li>
              <span>{tv("比例", "Tỷ lệ")}</span>
              <span>{ratio}</span>
            </li>
            <li>
              <span>{tv("成片", "Phim")}</span>
              <span>{pipelineMode === 'image_text' ? tv('静图成片', 'Phim từ ảnh tĩnh') : tv('AI 视频', 'Video AI')}</span>
            </li>
          </ul>
          {selectedVoice ? (
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-block pf-btn-sm pf-btn-icon"
              style={{ marginTop: '0.75rem' }}
              disabled={busy || previewBusy === voiceKey(selectedVoice)}
              onClick={(e) => previewVoice(selectedVoice, e)}
            >
              <IconPlay size={14} />
              {playingId === voiceKey(selectedVoice)
                ? tv('停止试听', 'Dừng nghe thử')
                : tv(`试听「${selectedVoice.label}」`, `Nghe thử “${selectedVoice.label}”`)}
            </button>
          ) : null}
          {error ? <BillingErrorNotice message={error} style={{ marginTop: '0.75rem' }} /> : null}
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-block pf-btn-lg pf-btn-icon"
            style={{ marginTop: '0.75rem' }}
            disabled={busy || Boolean(previewBusy)}
            onClick={generate}
          >
            {busy ? tv('启动中…', 'Đang khởi động…') : project.shots?.length ? tv('保存并继续', 'Lưu và tiếp tục') : tv('生成故事板', 'Tạo storyboard')}
            {!busy ? <span aria-hidden>→</span> : null}
          </button>
          <p className="pf-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            {tv("先生成分镜脚本，确认修改后再手动开始出图与配音。", "Trước tiên tạo kịch bản phân cảnh, xác nhận chỉnh sửa rồi tự bắt đầu tạo ảnh và lồng tiếng.")}
          </p>
        </aside>
      </div>
    </AppShell>
  )
}
