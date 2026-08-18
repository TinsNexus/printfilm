import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import BrandMark from '../components/BrandMark'
import LanguageSwitch from '../components/layout/LanguageSwitch'
import { useI18n } from '../i18n'

// 仅允许站内相对路径回跳，防止开放重定向
function safeNextPath(raw: string | null, fallback = '/') {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return fallback
  return raw
}

export default function AuthPage() {
  const nav = useNavigate()
  const { t } = useI18n()
  const [params] = useSearchParams()
  const nextPath = safeNextPath(params.get('next'), '/')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('demo@example.com')
  const [password, setPassword] = useState('demo1234')
  const [nickname, setNickname] = useState('创作者')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, nickname)
      localStorage.setItem('token', res.access_token)
      nav(nextPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.fail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-panel-top">
          <BrandMark />
          <LanguageSwitch />
        </div>
        <h1>{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
        <p className="lede">{t('auth.lede')}</p>
        <form onSubmit={onSubmit} className="stack">
          {mode === 'register' && (
            <label>
              {t('auth.nickname')}
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} required />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={loading}>
            {loading ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>
        <button
          type="button"
          className="linkish"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
        </button>
      </div>
      <div className="auth-visual" aria-hidden>
        <div className="ink-wash" />
      </div>
    </div>
  )
}

