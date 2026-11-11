import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template } from '../api'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import AppShell from '../components/layout/AppShell'
import { shortVideoCreatePath } from '../lib/shortVideoRoutes'
import { tv } from '../i18n/tv'

export default function TemplatesPage() {
  const nav = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const filtered = useMemo(() => {
    let list = templates
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(
        (t) => t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s),
      )
    }
    return list
  }, [templates, q])

  function openTemplate(t: Template) {
    const path = shortVideoCreatePath(t.id)
    nav(localStorage.getItem('token') ? path : `/auth?next=${encodeURIComponent(path)}`)
  }

  return (
    <AppShell active="templates">
      <div className="pf-section-head">
        <div>
          <h2>{tv("模板库", "Thư viện mẫu")}</h2>
          <p>{tv("四种精选动画与插画风格，从想法、文案分镜到画面配音，分步完成短片。默认使用 3D 动画。", "Bốn phong cách hoạt hình và minh họa chọn lọc, từ ý tưởng, lời dẫn và phân cảnh đến hình ảnh và lồng tiếng, hoàn thành phim ngắn từng bước. Mặc định dùng hoạt hình 3D.")}</p>
        </div>
      </div>
      <div className="pf-search" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tv("搜索模板名称或描述", "Tìm tên hoặc mô tả mẫu")}
        />
      </div>
      {error ? <BillingErrorNotice message={error} /> : null}
      <div className="pf-template-grid" style={{ marginTop: '1rem' }}>
        {filtered.map((t) => (
          <button key={t.id} type="button" className="pf-template-card" onClick={() => openTemplate(t)}>
            <img src={api.assetUrl(t.preview_cover)} alt="" />
            <div className="body">
              <h3>{t.name}</h3>
              <p>{t.description}</p>
              <div className="pf-tags">
                {t.category.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="pf-muted">{tv("没有匹配的模板。", "Không có mẫu phù hợp.")}</p> : null}
    </AppShell>
  )
}
