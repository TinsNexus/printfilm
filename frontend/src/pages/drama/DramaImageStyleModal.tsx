/** 画面风格选择：触发器 + Modal 卡片网格 */
import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { DramaImageStyleCardGrid } from '../../components/drama/DramaImageStyleCardGrid'
import { DramaImageStylePreviewImg } from '../../components/drama/DramaImageStylePreviewImg'
import Modal from '../../components/ui/Modal'
import { getImageStyleLabel, type ImageStyleId } from '../../lib/dramaImageStyles'
import { tv } from '../../i18n/tv'

type Props = {
  value: ImageStyleId | ''
  onChange: (id: ImageStyleId | '') => void
  disabled?: boolean
  /** toolbar：列表页胶囊按钮；field：大纲页带缩略图字段 */
  variant?: 'toolbar' | 'field'
  /** field 变体左侧文案，默认「项目风格」 */
  fieldLabel?: string
  /** Modal 标题 */
  title?: string
  /** 未选时的触发文案 */
  emptyLabel?: string
}

// 渲染风格库触发器与画面风格 Modal
export function DramaImageStyleModal({
  value,
  onChange,
  disabled = false,
  variant = 'toolbar',
  fieldLabel = tv('项目风格', 'Phong cách dự án'),
  title = tv('画面风格', 'Phong cách hình ảnh'),
  emptyLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const styleLabel = getImageStyleLabel(value)
  const triggerLabel = styleLabel || emptyLabel || (variant === 'field' ? tv('选择风格', 'Chọn phong cách') : tv('风格库', 'Thư viện phong cách'))
  const active = Boolean(value) || open

  // 选中风格并关闭
  function select(id: ImageStyleId | '') {
    onChange(id)
    setOpen(false)
  }

  return (
    <>
      {variant === 'field' ? (
        <div className="drama-style-picker-field">
          <span className="drama-style-picker-field-label">{fieldLabel}</span>
          <button
            type="button"
            className={`drama-style-picker-trigger${active ? ' is-active' : ''}`}
            disabled={disabled}
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {value ? (
              <span className="drama-style-picker-thumb" aria-hidden>
                <DramaImageStylePreviewImg styleId={value} alt="" loading="lazy" />
              </span>
            ) : (
              <span className="drama-style-picker-thumb is-empty" aria-hidden />
            )}
            <span className="drama-style-picker-text">{triggerLabel}</span>
            <ChevronDown size={14} strokeWidth={2} className={open ? 'is-open' : undefined} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`drama-agent-opt-trigger${active ? ' is-active' : ''}`}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <BookOpen size={15} strokeWidth={1.8} />
          <span className="drama-agent-opt-label">{triggerLabel}</span>
          <ChevronDown size={13} strokeWidth={2} />
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="md" className="drama-style-modal">
        {/* 封面即画风参考图，避免用户以为只是缩略预览 */}
        <p className="drama-style-modal-hint">
          {tv("封面图会作为画风参考一并提交。模型只借色调、笔触和光影，不会照抄封面里的人物或构图。", "Ảnh bìa sẽ được gửi cùng làm tham chiếu phong cách hình ảnh. Model chỉ mượn tông màu, nét bút và ánh sáng, không sao chép nhân vật hay bố cục trong ảnh bìa.")}
        </p>
        <DramaImageStyleCardGrid value={value} onChange={select} noneLabel={tv("无风格", "Không có phong cách")} />
      </Modal>
    </>
  )
}
