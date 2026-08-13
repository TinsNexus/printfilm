/** 全局漫剧资产库：按媒体类型浏览（布局对齐 P7） */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../../components/layout/AppShell'
import { dramaApi, resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import RequireAuth from './RequireAuth'
import './drama.css'

type AssetTabKey = 'all' | 'image' | 'video' | 'audio' | 'character' | 'font'

const TABS: Array<{ key: AssetTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'character', label: '角色' },
  { key: 'font', label: '字体' },
]

export default function AssetLibraryPage() {
  return (
    <RequireAuth>
      <AssetLibraryInner />
    </RequireAuth>
  )
}

// 根据 URL / type 粗分媒体类别
function mediaKind(asset: DramaAsset): AssetTabKey {
  const t = (asset.type || '').toLowerCase()
  if (t === 'character') return 'character'
  const url = `${asset.cover || ''} ${asset.url || ''}`.toLowerCase()
  if (/\.(mp4|webm|mov)(\?|$)/.test(url) || t === 'video') return 'video'
  if (/\.(mp3|wav|m4a|aac)(\?|$)/.test(url) || t === 'audio') return 'audio'
  if (/\.(ttf|otf|woff2?)(\?|$)/.test(url) || t === 'font') return 'font'
  return 'image'
}

function matchTab(asset: DramaAsset, tab: AssetTabKey): boolean {
  if (tab === 'all') return true
  return mediaKind(asset) === tab
}

function fileMeta(asset: DramaAsset): string {
  const url = (asset.cover || asset.url || '').toLowerCase()
  const ext = url.match(/\.([a-z0-9]{2,5})(\?|$)/)?.[1]
  if (ext) return `.${ext}`
  if (asset.type === 'character') return '角色'
  return asset.type || '文件'
}

// 渲染资产库内容
function AssetLibraryInner() {
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [tab, setTab] = useState<AssetTabKey>('all')
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
    <AppShell active="assets">
      <div className="drama-page pf-asset-page">
        <header className="pf-drama-list-head">
          <div className="pf-drama-list-title-row">
            <div>
              <h1>资产管理</h1>
              <p className="pf-muted" style={{ margin: '0.35rem 0 0' }}>
                图片、视频、音频、角色与字体素材
              </p>
            </div>
            <div className="pf-drama-list-actions">
              <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/history">
                我的项目
              </Link>
              <Link className="pf-btn pf-btn-ghost pf-btn-sm" to="/settings">
                个人中心
              </Link>
            </div>
          </div>

          <div className="pf-drama-list-toolbar">
            <div className="pf-pill-row" role="tablist" aria-label="资产分类">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  className={`pf-pill${tab === t.key ? ' active' : ''}`}
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="pf-drama-search">
              <span className="sr-only">搜索资产</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文件名或类型"
              />
            </label>
          </div>
        </header>

        {error ? <p className="drama-error">{error}</p> : null}

        <p className="pf-muted" style={{ marginBottom: '1rem' }}>
          共 {assets.length} 项 · 当前 {filtered.length} 项
        </p>

        {filtered.length === 0 ? (
          <div className="pf-empty-state is-compact">
            <p className="pf-muted">
              {tab === 'font' || tab === 'audio'
                ? '该分类暂无素材，后续将支持上传'
                : '暂无匹配资产'}
            </p>
          </div>
        ) : (
          <div className="pf-asset-grid">
            {filtered.map((asset) => {
              const mediaSrc = resolveDramaMediaUrl(asset.cover || asset.url)
              const kind = mediaKind(asset)
              return (
                <article key={asset.id} className="pf-asset-card">
                  <div className={`pf-asset-thumb is-${kind}`}>
                    {mediaSrc && (kind === 'image' || kind === 'character' || kind === 'video') ? (
                      kind === 'video' ? (
                        <video src={mediaSrc} muted playsInline />
                      ) : (
                        <img src={mediaSrc} alt="" />
                      )
                    ) : (
                      <span>{fileMeta(asset)}</span>
                    )}
                  </div>
                  <h3>{asset.name || '未命名'}</h3>
                  <p>
                    {fileMeta(asset)} · 项目 #{asset.project_id}
                  </p>
                  <Link className="pf-link" to={`/drama/projects/${asset.project_id}`}>
                    打开项目
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
