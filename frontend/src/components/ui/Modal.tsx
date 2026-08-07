import { useEffect, type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** wider preview / form shells */
  size?: 'md' | 'lg' | 'xl'
  /** center dialog (default) or right-side drawer */
  variant?: 'center' | 'drawer'
  /** prevent closing via backdrop / Escape while busy */
  dismissible?: boolean
  footer?: ReactNode
  className?: string
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'center',
  dismissible = true,
  footer,
  className = '',
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, dismissible, onClose])

  if (!open) return null

  const isDrawer = variant === 'drawer'

  return (
    <div
      className={['pf-dialog-root', isDrawer ? 'pf-dialog-root--drawer' : ''].filter(Boolean).join(' ')}
      role="presentation"
    >
      <div
        className="pf-dialog-veil"
        aria-hidden
        onMouseDown={() => {
          if (dismissible) onClose()
        }}
      />
      <div
        className={[
          'pf-modal-panel',
          isDrawer ? 'pf-modal-panel--drawer' : '',
          !isDrawer && size === 'lg' ? 'pf-modal-panel--lg' : '',
          !isDrawer && size === 'xl' ? 'pf-modal-panel--xl' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title || '对话框'}
      >
        {title ? (
          <header className="pf-modal-head">
            <h3>{title}</h3>
            {dismissible ? (
              <button type="button" className="pf-modal-close" onClick={onClose} aria-label="关闭">
                ×
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="pf-modal-body">{children}</div>
        {footer ? <footer className="pf-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}
