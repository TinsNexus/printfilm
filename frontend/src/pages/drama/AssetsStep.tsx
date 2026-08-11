/** 资产库步骤：进入时 seed，分类 Tab + 生图（含风格/模型/画幅） */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { dramaApi, type DramaAsset } from '../../api/drama'
import {
  defaultOptionsForAssetKind,
  type ImageGenerationOptions,
} from '../../lib/dramaGenerationOptions'
import { getImageStyleId } from './dramaWorkspaceUtils'
import { DramaImageGenOptionsBar } from './canvas/nodes/DramaImageGenOptionsBar'

type AssetTabKey = 'character' | 'scene' | 'prop' | 'material'

const ASSET_TABS: Array<{ key: AssetTabKey; label: string }> = [
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
  { key: 'material', label: '素材' },
]

type AssetsStepProps = {
  projectId: number
  onError: (m: string) => void
}

// 渲染资产库步骤
export function AssetsStep({ projectId, onError }: AssetsStepProps) {
  const [assets, setAssets] = useState<DramaAsset[]>([])
  const [tab, setTab] = useState<AssetTabKey>('character')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  // genOptions 工具栏生图选项
  const [genOptions, setGenOptions] = useState<ImageGenerationOptions>(() =>
    defaultOptionsForAssetKind('character'),
  )
  const seeded = useRef(false)

  useEffect(() => {
    async function enter() {
      setLoading(true)
      try {
        const project = await dramaApi.getProject(projectId).catch(() => null)
        const styleId = project ? getImageStyleId(project.script, project) : ''
        setGenOptions((prev) => ({
          ...defaultOptionsForAssetKind(tab),
          image_style_id: styleId || prev.image_style_id,
          model_id: prev.model_id,
          resolution: prev.resolution,
        }))
        if (!seeded.current) {
          seeded.current = true
          const seededAssets = await dramaApi.seedAssets(projectId)
          setAssets(seededAssets)
        } else {
          setAssets(await dramaApi.listAssets(projectId))
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : '资产加载失败')
        try {
          setAssets(await dramaApi.listAssets(projectId))
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false)
      }
    }
    void enter()
  }, [projectId, onError])

  useEffect(() => {
    setGenOptions((prev) => ({
      ...defaultOptionsForAssetKind(tab),
      image_style_id: prev.image_style_id,
      model_id: prev.model_id,
      resolution: prev.resolution,
    }))
  }, [tab])

  const filtered = assets.filter((a) => {
    const t = (a.type || '').toLowerCase()
    if (tab === 'material') return t === 'material' || t === 'none' || !t
    return t === tab
  })
  const pending = filtered.filter((a) => !(a.url || a.cover))

  // 持久化项目画面风格
  async function persistStyle(styleId: string) {
    try {
      await dramaApi.updateScript(projectId, { image_style_id: styleId })
    } catch (err) {
      onError(err instanceof Error ? err.message : '保存风格失败')
    }
  }

  // 生成单个资产形象（入队 worker 后轮询）
  async function genOne(asset: DramaAsset, options = genOptions) {
    setBusyId(asset.id)
    try {
      const prompt =
        String((asset.params as { visualImage?: string } | null)?.visualImage || '') ||
        `${asset.type} ${asset.name || ''}`
      await dramaApi.generateImage({
        project_id: projectId,
        asset_id: asset.id,
        prompt,
        name: asset.name || undefined,
        asset_type_kind: asset.type,
        image_style_id: options.image_style_id,
        model_id: options.model_id,
        aspect_ratio: options.aspect_ratio,
        resolution: options.resolution,
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        const list = await dramaApi.listAssets(projectId)
        setAssets(list)
        const latest = list.find((a) => a.id === asset.id)
        const gen = (latest?.params || {}).generation as
          | { status?: string; error?: string }
          | undefined
        const status = String(gen?.status || '')
        if (latest && (latest.url || latest.cover) && status !== 'generating') {
          return
        }
        if (status === 'failed') {
          throw new Error(String(gen?.error || '生图失败'))
        }
        if (status === 'done' && (latest?.url || latest?.cover)) {
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      throw new Error('生图超时，请刷新后重试')
    } catch (err) {
      onError(err instanceof Error ? err.message : '生图失败')
    } finally {
      setBusyId(null)
    }
  }

  // 一键生成无封面资产
  async function batchGenerate() {
    setBatchBusy(true)
    try {
      for (const asset of pending) {
        await genOne(asset, {
          ...genOptions,
          ...defaultOptionsForAssetKind(asset.type),
          image_style_id: genOptions.image_style_id,
          model_id: genOptions.model_id,
          resolution: genOptions.resolution,
        })
      }
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className="drama-assets-step">
      <div className="drama-assets-toolbar">
        <div className="drama-asset-tabs">
          {ASSET_TABS.map((t) => (
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
        <div className="drama-actions">
          <button
            type="button"
            className="drama-btn-primary"
            disabled={batchBusy || pending.length === 0}
            onClick={() => void batchGenerate()}
          >
            {batchBusy ? '生成中…' : '一键生成'}
          </button>
          <Link className="pf-btn" to={`/drama/projects/${projectId}/canvas`}>
            打开画布
          </Link>
        </div>
      </div>

      <div className="drama-assets-gen-opts">
        <DramaImageGenOptionsBar
          value={genOptions}
          onChange={setGenOptions}
          disabled={batchBusy || busyId != null}
          onStylePersist={persistStyle}
        />
      </div>

      {loading ? <p className="drama-muted">正在从剧本抽取资产…</p> : null}

      <div className="drama-asset-grid">
        {filtered.map((asset) => (
          <article key={asset.id} className="drama-asset-card">
            {asset.cover || asset.url ? (
              <img src={asset.cover || asset.url || ''} alt={asset.name || ''} />
            ) : (
              <div className="drama-asset-placeholder">{asset.type || 'asset'}</div>
            )}
            <h3>{asset.name || '未命名'}</h3>
            <p>{asset.type}</p>
            <button
              type="button"
              className="pf-btn pf-btn-sm"
              disabled={busyId === asset.id || batchBusy}
              onClick={() => void genOne(asset)}
            >
              {busyId === asset.id ? '生成中…' : '生成形象'}
            </button>
          </article>
        ))}
      </div>
      {!loading && filtered.length === 0 ? <p className="drama-muted">该分类暂无资产</p> : null}
    </div>
  )
}
