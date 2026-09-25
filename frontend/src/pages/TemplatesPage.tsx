import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Template } from '../api'
import BillingErrorNotice from '../components/billing/BillingErrorNotice'
import AppShell from '../components/layout/AppShell'
import PillTabs from '../components/ui/PillTabs'
import { useI18n } from '../i18n'
import { CATEGORY_ORDER, categoryLabel, homeCategoryLabel } from '../lib/categories'

export default function TemplatesPage() {
  const nav = useNavigate()
  const { t: tx } = useI18n()
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState('')
  const [category, setCategory] = useState('全部')
  const [q, setQ] = useState('')

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const categoryKeys = useMemo(() => {
    const found = new Set<string>()
    for (const t of templates) {
      for (const c of t.category || []) {
        if (CATEGORY_ORDER.includes(c)) found.add(c)
      }
    }
    return ['全部', ...CATEGORY_ORDER.filter((c) => found.has(c))]
  }, [templates])

  const categoryLabels = Object.fromEntries(categoryKeys.map((k) => [k, homeCategoryLabel(k)]))

  const filtered = useMemo(() => {
    let list = templates
    if (category !== '全部') list = list.filter((t) => (t.category || []).includes(category))
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(
        (t) => t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s),
      )
    }
    return list
  }, [templates, category, q])

  function openTemplate(t: Template) {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    nav(`/studio/new?template=${t.id}`)
  }

  return (
    <AppShell active="templates">
      <div className="pf-section-head">
        <div>
          <h2>{tx('templatesPage.title')}</h2>
          <p>{tx('templatesPage.lead')}</p>
        </div>
      </div>
      <div className="pf-search" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx('templatesPage.search')}
        />
      </div>
      <PillTabs
        items={categoryKeys}
        labels={categoryLabels}
        value={category}
        onChange={setCategory}
        ariaLabel={tx('studio.create.categoryAria')}
      />
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
                  <span key={c}>{categoryLabel(c)}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="pf-muted">{tx('templatesPage.empty')}</p> : null}
    </AppShell>
  )
}
