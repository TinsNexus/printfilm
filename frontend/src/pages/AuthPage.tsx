import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import BrandMark from '../components/BrandMark'

export default function AuthPage() {
  const nav = useNavigate()
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
      nav('/studio/new')
    } catch (err) {
      setError(err instanceof Error ? err.message : '失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <BrandMark />
        <h1>{mode === 'login' ? '回到工作台' : '创建创作者账号'}</h1>
        <p className="lede">PRINTFILM 科普视频平台 · 主题进，成片出</p>
        <form onSubmit={onSubmit} className="stack">
          {mode === 'register' && (
            <label>
              昵称
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} required />
            </label>
          )}
          <label>
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            密码
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
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
        <button
          type="button"
          className="linkish"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
      <div className="auth-visual" aria-hidden>
        <div className="ink-wash" />
      </div>
    </div>
  )
}
