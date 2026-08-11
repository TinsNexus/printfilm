/** 画布左侧垂直居中工具栏与添加节点面板 */
import { useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { useCanvasStore } from './CanvasStore'
import { ADD_NODE_OPTIONS, CANVAS_NODE_OPTION_BY_KIND, type CanvasNodeKind } from './canvasTypes'

type CanvasLeftToolbarProps = {
  onSelectNode: (kind: CanvasNodeKind) => void
}

/** 渲染画布左侧浮动工具栏 */
export function CanvasLeftToolbar({ onSelectNode }: CanvasLeftToolbarProps) {
  const { nodes, requestFocusNode } = useCanvasStore()
  const [panelOpen, setPanelOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)

  return (
    <div className="fc-overlay fc-left-toolbar">
      <div className="fc-left-stack">
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => setPanelOpen(true)}
          onMouseLeave={() => setPanelOpen(false)}
        >
          <button
            type="button"
            className="fc-icon-btn is-primary"
            aria-label={panelOpen ? '关闭添加节点' : '添加节点'}
            aria-expanded={panelOpen}
            title="添加节点"
          >
            {panelOpen ? <X size={18} strokeWidth={2} /> : <Plus size={18} strokeWidth={2} />}
          </button>

          {panelOpen ? (
            <div className="fc-add-panel">
              {ADD_NODE_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSelectNode(option.id)
                      setPanelOpen(false)
                    }}
                  >
                    <span className="fc-add-panel-icon">
                      <Icon size={14} strokeWidth={1.8} />
                    </span>
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`fc-icon-btn${folderOpen ? ' is-active' : ''}`}
          aria-label="资产文件夹"
          title="资产文件夹"
          aria-expanded={folderOpen}
          onClick={() => setFolderOpen((v) => !v)}
        >
          <FolderOpen size={18} strokeWidth={1.8} />
        </button>

        {folderOpen ? (
          <div className="fc-folder-panel" role="dialog" aria-label="画布节点列表">
            <h4>画布节点</h4>
            {nodes.length === 0 ? (
              <p className="fc-folder-empty">暂无节点，点击 + 添加</p>
            ) : (
              nodes.map((node) => {
                const option = CANVAS_NODE_OPTION_BY_KIND[node.data.kind]
                const Icon = option.icon
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="fc-folder-item"
                    onClick={() => {
                      requestFocusNode(node.id)
                      setFolderOpen(false)
                    }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                    <span>
                      {option.label} · {node.data.label}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
