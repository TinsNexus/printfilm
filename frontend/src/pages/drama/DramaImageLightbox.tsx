/** 资产图片全屏放大预览（点击遮罩 / Esc 关闭） */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { tr } from '../../i18n/translate'

type Props = {
  src: string
  alt?: string
  onClose: () => void
}

// 渲染图片放大层
export function DramaImageLightbox({ src, alt = tr('lib.preview3'), onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return createPortal(
    <div
      className="drama-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr('lib.imagePreview')}
      onClick={onClose}
    >
      <button type="button" className="drama-lightbox-close" aria-label={tr('lib.close')} onClick={onClose}>
        ×
      </button>
      <img
        className="drama-lightbox-img"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
