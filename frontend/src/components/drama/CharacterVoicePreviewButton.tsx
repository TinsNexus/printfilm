/** 角色音色试听按钮（卡片内联播放，不弹窗） */
import { useRef } from 'react'
import { Volume2 } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../api/drama'

type Props = {
  url: string
  label?: string
  className?: string
  size?: 'sm' | 'md'
  variant?: 'button' | 'chip' | 'inline'
  onError?: (message: string) => void
}

// 点击播放已绑定音色的试听音频
export function CharacterVoicePreviewButton({
  url,
  label,
  className = '',
  size = 'sm',
  variant = 'button',
  onError,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const src = resolveDramaMediaUrl(url)

  function handlePreview() {
    if (!src) {
      onError?.('试听地址无效')
      return
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
    } else {
      audioRef.current.src = src
    }
    void audioRef.current.play().catch(() => {
      onError?.('播放失败')
    })
  }

  if (!src) return null

  let btnClass = 'drama-voice-preview-btn'
  if (variant === 'button') {
    const sizeClass = size === 'md' ? 'pf-btn' : 'pf-btn pf-btn-sm'
    btnClass = `${sizeClass} drama-voice-preview-btn`
  } else if (variant === 'chip') {
    btnClass = 'fc-toolbar-chip'
  }
  if (className) {
    btnClass = `${btnClass} ${className}`
  }

  return (
    <button
      type="button"
      className={btnClass}
      onClick={(e) => {
        e.stopPropagation()
        handlePreview()
      }}
      title={label ? `试听：${label}` : '试听音色'}
    >
      <Volume2 size={14} strokeWidth={1.8} aria-hidden />
      试听
    </button>
  )
}
