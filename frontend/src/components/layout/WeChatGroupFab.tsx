/** 全站右下角：微信用户群二维码入口（点击展开；URL 由后台站点配置下发） */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'

const FALLBACK_QR = '/wechat-group-qr.png'

/** API 根路径（空字符串 = 同源） */
function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE
  if (raw === undefined || raw === null) {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const { protocol, hostname } = window.location
      return `${protocol}//${hostname}:8000`
    }
    return 'http://127.0.0.1:8000'
  }
  return String(raw).replace(/\/$/, '')
}

/** 把 /static 相对路径拼到 API 基址；绝对 URL 原样返回 */
function resolveMediaUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    const base = apiBase()
    return base ? `${base}${trimmed}` : trimmed
  }
  return trimmed
}

/** 简易微信气泡图标 */
function WeChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M9.5 4C5.91 4 3 6.46 3 9.5c0 1.72.9 3.26 2.32 4.32L4.7 16.1l2.42-.72c.72.22 1.5.35 2.33.35.18 0 .35 0 .52-.02A4.9 4.9 0 0 1 9.5 14.5c0-2.99 2.8-5.4 6.25-5.4.1 0 .2 0 .3.01C15.4 5.9 12.7 4 9.5 4Zm-2.4 3.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.1 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z" />
      <path d="M15.75 10.1c-2.9 0-5.25 1.9-5.25 4.25S12.85 18.6 15.75 18.6c.62 0 1.21-.1 1.76-.27l1.95.58-.48-1.55c1.1-.82 1.82-2 1.82-3.31 0-2.35-2.35-4.25-5.05-4.25Zm-1.7 3.1a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Zm3.4 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Z" />
    </svg>
  )
}

export default function WeChatGroupFab() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [qrSrc, setQrSrc] = useState(FALLBACK_QR)
  const rootRef = useRef<HTMLDivElement>(null)

  // 从公开站点配置拉取后台可热更的二维码
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${apiBase()}/api/site-config`)
        if (!res.ok) return
        const data = (await res.json()) as { wechat_group_qr_url?: string }
        const resolved = resolveMediaUrl(data.wechat_group_qr_url || '')
        if (!cancelled && resolved) setQrSrc(resolved)
      } catch {
        /* 保持本地兜底图 */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // 点击浮层外关闭
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="pf-wx-fab-root" ref={rootRef}>
      {open ? (
        <div className="pf-wx-fab-panel" role="dialog" aria-label={t('wechatGroup.title')}>
          <header className="pf-wx-fab-head">
            <div>
              <strong>{t('wechatGroup.title')}</strong>
              <p>{t('wechatGroup.lead')}</p>
            </div>
            <button
              type="button"
              className="pf-wx-fab-close"
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </header>
          <div className="pf-wx-fab-qr">
            <img src={qrSrc} alt={t('wechatGroup.qrAlt')} width={200} height={200} />
          </div>
          <p className="pf-wx-fab-tip">{t('wechatGroup.tip')}</p>
        </div>
      ) : null}
      <button
        type="button"
        className={`pf-wx-fab-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('wechatGroup.open')}
        title={t('wechatGroup.open')}
      >
        <WeChatIcon />
        <span className="pf-wx-fab-label">{t('wechatGroup.short')}</span>
      </button>
    </div>
  )
}
