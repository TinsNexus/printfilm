/** 全局漫剧资产库：角色 / 场景 / 道具 / 素材 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../../components/layout/AppShell'
import { dramaApi, type DramaAsset } from '../../api/drama'
import RequireAuth from './RequireAuth'
import './drama.css'

type AssetTabKey = 'character' | 'scene' | 'prop' | 'material'

const TABS: Array<{ key: AssetTabKey; label: string }> = [
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
  { key: 'material', label: '素材' },
]

export default function AssetLibraryPage() {
  return (
    <RequireAuth>
      <AssetLibraryInner />
    </RequireAuth>
  )
}

// 匹配资产到 Tab（type=none 归入素材）
function matchTab(asset: DramaAsset, tab: AssetTabKey): boolean {
  const t = (asset.type || '').toLowerCase()
  if (tab === 'material') return t === 'material' || t === 'none' || !t
  return t === tab
}

// 渲染资产库内容
function AssetLibraryInner() {
  /*
   * assets 全部资产
   * tab 当前分类
   * query 搜索关键词
   * error 错误文案
   */
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [tab, setTab] = useState<AssetTabKey>('character')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    dramaApi
      .listAssets()
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (!matchTab(asset, tab)) return false
      if (!q) return true
      const name = (asset.name || '').toLowerCase()
      const type = (asset.type || '').toLowerCase()
      return name.includes(q) || type.includes(q) || String(asset.project_id).includes(q)
    })
  }, [assets, tab, query])

  return (
    <AppShell active="drama">
      <div className="drama-page">
        <header className="drama-header">
          <div>
            <h1>资产库</h1>
            <p className="drama-muted">跨项目角色 / 场景 / 道具 / 素材</p>
          </div>
        </header>

        <div className="drama-library-toolbar">
          <div className="drama-asset-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? 'active' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className="drama-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称、类型或项目 ID"
          />
        </div>

        {error ? <p className="drama-error">{error}</p> : null}

        <div className="drama-asset-grid">
          {filtered.map((asset) => (
            <article key={asset.id} className="drama-asset-card">
              {asset.cover || asset.url ? (
                <img src={asset.cover || asset.url || ''} alt={asset.name || ''} />
              ) : (
                <div className="drama-asset-placeholder">{asset.type || 'asset'}</div>
              )}
              <h3>{asset.name || '未命名'}</h3>
              <p>
                {asset.type === 'none' ? '素材' : asset.type} · 项目 #{asset.project_id}
              </p>
              <Link className="pf-link" to={`/drama/projects/${asset.project_id}`}>
                打开项目
              </Link>
            </article>
          ))}
        </div>
        {filtered.length === 0 ? <p className="drama-muted">暂无匹配资产</p> : null}
      </div>
    </AppShell>
  )
}
