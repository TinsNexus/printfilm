/** 画布顶栏：返回、标题、已保存指示、设置占位 */
import { useState } from 'react'
import { ChevronLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from './CanvasStore'

/** 渲染画布页顶部工具栏 */
export function CanvasTopBar() {
  const navigate = useNavigate()
  const { saveStatusVisible, projectId } = useCanvasStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <div className="fc-overlay fc-topbar">
        <div className="fc-topbar-left">
          <button
            type="button"
            className="fc-icon-btn"
            aria-label="返回"
            title="返回"
            onClick={() => {
              if (window.history.length > 1) navigate(-1)
              else navigate(`/drama/projects/${projectId}`)
            }}
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
          <span className="fc-topbar-title">资产库编排</span>
          {saveStatusVisible ? (
            <span className="fc-save-pill">
              <span className="fc-save-dot" />
              已保存
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className="fc-icon-btn"
          aria-label="设置"
          title="设置"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>

      {settingsOpen ? (
        <div className="fc-settings-pop" role="dialog" aria-label="画布设置">
          <strong>画布设置</strong>
          布局与项目资产会自动同步保存。上传走 OSS；合成时按需拉本地缓存。
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="fc-icon-btn is-sm"
              style={{ width: 'auto', padding: '0 12px', borderRadius: 10 }}
              onClick={() => setSettingsOpen(false)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
