import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import BrandMark from '../components/BrandMark'
import LanguageSwitch from '../components/layout/LanguageSwitch'
import { useI18n } from '../i18n'
import { isValidAuthPassword, isValidEmailInput } from '../lib/validateAuthForm'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const trimmedEmail = email.trim()
    if (mode === 'register' && !nickname.trim()) {
      setError(t('auth.nicknameRequired'))
      return
    }
    if (!isValidEmailInput(trimmedEmail)) {
      setError(t('auth.emailInvalid'))
      return
    }
    if (!isValidAuthPassword(password)) {
      setError(password.length > 64 ? t('auth.passwordTooLong') : t('auth.passwordTooShort'))
      return
    }

    setLoading(true)
    try {
      const res =
        mode === 'login'
          ? await api.login(trimmedEmail, password)
          : await api.register(trimmedEmail, password, nickname.trim())
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
        <form onSubmit={onSubmit} className="stack" noValidate>
          {mode === 'register' && (
            <label>
              {t('auth.nickname')}
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError('')
              }}
            />
          </label>
          <label>
            {t('auth.password')}
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
            />
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn primary" disabled={loading}>
            {loading ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
            setNickname('')
          }}
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

