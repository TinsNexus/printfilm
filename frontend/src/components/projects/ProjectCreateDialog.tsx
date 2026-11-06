import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Clapperboard, LayoutGrid, LoaderCircle, Sparkles } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { DramaImageStyleModal } from '../../pages/drama/DramaImageStyleModal'
import { PROJECT_EPISODE_MAX, validateProjectCreate, type ProjectCreateConstraints, type ProjectCreateDraft, type ProjectCreateErrors, type ProjectCreateValues } from '../../lib/projectCreateForm'
import './project-create.css'
import { tv } from '../../i18n/tv'

export type { ProjectCreateValues } from '../../lib/projectCreateForm'

export type ProjectCreateDialogProps = ProjectCreateConstraints & {
  open: boolean
  onClose: () => void
  onSubmit: (values: ProjectCreateValues) => Promise<void>
  contextLabel?: string
  allowImageStyle?: boolean
  submitLabel?: string
  footerNote?: string
}

/** 个人、团队和自由画布共用创建流程，关闭后清空草稿。 */
export default function ProjectCreateDialog({ open, ...props }: ProjectCreateDialogProps) {
  // Unmount the form on close so a new opening always starts with clean inputs.
  return open ? <ProjectCreateDialogForm key={`${props.kind}:${props.contextLabel || ''}`} {...props} /> : null
}

