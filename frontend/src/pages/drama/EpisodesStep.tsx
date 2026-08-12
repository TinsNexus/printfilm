/** 分集视频步骤：进入时按剧本切分镜，支持强制重切 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dramaApi, type DramaEpisode } from '../../api/drama'
import { dialog } from '../../lib/dialog'

type EpisodesStepProps = {
  projectId: number
  onError: (m: string) => void
}

// 渲染分集视频步骤
export function EpisodesStep({ projectId, onError }: EpisodesStepProps) {
  const navigate = useNavigate()
  /*
   * episodes 分集列表
   * loading 加载中
   * reseeding 强制重切中
   * seeded 是否已执行过进页 seed
   */
  const [episodes, setEpisodes] = useState<DramaEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [reseeding, setReseeding] = useState(false)
  const seeded = useRef(false)

  useEffect(() => {
    seeded.current = false
  }, [projectId])

  // 拉取 / 切分分镜
  async function loadEpisodes(force = false) {
    const rows = await dramaApi.seedEpisodes(projectId, force)
    setEpisodes(rows)
    return rows
  }

  useEffect(() => {
    async function enter() {
      setLoading(true)
      try {
        if (!seeded.current) {
          seeded.current = true
          // 进页自动检测旧场记分镜并重切（后端 force=false 时也会 auto-replan）
          await loadEpisodes(false)
        } else {
          setEpisodes(await dramaApi.listEpisodes(projectId))
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : '分集加载失败')
        try {
          setEpisodes(await dramaApi.listEpisodes(projectId))
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false)
      }
    }
    void enter()
  }, [projectId, onError])

  // 按最新分集剧本强制重切全部分镜
  async function handleReseed() {
    if (reseeding) return
    const ok = await dialog.confirm({
      title: '重新切分分镜',
      message:
        '将按最新分集剧本重新切分镜（已生成视频的分集也会重写），是否继续？',
      confirmText: '继续切分',
      tone: 'danger',
    })
    if (!ok) return
    setReseeding(true)
    try {
      const rows = await loadEpisodes(true)
      await dialog.alert({
        title: '切分完成',
        message: `已更新 ${rows.length} 集分镜，可进入各集编辑查看。`,
        tone: 'success',
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : '重新切分失败')
    } finally {
      setReseeding(false)
    }
  }

  return (
    <div className="drama-episodes-step">
      <div className="drama-episodes-head">
        <div>
          <h2>分集视频</h2>
          <p className="drama-muted">共 {episodes.length} 集</p>
        </div>
        <button
          type="button"
          className="drama-btn-primary"
          disabled={reseeding}
          onClick={() => void handleReseed()}
        >
          {reseeding ? '切分中…' : '重新切分分镜'}
        </button>
      </div>
      {loading ? <p className="drama-muted">正在创建分集与分镜…</p> : null}
      <div className="drama-episode-cards">
        {episodes.map((ep) => (
          <article key={ep.id} className="drama-episode-card">
            <div className="drama-episode-card-thumb" aria-hidden>
              ▶
            </div>
            <div className="drama-episode-card-body">
              <strong>{ep.name}</strong>
              <span>{ep.fragments?.length || 0} 个分镜</span>
            </div>
            <button
              type="button"
              className="drama-btn-primary"
              onClick={() => navigate(`/drama/projects/${projectId}/episodes/${ep.id}`)}
            >
              编辑
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
