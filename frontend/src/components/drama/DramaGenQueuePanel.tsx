/** 漫剧生图全局队列：右下角圆钮，点击展开约半屏高弹层 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageIcon, Trash2, X } from 'lucide-react'
import { useDramaImageGenQueue } from '../../hooks/useDramaImageGenQueue'
import { clearFinishedDramaImageGenJobs } from '../../lib/dramaImageGenQueue'
import '../../pages/drama/drama.css'

const OPEN_STORAGE_KEY = 'drama-gen-queue-fab-open'

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  failed: '失败',
}

const TYPE_LABEL: Record<string, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
  material: '素材',
}

// 读取上次展开偏好（默认折叠为圆钮）
function readOpenPreference(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// 渲染右下角生图队列 FAB + 半高弹层
export function DramaGenQueuePanel() {
  const queue = useDramaImageGenQueue()
  const [open, setOpen] = useState(readOpenPreference)

  const active = useMemo(
    () => queue.filter((j) => j.status === 'queued' || j.status === 'running'),
    [queue],
  )
  const finished = useMemo(
    () => queue.filter((j) => j.status === 'done' || j.status === 'failed'),
    [queue],
  )

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  if (queue.length === 0) return null

  const queuedOnly = queue.filter((j) => j.status === 'queued' || j.status === 'running')
  const badgeCount = active.length > 0 ? active.length : finished.length

  return (
    <div className="drama-gen-fab-root" aria-live="polite">
      {open ? (
        <div className="drama-gen-fab-panel" role="dialog" aria-label="生图队列">
          <header className="drama-gen-fab-head">
            <div className="drama-gen-fab-title">
              <ImageIcon size={18} strokeWidth={1.75} aria-hidden />
              <div>
                <strong>生图队列</strong>
                <span>
                  {active.length > 0
                    ? `${active.length} 项进行中`
                    : finished.length > 0
                      ? '全部完成'
                      : ''}
                </span>
              </div>
            </div>
            <div className="drama-gen-fab-actions">
              {finished.length > 0 && active.length === 0 ? (
                <button
                  type="button"
                  className="drama-gen-fab-icon-btn"
                  onClick={clearFinishedDramaImageGenJobs}
                  title="清空已完成"
                  aria-label="清空已完成"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
              <button
                type="button"
                className="drama-gen-fab-icon-btn"
                onClick={close}
                title="关闭队列"
                aria-label="关闭队列"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <ul className="drama-gen-fab-list">
            {queue.map((job) => {
              const queueIndex = queuedOnly.findIndex((j) => j.id === job.id)
              const typeLabel = TYPE_LABEL[job.assetType] || job.assetType
              return (
                <li key={job.id} className={`drama-gen-fab-item is-${job.status}`}>
                  <div className="drama-gen-fab-item-head">
                    <div className="drama-gen-fab-item-main">
                      <span className="drama-gen-fab-name">{job.assetName}</span>
                      <span className="drama-gen-fab-type">{typeLabel}</span>
                    </div>
                    <span className="drama-gen-fab-status">
                      {job.status === 'queued' && queueIndex >= 0
                        ? `排队 #${queueIndex + 1}`
                        : STATUS_LABEL[job.status]}
                    </span>
                  </div>
                  {job.status === 'failed' && job.error ? (
                    <p className="drama-gen-fab-error">{job.error}</p>
                  ) : null}
                  {(job.status === 'queued' || job.status === 'running') && (
                    <div className="drama-gen-fab-bar" aria-hidden />
                  )}
                </li>
              )
            })}
          </ul>

          {active.length > 0 ? (
            <footer className="drama-gen-fab-foot">
              <span className="drama-gen-fab-foot-dot" aria-hidden />
              串行生图，完成后自动处理下一项
            </footer>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={`drama-gen-fab-btn${active.length > 0 ? ' is-busy' : ''}`}
        onClick={toggleOpen}
        title={open ? '收起生图队列' : '展开生图队列'}
        aria-expanded={open}
        aria-label="生图队列"
      >
        <ImageIcon size={22} strokeWidth={1.75} aria-hidden />
        {badgeCount > 0 ? <span className="drama-gen-fab-badge">{badgeCount}</span> : null}
      </button>
    </div>
  )
}