/** 故事与项目名称为主栏，集数和画风在旁栏统一配置。 */
function ProjectCreateDialogForm({
  onClose,
  onSubmit,
  kind,
  contextLabel = tv('个人空间', 'Không gian cá nhân'),
  titleRequired = false,
  titleMaxLength = 80,
  sourceMaxLength = 2000,
  allowImageStyle = true,
  submitLabel,
  footerNote,
}: Omit<ProjectCreateDialogProps, 'open'>) {
  const formId = useId()
  const canvas = kind === 'canvas'
  /* 保留集数输入原文，允许用户清空后重新输入；提交时统一校验。 */
  const [draft, setDraft] = useState<ProjectCreateDraft>({ title: canvas ? tv('未命名画布', 'Canvas chưa đặt tên') : '', source: '', description: '', imageStyleId: '', episodeCount: '1' })
  const [errors, setErrors] = useState<ProjectCreateErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const Icon = canvas ? LayoutGrid : Clapperboard
  const title = canvas ? tv('新建自由画布', 'Tạo canvas tự do mới') : tv('新建项目', 'Tạo dự án mới')
  const sourceLength = draft.source.trim().length

  /** 修改字段后清理对应错误，保留其他输入。 */
  function update<K extends keyof ProjectCreateDraft>(key: K, value: ProjectCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }))
    setError('')
  }

  /** 先校验并定位错误，再防重提交，失败时保留草稿。 */
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const result = validateProjectCreate(draft, { kind, titleRequired, titleMaxLength, sourceMaxLength })
    setErrors(result.errors)
    if (Object.keys(result.errors).length) {
      const field = Object.keys(result.errors)[0]
      const input = document.getElementById(`${formId}-${field}`)
      const details = input?.closest('details')
      if (details) details.open = true
      input?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try { await onSubmit(result.values) }
    catch (cause) { setError(cause instanceof Error ? cause.message : tv('创建失败，请重试', 'Tạo thất bại, vui lòng thử lại')) }
    finally { submitting.current = false; setBusy(false) }
  }

  const fieldError = (name: keyof ProjectCreateErrors) => errors[name] ? <span className="pf-project-create-field-error" id={`${formId}-${name}-error`} role="alert">{errors[name]}</span> : null

  return <Modal open onClose={onClose} dismissible={!busy} title={title} size="lg" className="pf-project-create-modal" footer={<>
    <p className="pf-project-create-footer-note">{footerNote || (canvas ? tv('先创建画布，再自由添加图片、视频与灵感。', 'Tạo canvas trước, rồi tự do thêm hình ảnh, video và cảm hứng.') : tv('按故事与集数创建项目，进入后继续完善分集。', 'Tạo dự án theo câu chuyện và số tập, vào rồi tiếp tục hoàn thiện các tập.'))}</p>
    <div className="pf-project-create-actions"><Button onClick={onClose} disabled={busy}>{tv("取消", "Hủy")}</Button><Button variant="lime" type="submit" form={formId} disabled={busy}>{busy ? <><LoaderCircle size={16} className="pf-project-create-spinner" />{tv("正在创建…", "Đang tạo…")}</> : <>{submitLabel || (canvas ? tv('创建画布', 'Tạo canvas') : tv('创建项目', 'Tạo dự án'))}<ArrowUpRight size={16} /></>}</Button></div>
  </>}>
    <form id={formId} className="pf-project-create-form" onSubmit={submit} noValidate aria-busy={busy}>
      <div className="pf-project-create-intro">
        <span className="pf-project-create-icon"><Icon size={23} strokeWidth={1.6} aria-hidden /></span>
        <div><span className="pf-project-create-context">{contextLabel}{!canvas && <span className="pf-project-create-mode">{tv("漫剧自建算力模式", "Phim truyện chế độ máy tính tự xây")}</span>}</span><h4>{canvas ? tv('给灵感一张自由的画布', 'Trao cho cảm hứng một canvas tự do') : tv('从一个好故事开始', 'Bắt đầu từ một câu chuyện hay')}</h4><p>{canvas ? tv('把图片、视频和想法放在一起，自由连接与创作。', 'Đặt hình ảnh, video và ý tưởng cùng nhau, tự do kết nối và sáng tạo.') : tv('写下故事，设定集数与画风，开始构建你的作品。', 'Viết câu chuyện, đặt số tập và phong cách hình ảnh, bắt đầu xây dựng tác phẩm của bạn.')}</p></div>
      </div>

      <div className={`pf-project-create-layout${canvas ? ' pf-project-create-layout--canvas' : ''}`}>
        <div className="pf-project-create-main">
          <label className="pf-project-create-field" htmlFor={`${formId}-title`}>
            <span className="pf-project-create-label">{canvas ? tv('画布名称', 'Tên canvas') : tv('项目名称', 'Tên dự án')}{!canvas && !titleRequired && <small>{tv("选填，留空自动命名", "Tùy chọn, để trống sẽ tự đặt tên")}</small>}</span>
            <input id={`${formId}-title`} autoFocus value={draft.title} disabled={busy} onChange={(event) => update('title', event.target.value)} placeholder={canvas ? tv('为这张画布取个名字', 'Đặt tên cho canvas này') : tv('例如：雨夜来信', 'Ví dụ: Lá thư đêm mưa')} maxLength={titleMaxLength} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${formId}-title-error` : undefined} required={canvas || titleRequired} />{fieldError('title')}
          </label>

          {!canvas && <label className="pf-project-create-field pf-project-create-story" htmlFor={`${formId}-source`}>
            <span className="pf-project-create-label">{tv("故事内容", "Nội dung câu chuyện")}<span className="pf-project-create-required">{tv("必填", "Bắt buộc")}</span></span>
            <textarea id={`${formId}-source`} value={draft.source} disabled={busy} onChange={(event) => update('source', event.target.value)} rows={8} placeholder={tv('故事从谁开始？发生了什么冲突？\n\n写下创意，或粘贴已有故事与剧本。', 'Câu chuyện bắt đầu từ ai? Xảy ra xung đột gì?\n\nViết ý tưởng, hoặc dán câu chuyện và kịch bản có sẵn.')} maxLength={sourceMaxLength} aria-invalid={!!errors.source} aria-describedby={`${formId}-source-hint${errors.source ? ` ${formId}-source-error` : ''}`} required />
            <span className={`pf-project-create-input-meta${sourceLength >= 20 ? ' is-ready' : ''}`} id={`${formId}-source-hint`}><span>{sourceLength >= 20 ? <><Check size={13} />{tv("故事已就绪", "Câu chuyện đã sẵn sàng")}</> : tv('至少 20 字，包含人物与核心冲突', 'Ít nhất 20 chữ, gồm nhân vật và xung đột cốt lõi')}</span><span>{sourceLength.toLocaleString()} / {sourceMaxLength.toLocaleString()}</span></span>{fieldError('source')}
          </label>}

          <details className="pf-project-create-description" open={canvas || undefined}>
            <summary>{canvas ? tv('画布说明', 'Mô tả canvas') : tv('补充项目简介', 'Bổ sung giới thiệu dự án')}<span>{tv("选填", "Tùy chọn")}</span></summary>
            <label className="pf-project-create-field" htmlFor={`${formId}-description`}><span className="pf-project-create-sr-only">{canvas ? tv('画布说明', 'Mô tả canvas') : tv('项目简介', 'Giới thiệu dự án')}</span><textarea id={`${formId}-description`} value={draft.description} onChange={(event) => update('description', event.target.value)} rows={3} maxLength={500} disabled={busy} placeholder={canvas ? tv('这张画布想探索什么？', 'Canvas này muốn khám phá điều gì?') : tv('用一两句话概括作品，方便在项目列表中识别。', 'Tóm tắt tác phẩm trong một hai câu để dễ nhận biết trong danh sách dự án.')} aria-invalid={!!errors.description} aria-describedby={errors.description ? `${formId}-description-error` : undefined} /><span className="pf-project-create-input-meta"><span>{tv("会显示在项目卡片中", "Sẽ hiển thị trên thẻ dự án")}</span><span>{draft.description.trim().length} / 500</span></span>{fieldError('description')}</label>
          </details>
        </div>

        {!canvas && <aside className="pf-project-create-settings" aria-label={tv("创作设置", "Cài đặt sáng tạo")}>
          <div className="pf-project-create-episodes">
            <label className="pf-project-create-label" htmlFor={`${formId}-episodeCount`}>{tv("初始集数", "Số tập ban đầu")}<small>1–{PROJECT_EPISODE_MAX} {tv("集", "tập")}</small></label>
            <div className="pf-project-create-episode-presets" role="group" aria-label={tv("常用集数", "Số tập thường dùng")}>
              {[1, 3, 6, 12].map((count) => <button key={count} type="button" aria-pressed={Number(draft.episodeCount) === count} disabled={busy} onClick={() => update('episodeCount', String(count))}>{count}<span>{tv("集", "tập")}</span></button>)}
            </div>
            <div className="pf-project-create-episode-input"><input id={`${formId}-episodeCount`} type="number" inputMode="numeric" min={1} max={PROJECT_EPISODE_MAX} step={1} value={draft.episodeCount} disabled={busy} onChange={(event) => update('episodeCount', event.target.value)} aria-invalid={!!errors.episodeCount} aria-describedby={`${formId}-episodeCount-hint${errors.episodeCount ? ` ${formId}-episodeCount-error` : ''}`} required /><span>{tv("集", "tập")}</span></div>
            <p id={`${formId}-episodeCount-hint`}>{tv("支持自定义集数，后续可在项目中继续增加分集。", "Hỗ trợ số tập tùy chỉnh, sau này có thể tiếp tục thêm tập trong dự án.")}</p>{fieldError('episodeCount')}
          </div>
          {allowImageStyle && <div className="pf-project-create-style"><span className="pf-project-create-label"><Sparkles size={14} aria-hidden />{tv("画面风格", "Phong cách hình ảnh")}<small>{tv("选填", "Tùy chọn")}</small></span><DramaImageStyleModal value={draft.imageStyleId} onChange={(value) => update('imageStyleId', value)} disabled={busy} variant="field" fieldLabel="" emptyLabel={tv("选择画面风格", "Chọn phong cách hình ảnh")} /><p>{tv("为角色和场景设置统一的视觉方向。", "Đặt hướng thị giác thống nhất cho nhân vật và bối cảnh.")}</p></div>}
        </aside>}
      </div>
      {error && <div className="pf-project-create-error" role="alert">{error}</div>}
    </form>
  </Modal>
}
