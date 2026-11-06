import { workspaceScope } from '../../../features/teams/workspaceScope'
/** 画布顶栏：返回、标题、保存状态、设置占位 */
import { useState } from 'react'
import { ChevronLeft, Maximize2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCanvasStore } from './CanvasStore'
import type { CanvasSaveStatus } from './useCanvasAutoSave'
import { tv } from '../../../i18n/tv'

type Props = {
  variant?: 'fullscreen' | 'embedded'
}

/** 保存状态文案 */
function saveStatusLabel(status: CanvasSaveStatus): string | null {
  if (status === 'dirty') return tv('未保存', 'Chưa lưu')
  if (status === 'saving') return tv('保存中…', 'Đang lưu…')
  if (status === 'saved') return tv('已保存', 'Đã lưu')
  if (status === 'error') return tv('保存失败', 'Lưu thất bại')
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
              aria-label={tv("返回", "Quay lại")}
              title={tv("返回", "Quay lại")}
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
            {embedded ? tv('资产画布', 'Canvas tài sản') : freeCanvasMode ? tv('自由画布', 'Canvas tự do') : tv('资产库编排', 'Sắp xếp thư viện tài sản')}
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
              aria-label={tv("全屏画布", "Canvas toàn màn hình")}
              title={tv("全屏画布", "Canvas toàn màn hình")}
              onClick={() => navigate(`/drama/projects/${projectId}/canvas`)}
            >
              <Maximize2 size={18} strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            className="fc-icon-btn"
            aria-label={tv("设置", "Cài đặt")}
            title={tv("设置", "Cài đặt")}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="fc-settings-pop" role="dialog" aria-label={tv("画布设置", "Cài đặt canvas")}>
          <strong>{tv("画布设置", "Cài đặt canvas")}</strong>
          {freeCanvasMode
            ? tv('在画布上添加节点、连线并生成图片与视频。布局与资产会自动保存。', 'Thêm nút trên canvas, nối dây và tạo hình ảnh, video. Bố cục và tài sản tự động lưu.')
            : tv('布局与项目资产会自动同步保存。上传走 OSS；合成时按需拉本地缓存。', 'Bố cục và tài sản dự án tự động đồng bộ lưu. Tải lên qua OSS; khi ghép sẽ kéo bộ đệm cục bộ khi cần.')}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="fc-icon-btn is-sm"
              style={{ width: 'auto', padding: '0 12px', borderRadius: 10 }}
              onClick={() => setSettingsOpen(false)}
            >
              {tv("关闭", "Đóng")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
