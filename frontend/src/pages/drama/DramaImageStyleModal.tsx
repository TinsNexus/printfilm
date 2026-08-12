/** 画面风格选择：触发按钮 + 全局 Modal 缩略图网格 */
import { useState } from 'react'
import { BookOpen, Check, ChevronDown } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import {
  getImageStyleLabel,
  IMAGE_STYLE_OPTIONS,
  type ImageStyleId,
} from '../../lib/dramaImageStyles'
import {
  getDramaImageStylePreviewFallbackUrl,
  getDramaImageStylePreviewUrl,
} from '../../lib/dramaImageStylePreviews'

type Props = {
  value: ImageStyleId | ''
  onChange: (id: ImageStyleId | '') => void
  disabled?: boolean
}

// 渲染风格库触发器与画面风格 Modal
export function DramaImageStyleModal({ value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const label = getImageStyleLabel(value) || '风格库'
  const active = Boolean(value) || open

  // 选中风格并关闭
  function select(id: ImageStyleId | '') {
    onChange(id)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={`drama-agent-opt-trigger${active ? ' is-active' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={15} strokeWidth={1.8} />
        <span className="drama-agent-opt-label">{label}</span>
        <ChevronDown size={13} strokeWidth={2} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="画面风格" size="md" className="drama-style-modal">
        <div className="drama-style-modal-grid">
          <button
            type="button"
            className={`drama-style-modal-none${!value ? ' is-selected' : ''}`}
            onClick={() => select('')}
          >
            {!value ? <Check className="drama-style-modal-check" size={12} strokeWidth={2.5} /> : null}
            无风格
          </button>
          {IMAGE_STYLE_OPTIONS.map((opt) => {
            const selected = value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                className={`drama-style-modal-card${selected ? ' is-selected' : ''}`}
                onClick={() => select(opt.id)}
              >
                <img
                  src={getDramaImageStylePreviewUrl(opt.id)}
                  alt={opt.label}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget
                    const fallback = getDramaImageStylePreviewFallbackUrl(opt.id)
                    if (!img.src.endsWith('.svg')) img.src = fallback
                  }}
                />
                <span>{opt.label}</span>
                {selected ? (
                  <Check className="drama-style-modal-check on-media" size={12} strokeWidth={2.5} />
                ) : null}
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
