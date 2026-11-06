import { useEffect, useState, type FormEvent } from 'react'
import { request } from './api'

type Config = { version: number; names: string[] }

export default function CategoryForm() {
  const [config, setConfig] = useState<Config | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true; setError(''); setConfig(null)
    request<Config>('/api/admin/marketplace/categories').then(value => {
      if (active) { setConfig(value); setText(value.names.join('\n')) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [revision])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!config) return
    const names = text.split(/\r?\n/).map(name => name.trim()).filter(Boolean)
    if (!names.length || names.length > 30 || new Set(names).size !== names.length || names.some(name => name.length > 60)) {
      setError('Vui lòng nhập từ 1 đến 30 danh mục không trùng nhau, mỗi tên tối đa 60 ký tự.'); return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      const value = await request<Config>('/api/admin/marketplace/categories', 'PUT', { version: config.version, names })
      setConfig(value); setText(value.names.join('\n')); setMessage('Đã lưu danh mục, có hiệu lực sau khi người dùng làm mới quảng trường và trang đăng.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form className="market-ops-support" onSubmit={save}><h2>Cấu hình danh mục tác phẩm</h2><p>Tùy chọn danh mục của trang đăng và nhãn danh mục của quảng trường tác phẩm dùng chung cấu hình này. Mỗi dòng một danh mục, hiển thị theo thứ tự dòng.</p><label>Tên danh mục<textarea required rows={10} maxLength={1830} value={text} disabled={!config || busy} onChange={e => setText(e.target.value)} placeholder="Phim ngắn&#10;Quảng cáo&#10;Hoạt hình" /></label><p>Thêm một dòng để thêm danh mục, đổi thứ tự dòng để sắp xếp. Xóa hoặc đổi tên chỉ ảnh hưởng lựa chọn và lối vào danh mục về sau, danh mục của tác phẩm lịch sử không tự sửa; khi chỉnh sửa tác phẩm lịch sử có thể giữ danh mục gốc.</p><div className="flex gap-3"><button type="submit" disabled={!config || busy}>{busy ? 'Đang lưu…' : 'Lưu danh mục'}</button><button type="button" disabled={busy} onClick={() => { if (window.confirm('Tải lại sẽ bỏ các thay đổi chưa lưu, tiếp tục không?')) { setMessage(''); setRevision(v => v + 1) } }}>Tải lại</button></div>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</form>
}
