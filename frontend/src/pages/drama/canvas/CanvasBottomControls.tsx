/** 画布左下角缩放与撤销控制条 */
import { useCallback, useState } from 'react'
import { LocateFixed, Magnet, Map, Minus, Plus, Redo2, Scan, Undo2 } from 'lucide-react'
import { useOnViewportChange, useReactFlow } from '@xyflow/react'
import { useCanvasStore } from './CanvasStore'
import { tv } from '../../../i18n/tv'

/** 渲染画布左下角控制条 */
export function CanvasBottomControls() {
  const {
    snapToGrid,
    showMinimap,
    canUndo,
    canRedo,
    toggleSnapToGrid,
    toggleMinimap,
    undo,
    redo,
  } = useCanvasStore()
  const { zoomIn, zoomOut, fitView, setViewport, getViewport } = useReactFlow()
  const [zoomPercent, setZoomPercent] = useState(100)

  useOnViewportChange({
    onChange: (viewport) => {
      setZoomPercent(Math.round(viewport.zoom * 100))
    },
  })

  const handleResetZoom = useCallback(() => {
    const viewport = getViewport()
    void setViewport({ ...viewport, zoom: 1 }, { duration: 200 })
  }, [getViewport, setViewport])

  return (
    <div className="fc-overlay fc-bottom-controls">
      <div className="fc-bottom-bar">
        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("撤销", "Hoàn tác")}
          title={tv("撤销", "Hoàn tác")}
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("重做", "Làm lại")}
          title={tv("重做", "Làm lại")}
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 size={16} strokeWidth={1.8} />
        </button>

        <span className="fc-bottom-sep" />

        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("定位到内容", "Định vị đến nội dung")}
          title={tv("定位到内容", "Định vị đến nội dung")}
          onClick={() => void fitView({ duration: 200 })}
        >
          <LocateFixed size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("适应画布", "Vừa canvas")}
          title={tv("适应画布", "Vừa canvas")}
          onClick={() => void fitView({ duration: 200, padding: 0.2 })}
        >
          <Scan size={16} strokeWidth={1.8} />
        </button>

        <span className="fc-bottom-sep" />

        <button
          type="button"
          className={`fc-icon-btn is-sm${snapToGrid ? ' is-active' : ''}`}
          aria-label={snapToGrid ? tv('关闭网格吸附', 'Tắt bám lưới') : tv('开启网格吸附', 'Bật bám lưới')}
          title={snapToGrid ? tv('关闭网格吸附', 'Tắt bám lưới') : tv('开启网格吸附', 'Bật bám lưới')}
          aria-pressed={snapToGrid}
          onClick={toggleSnapToGrid}
        >
          <Magnet size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className={`fc-icon-btn is-sm${showMinimap ? ' is-active' : ''}`}
          aria-label={showMinimap ? tv('关闭小地图', 'Tắt bản đồ nhỏ') : tv('开启小地图', 'Bật bản đồ nhỏ')}
          title={showMinimap ? tv('关闭小地图', 'Tắt bản đồ nhỏ') : tv('开启小地图', 'Bật bản đồ nhỏ')}
          aria-pressed={showMinimap}
          onClick={toggleMinimap}
        >
          <Map size={16} strokeWidth={1.8} />
        </button>

        <span className="fc-bottom-sep" />

        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("缩小", "Thu nhỏ")}
          title={tv("缩小", "Thu nhỏ")}
          onClick={() => zoomOut({ duration: 150 })}
        >
          <Minus size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="fc-zoom-label"
          aria-label={tv("重置缩放", "Đặt lại thu phóng")}
          title={tv("重置缩放", "Đặt lại thu phóng")}
          onClick={handleResetZoom}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className="fc-icon-btn is-sm"
          aria-label={tv("放大", "Phóng to")}
          title={tv("放大", "Phóng to")}
          onClick={() => zoomIn({ duration: 150 })}
        >
          <Plus size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
