/** 分集编辑：输入 @ 时弹出的资产 / 时长选择层 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, LayoutGrid, Timer, User } from 'lucide-react'
import { resolveDramaMediaUrl, type DramaAsset } from '../../api/drama'
import {
  DURATION_PRESET_OPTIONS,
  FRAGMENT_CONTENT_DURATION_MAX,
  type MentionCaretRect,
} from '../../lib/dramaEpisodePromptEditor'
import type { AssetScope } from './dramaEpisodeEditUtils'

type Props = {
  open: boolean
  query: string
  scope: AssetScope
  assets: DramaAsset[]
  referencedIds: Set<number>
  anchorRect: MentionCaretRect | null
  activeIndex: number
  contentDurationTotal: number
  onScopeChange: (scope: AssetScope) => void
  onActiveIndexChange: (index: number) => void
  onItemsCountChange: (count: number) => void
  onSelectAsset: (asset: DramaAsset) => void
  onSelectDuration: (seconds: number) => void
  onClose: () => void
}

type TabKey = 'assets' | 'tools'
type ToolsView = 'list' | 'duration'

const TYPE_LABEL: Record<string, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
  material: '素材',
}

// 渲染 @ 引用弹层
export function EpisodeEditMentionPopover({
  open,
  query,
  scope,
  assets,
  referencedIds,
  anchorRect,
  activeIndex,
  contentDurationTotal,
  onScopeChange,
  onActiveIndexChange,
  onItemsCountChange,
  onSelectAsset,
  onSelectDuration,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<TabKey>('assets')
  const [toolsView, setToolsView] = useState<ToolsView>('list')
  const [customDuration, setCustomDuration] = useState('')

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = assets
    if (scope === 'episode') {
      list = list.filter((a) => referencedIds.has(a.id))
      // 本集无引用时回退全剧，避免空列表无法插入
      if (list.length === 0) list = assets
    }
    if (!q) return list
    return list.filter((a) => (a.name || '').toLowerCase().includes(q) || String(a.id).includes(q))
  }, [assets, query, referencedIds, scope])

  useEffect(() => {
    onItemsCountChange(tab === 'assets' ? filteredAssets.length : 0)
  }, [filteredAssets.length, onItemsCountChange, tab])

  useEffect(() => {
    if (!open) {
      setTab('assets')
      setToolsView('list')
      setCustomDuration('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  if (!open || !anchorRect) return null

  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 360)
  const left = Math.min(Math.max(12, anchorRect.left), window.innerWidth - 340)

  const remaining = Math.max(0, FRAGMENT_CONTENT_DURATION_MAX - contentDurationTotal)

  return createPortal(
    <div
      ref={panelRef}
      className="drama-ep-mention-pop"
      style={{ top, left }}
      role="listbox"
      aria-label="@ 引用"
    >
      <div className="drama-ep-mention-pop-tabs">
        <button
          type="button"
          className={tab === 'assets' ? 'is-active' : ''}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab('assets')}
        >
          <LayoutGrid size={14} />
          资产
        </button>
        <button
          type="button"
          className={tab === 'tools' ? 'is-active' : ''}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTab('tools')
            setToolsView('list')
          }}
        >
          <Timer size={14} />
          小工具
        </button>
      </div>

      {tab === 'assets' ? (
        <>
          <div className="drama-ep-mention-pop-scopes">
            <button
              type="button"
              className={scope === 'episode' ? 'is-active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onScopeChange('episode')}
            >
              本集
            </button>
            <button
              type="button"
              className={scope === 'series' ? 'is-active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onScopeChange('series')}
            >
              全剧
            </button>
          </div>
          <div className="drama-ep-mention-pop-list">
            {filteredAssets.length === 0 ? (
              <p className="drama-ep-mention-pop-empty">无匹配资产</p>
            ) : (
              filteredAssets.map((asset, index) => {
                const preview = resolveDramaMediaUrl(asset.cover || asset.url)
                const typeKey = asset.asset_type || asset.type
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`drama-ep-mention-pop-item${index === activeIndex ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => onActiveIndexChange(index)}
                    onClick={() => onSelectAsset(asset)}
                  >
                    <span className="drama-ep-mention-pop-thumb">
                      {preview ? (
                        <img src={preview} alt="" />
                      ) : (
                        <User size={16} strokeWidth={1.6} />
                      )}
                    </span>
                    <span className="drama-ep-mention-pop-meta">
                      <strong>{asset.name || `资产 ${asset.id}`}</strong>
                      <em>{TYPE_LABEL[typeKey] || typeKey}</em>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </>
      ) : toolsView === 'list' ? (
        <div className="drama-ep-mention-pop-tools">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setToolsView('duration')}
          >
            <Clapperboard size={16} />
            <span>
              <strong>插入时长</strong>
              <em>剩余可用 {remaining}s</em>
            </span>
          </button>
        </div>
      ) : (
        <div className="drama-ep-mention-pop-duration">
          <div className="drama-ep-mention-pop-duration-presets">
            {DURATION_PRESET_OPTIONS.map((sec) => {
              const disabled = sec > remaining
              return (
                <button
                  key={sec}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectDuration(sec)}
                >
                  {sec}s
                </button>
              )
            })}
          </div>
          <div className="drama-ep-mention-pop-duration-custom">
            <input
              type="number"
              min={1}
              max={remaining || FRAGMENT_CONTENT_DURATION_MAX}
              placeholder="自定义秒数"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const sec = Number(customDuration)
                if (!Number.isFinite(sec) || sec <= 0 || sec > remaining) return
                onSelectDuration(sec)
              }}
            >
              插入
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
