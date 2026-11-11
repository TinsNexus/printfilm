/** 生成页输入 @ 时弹出的提及层：从已加入的参考资料中选择并插入提及。 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AudioLines, ImagePlus, Search, Video } from 'lucide-react'
import { resolveToolMediaUrl } from '../../api/tools'
import type { GenerationReference, GenerationReferenceKind } from '../../lib/generationReferences'
import type { MentionCaretRect } from '../../lib/promptMention'
import '../../styles/generation-references.css'
import { tr } from '../../i18n/translate.ts'

type Props = {
  open: boolean
  items: GenerationReference[]
  anchorRect: MentionCaretRect | null
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (reference: GenerationReference) => void
  onClose: () => void
}

const KIND_ICON: Record<GenerationReferenceKind, typeof ImagePlus> = { image: ImagePlus, video: Video, audio: AudioLines }

/** 光标锚定的参考资料提及弹层，键盘与鼠标均可选择。 */
export default function PromptMentionPopover({ open, items, anchorRect, activeIndex, onActiveIndexChange, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // 点击弹层外部关闭
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null
      if (panelRef.current && target && !panelRef.current.contains(target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  if (!open || !anchorRect) return null

  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 360)
  const left = Math.min(Math.max(12, anchorRect.left), window.innerWidth - 320)

  return createPortal(
    <div ref={panelRef} className="gen-mention-pop" style={{ top, left }} role="listbox" aria-label={tr('promptMentionPopover.referenceMaterial')}>
      <p className="gen-mention-pop-heading"><Search size={13} aria-hidden />{tr('promptMentionPopover.mentionAddedReferenceMaterial')}</p>
      {items.length === 0 ? (
        <p className="gen-mention-pop-empty">{tr('promptMentionPopover.noMatchingReferencesUploadPick')}</p>
      ) : (
        <div className="gen-mention-pop-list">
          {items.map((reference, index) => {
            const Icon = KIND_ICON[reference.kind]
            const preview = resolveToolMediaUrl(reference.url)
            return (
              <button
                key={reference.id}
                type="button"
                className={`gen-mention-pop-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => onActiveIndexChange(index)}
                onClick={() => onSelect(reference)}
              >
                <span className="gen-mention-pop-thumb">{preview ? <img src={preview} alt="" /> : <Icon size={15} aria-hidden />}</span>
                <span className="gen-mention-pop-meta">
                  <strong>{reference.name}</strong>
                  <em>{reference.kind === 'image' ? tr('promptMentionPopover.image') : reference.kind === 'video' ? tr('promptMentionPopover.video') : tr('promptMentionPopover.audio')}</em>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body,
  )
}
