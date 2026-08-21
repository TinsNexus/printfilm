/** 生成失败原因：只展示可读错误，不展示队列/平台任务状态 */
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { tasksApi, type TaskRunOut } from '../../api/tasks'
import { formatDramaGenError, pickRootDramaGenError } from '../../lib/dramaGenError'
import type { DramaGenJob } from '../../lib/dramaGenQueue'

type Props = {
  job: DramaGenJob
  onClose: () => void
}

// 拉取该目标相关的多条历史任务（用于挖出被「重试超限」覆盖的根因）
async function listRelatedTasks(job: DramaGenJob): Promise<TaskRunOut[]> {
  if (job.kind === 'video' && job.targetId > 0) {
    const list = await tasksApi.list({
      domain: 'drama',
      task_type: 'fragment_video',
      target_type: 'fragment',
      target_id: job.targetId,
      page: 1,
      page_size: 20,
    })
    return list.items || []
  }
  if (job.kind === 'image' && job.targetId > 0) {
    const list = await tasksApi.list({
      domain: 'drama',
      target_type: 'asset',
      target_id: job.targetId,
      page: 1,
      page_size: 20,
    })
    return list.items || []
  }
  if (job.taskId && job.taskId > 0) {
    try {
      const one = await tasksApi.get(job.taskId)
      return one ? [one] : []
    } catch {
      return []
    }
  }
  return []
}

// 失败原因抽屉（错误文案为主）
export function DramaGenTaskDetail({ job, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [rawError, setRawError] = useState(job.error || '')
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRawError(job.error || '')
    setLoading(true)
    void (async () => {
      try {
        const tasks = await listRelatedTasks(job)
        if (cancelled) return
        const candidates: Array<string | null | undefined> = [job.error]
        for (const task of tasks) {
          candidates.push(task.error_message)
        }
        let best = pickRootDramaGenError(candidates)
        // list 无 events 时，若仍是包装句再拉几条详情
        if (!best || /重试超过|超过上限/.test(best)) {
          for (const task of tasks.slice(0, 5)) {
            if (!task.id) continue
            try {
              const detail = await tasksApi.get(task.id)
              if (cancelled) return
              candidates.push(detail.error_message)
              for (const ev of detail.events || []) {
                candidates.push(ev.message)
              }
            } catch {
              /* ignore */
            }
          }
          best = pickRootDramaGenError(candidates)
        }
        if (best) setRawError(best)
      } catch {
        /* 无平台任务时仍用 job.error */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [job])

  const errView = formatDramaGenError(rawError || job.message)

  return (
    <div className="drama-gen-detail" role="dialog" aria-label="失败原因">
      <header className="drama-gen-detail-head">
        <div>
          <strong>失败原因</strong>
          <span>{job.title}</span>
        </div>
        <button type="button" className="drama-gen-fab-icon-btn" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </header>

      <div className="drama-gen-detail-body">
        {loading ? (
          <div className="drama-gen-detail-loading">
            <Loader2 size={18} className="drama-gen-detail-spin" />
            <span>正在解析错误…</span>
          </div>
        ) : null}

        <section className="drama-gen-detail-card is-error">
          <h4>{errView.title}</h4>
          <p>{errView.message}</p>
          {errView.suggestion ? (
            <p className="drama-gen-detail-tip">
              <strong>建议：</strong>
              {errView.suggestion}
            </p>
          ) : null}
          {rawError ? (
            <button
              type="button"
              className="drama-gen-detail-raw-toggle"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? '收起原始错误' : '查看原始错误'}
            </button>
          ) : null}
          {showRaw && rawError ? <pre className="drama-gen-detail-raw">{rawError}</pre> : null}
        </section>
      </div>
    </div>
  )
}
