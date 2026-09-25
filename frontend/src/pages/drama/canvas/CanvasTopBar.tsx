/** 画布顶栏：返回、标题、已保存指示、设置占位 */
import { useState } from 'react'
import { ChevronLeft, Maximize2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from './CanvasStore'
import { tr } from '../../../i18n/translate'

type Props = {
  variant?: 'fullscreen' | 'embedded'
}

/** 渲染画布页顶部工具栏 */
export function CanvasTopBar({ variant = 'fullscreen' }: Props) {
  const navigate = useNavigate()
  const { saveStatusVisible, projectId, freeCanvasMode } = useCanvasStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const embedded = variant === 'embedded'

  return (
    <>
      <div className="fc-overlay fc-topbar">
        <div className="fc-topbar-left">
          {embedded ? null : (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label={tr('canvasTop.back')}
              title={tr('canvasTop.back')}
              onClick={() => {
                if (freeCanvasMode) {
                  navigate('/drama')
                  return
                }
                if (window.history.length > 1) navigate(-1)
                else navigate(`/drama/projects/${projectId}`)
              }}
            >
              <ChevronLeft size={20} strokeWidth={1.8} />
            </button>
          )}
          <span className="fc-topbar-title">
            {embedded ? tr('canvasTop.assetCanvas') : freeCanvasMode ? tr('canvasTop.freeCanvas') : tr('canvasTop.libraryArrangement')}
          </span>
          {saveStatusVisible ? (
            <span className="fc-save-pill">
              <span className="fc-save-dot" />
              {tr('canvasTop.saved')}
            </span>
          ) : null}
        </div>

        <div className="fc-topbar-right">
          {embedded ? (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label={tr('canvasTop.fullscreenCanvas')}
              title={tr('canvasTop.fullscreenCanvas')}
              onClick={() => navigate(`/drama/projects/${projectId}/canvas`)}
            >
              <Maximize2 size={18} strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            className="fc-icon-btn"
            aria-label={tr('canvasTop.settings')}
            title={tr('canvasTop.settings')}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="fc-settings-pop" role="dialog" aria-label={tr('canvasTop.canvasSettings')}>
          <strong>{tr('canvasTop.canvasSettings')}</strong>
          {freeCanvasMode
            ? tr('canvasTop.addNodesConnectThem')
            : tr('canvasTop.layoutProjectAssetsSync')}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="fc-icon-btn is-sm"
              style={{ width: 'auto', padding: '0 12px', borderRadius: 10 }}
              onClick={() => setSettingsOpen(false)}
            >
              {tr('canvasTop.close')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
