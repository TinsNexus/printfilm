import { workspaceScope } from '../../../features/teams/workspaceScope'
/** 画布顶栏：返回、标题、保存状态、设置占位 */
import { useState } from 'react'
import { ChevronLeft, Maximize2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from './CanvasStore'
import type { CanvasSaveStatus } from './useCanvasAutoSave'
import { tr } from '../../../i18n/translate.ts'

type Props = {
  variant?: 'fullscreen' | 'embedded'
}

/** 保存状态文案 */
function saveStatusLabel(status: CanvasSaveStatus): string | null {
  if (status === 'dirty') return tr('canvasTopBar.unsaved')
  if (status === 'saving') return tr('canvasTopBar.saving')
  if (status === 'saved') return tr('canvasTopBar.saved')
  if (status === 'error') return tr('canvasTopBar.saveFailed')
  return null
}

/** 渲染画布页顶部工具栏 */
export function CanvasTopBar({ variant = 'fullscreen' }: Props) {
  const navigate = useNavigate()
  const { saveStatus, projectId, freeCanvasMode } = useCanvasStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const embedded = variant === 'embedded'
  const statusText = saveStatusLabel(saveStatus)

  return (
    <>
      <div className="fc-overlay fc-topbar">
        <div className="fc-topbar-left">
          {embedded ? null : (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label={tr('canvasTopBar.back')}
              title={tr('canvasTopBar.back')}
              onClick={() => {
                if (freeCanvasMode) {
                  navigate(workspaceScope.teamId ? `/teams/${workspaceScope.teamId}?tab=projects` : '/canvas')
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
            {embedded ? tr('canvasTopBar.assetCanvas') : freeCanvasMode ? tr('canvasTopBar.freeCanvas') : tr('canvasTopBar.arrangeAssetLibrary')}
          </span>
          {statusText ? (
            <span
              className={`fc-save-pill${
                saveStatus === 'error'
                  ? ' is-error'
                  : saveStatus === 'dirty'
                    ? ' is-dirty'
                    : saveStatus === 'saving'
                      ? ' is-saving'
                      : ''
              }`}
            >
              <span className="fc-save-dot" />
              {statusText}
            </span>
          ) : null}
        </div>

        <div className="fc-topbar-right">
          {embedded ? (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label={tr('canvasTopBar.fullScreenCanvas')}
              title={tr('canvasTopBar.fullScreenCanvas')}
              onClick={() => navigate(`/drama/projects/${projectId}/canvas`)}
            >
              <Maximize2 size={18} strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            className="fc-icon-btn"
            aria-label={tr('canvasTopBar.settings')}
            title={tr('canvasTopBar.settings')}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="fc-settings-pop" role="dialog" aria-label={tr('canvasTopBar.canvasSettings')}>
          <strong>{tr('canvasTopBar.canvasSettings')}</strong>
          {freeCanvasMode
            ? tr('canvasTopBar.addNodesConnectThemGenerate')
            : tr('canvasTopBar.layoutProjectAssetsSyncAutomatically')}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="fc-icon-btn is-sm"
              style={{ width: 'auto', padding: '0 12px', borderRadius: 10 }}
              onClick={() => setSettingsOpen(false)}
            >
              {tr('canvasTopBar.close')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
