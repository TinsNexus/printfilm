/** 分集视频步骤：进页规则切分；支持全集规则重切与单集 AI 分镜 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, Film, Layers, Sparkles, Wand2 } from 'lucide-react'
import { dramaApi, resolveDramaMediaUrl, type DramaEpisode } from '../../api/drama'
import { dialog } from '../../lib/dialog'
import { loadDramaEpisodes } from '../../lib/dramaStoryboardNav'
import { readEpisodeSubtitleMode, subtitleModeUsesModelOutput } from '../../lib/dramaSubtitleSettings'
import { FragmentPlanSkillModal } from '../../components/drama/FragmentPlanSkillModal'
import { readFragmentGenerationStatus } from './dramaEpisodeEditUtils'
import { tv } from '../../i18n/tv'

type EpisodesStepProps = {
  projectId: number
  onError: (m: string) => void
}

type EpisodeSummary = {
  epNo: number
  fragmentCount: number
  videoDone: number
  videoRunning: number
  videoFailed: number
  totalSec: number
  previewUrl: string
  planStatus: string
}

// 读取分集 AI 分镜状态
function readPlanStatus(ep: DramaEpisode): string {
  const active = (ep.active_tasks || []).find((task) => task.task_type === 'fragment_plan')
  if (
    active &&
    !active.cancel_requested &&
    ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(active.status)
  ) {
    return 'generating'
  }
  const st = ep.params?.fragment_plan_status
  return typeof st === 'string' ? st : ''
}

// 汇总单集分镜与视频进度
function summarizeEpisode(ep: DramaEpisode): EpisodeSummary {
  const frags = ep.fragments || []
  const activeFragmentIds = new Set<number>()
  for (const task of ep.active_tasks || []) {
    if (
      task.task_type === 'fragment_video' &&
      typeof task.fragment_id === 'number' &&
      !task.cancel_requested &&
      ['pending', 'leased', 'running', 'awaiting_poll', 'awaiting_review'].includes(task.status)
    ) {
      activeFragmentIds.add(task.fragment_id)
    }
  }
  let videoDone = 0
  let videoRunning = 0
  let videoFailed = 0
  let totalSec = 0
  let previewUrl = ''
  for (const frag of frags) {
    totalSec += frag.duration_sec && frag.duration_sec > 0 ? frag.duration_sec : 8
    const st = readFragmentGenerationStatus(frag).status
    if (st === 'done') videoDone += 1
    else if (st === 'queued' || st === 'running' || st === 'generating' || activeFragmentIds.has(frag.id))
      videoRunning += 1
    else if (st === 'failed') videoFailed += 1
    if (!previewUrl) {
      const raw = (frag.cover || frag.video || '').trim()
      if (raw) previewUrl = resolveDramaMediaUrl(raw)
    }
  }
  const epNo = Number(ep.params?.episodeNumber) || 0
  return {
    epNo,
    fragmentCount: frags.length,
    videoDone,
    videoRunning,
    videoFailed,
    totalSec,
    previewUrl,
    planStatus: readPlanStatus(ep),
  }
}

// 分集标题竖排展示用（过长截断）
function verticalTitleLabel(name: string, max = 14): string {
  const clean = (name || '').replace(/\s+/g, '')
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

// 渲染分集视频步骤
export function EpisodesStep({ projectId, onError }: EpisodesStepProps) {
  const navigate = useNavigate()
  const [episodes, setEpisodes] = useState<DramaEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [reseeding, setReseeding] = useState(false)
  const [planningId, setPlanningId] = useState<number | null>(null)
  // planTarget 待确认 AI 分镜的分集
  const [planTarget, setPlanTarget] = useState<DramaEpisode | null>(null)
  const seeded = useRef(false)

  useEffect(() => {
    seeded.current = false
  }, [projectId])

  // 进页只读已有分集；force 才按剧本重切
  async function loadEpisodes(force = false) {
    const rows = await loadDramaEpisodes(projectId, force)
    setEpisodes(rows)
    return rows
  }

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function enter(initial: boolean) {
      if (initial) setLoading(true)
      try {
        let rows: DramaEpisode[]
        if (initial && !seeded.current) {
          seeded.current = true
          rows = await loadEpisodes(false)
        } else {
          rows = await dramaApi.listEpisodes(projectId)
          if (!cancelled) setEpisodes(rows)
        }
        if (cancelled) return
        const anyPlanning = rows.some((ep) => readPlanStatus(ep) === 'generating')
        if (anyPlanning) {
          timer = window.setTimeout(() => {
            void enter(false)
          }, 2500)
        }
      } catch (err) {
        if (initial) onError(err instanceof Error ? err.message : tv('分集加载失败', 'Tải tập thất bại'))
        try {
          const rows = await dramaApi.listEpisodes(projectId)
          if (!cancelled) setEpisodes(rows)
        } catch {
          /* ignore */
        }
      } finally {
        if (initial && !cancelled) setLoading(false)
      }
    }
    void enter(true)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [projectId, onError])

  async function handleReseed() {
    if (reseeding || planningId != null) return
    const ok = await dialog.confirm({
      title: tv('规则重切全部分镜', 'Chia lại toàn bộ phân cảnh theo quy tắc'),
      message:
        tv('将按规则引擎快速重切全部分镜（含已编辑、已生成视频的分集）。单集精细分镜请用「AI 分镜」。是否继续？', 'Sẽ chia lại nhanh toàn bộ phân cảnh bằng bộ máy quy tắc (gồm cả các tập đã chỉnh sửa, đã tạo video). Phân cảnh chi tiết cho từng tập hãy dùng “AI 分镜”. Tiếp tục không?'),
      confirmText: tv('继续切分', 'Tiếp tục chia'),
      tone: 'danger',
    })
    if (!ok) return
    setReseeding(true)
    try {
      const rows = await loadEpisodes(true)
      await dialog.alert({
        title: tv('切分完成', 'Chia xong'),
        message: tv(`已更新 ${rows.length} 集分镜，可进入各集编辑查看。`, `Đã cập nhật phân cảnh của ${rows.length} tập, có thể vào từng tập để chỉnh sửa và xem.`),
        tone: 'success',
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('重新切分失败', 'Chia lại thất bại'))
    } finally {
      setReseeding(false)
    }
  }

  // 打开 AI 分镜确认弹窗（勾选 Skill）
  function handlePlanEpisode(ep: DramaEpisode) {
    if (reseeding || planningId != null) return
    setPlanTarget(ep)
  }

  // 入队单集 LLM 分镜并轮询（字幕方式沿用该集当前设置）
  async function startPlanEpisode(ep: DramaEpisode, skillIds: number[]) {
    setPlanTarget(null)
    setPlanningId(ep.id)
    try {
      const subtitleMode = readEpisodeSubtitleMode(ep.params)
      await dramaApi.planEpisodeFragments(ep.id, {
        force: true,
        fallback_rules: true,
        skill_ids: skillIds,
        subtitle_enabled: subtitleModeUsesModelOutput(subtitleMode),
      })
      const started = Date.now()
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500))
        const cur = await dramaApi.getEpisode(ep.id)
        const st = readPlanStatus(cur)
        if (st === 'completed') {
          setEpisodes((prev) => prev.map((row) => (row.id === cur.id ? cur : row)))
          const count = Number(cur.params?.fragment_plan_count) || (cur.fragments || []).length
          const mode = String(cur.params?.fragment_plan_mode || 'llm')
          await dialog.alert({
            title: tv('分镜完成', 'Chia phân cảnh xong'),
            message:
              mode === 'rules_fallback'
                ? tv(`「${cur.name}」已回退规则切分，共 ${count} 条。`, `“${cur.name}” đã lùi về chia theo quy tắc, tổng ${count} mục.`)
                : tv(`「${cur.name}」AI 分镜完成，共 ${count} 条。`, `“${cur.name}” AI chia phân cảnh xong, tổng ${count} mục.`),
            tone: 'success',
          })
          return
        }
        if (st === 'failed') {
          throw new Error(String(cur.params?.fragment_plan_error || tv('AI 分镜失败', 'AI chia phân cảnh thất bại')))
        }
      }
      throw new Error(tv('AI 分镜超时，请稍后刷新', 'AI chia phân cảnh quá thời gian, vui lòng làm mới sau'))
    } catch (err) {
      onError(err instanceof Error ? err.message : tv('AI 分镜失败', 'AI chia phân cảnh thất bại'))
    } finally {
      setPlanningId(null)
    }
  }

  const totalFragments = episodes.reduce((n, ep) => n + (ep.fragments?.length || 0), 0)
  const totalVideos = episodes.reduce(
    (n, ep) =>
      n + (ep.fragments || []).filter((f) => readFragmentGenerationStatus(f).status === 'done').length,
    0,
  )

  return (
    <div className="drama-episodes-step">
      <header className="drama-episodes-hero">
        <div className="drama-episodes-hero-main">
          <div className="drama-episodes-hero-icon" aria-hidden>
            <Film size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h2>{tv("分集视频", "Video tập")}</h2>
            <p className="drama-episodes-hero-sub">
              {tv("共", "Tổng")} <strong>{episodes.length}</strong> {tv("集 ·", "·")}{' '}
              <strong>{totalFragments}</strong> {tv("个分镜 · 已出片", "phân cảnh · Đã ra phim")}{' '}
              <strong>{totalVideos}</strong>
            </p>
          </div>
        </div>
        <div className="drama-episodes-hero-actions">
          <button
            type="button"
            className="drama-btn-ghost drama-episodes-reseed-btn"
            disabled={reseeding || planningId != null || loading}
            onClick={() => void handleReseed()}
          >
            <Layers size={16} strokeWidth={1.75} aria-hidden />
            {reseeding ? tv('切分中…', 'Đang chia…') : tv('规则重切全部', 'Chia lại toàn bộ theo quy tắc')}
          </button>
        </div>
      </header>

      <div className="drama-episodes-tips" role="note">
        <Sparkles size={15} strokeWidth={1.75} aria-hidden />
        <span>{tv("单集可点", "Từng tập có thể bấm")} <strong>AI 分镜</strong> {tv("精细规划；进入", "lập kế hoạch chi tiết; vào")} <strong>{tv("编辑", "Chỉnh sửa")}</strong> {tv("可改脚本并生成视频。", "có thể sửa kịch bản và tạo video.")}</span>
      </div>

      {loading ? (
        <div className="drama-episode-grid" aria-busy="true" aria-label={tv("加载分集", "Tải các tập")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="drama-ep-card drama-ep-card-skeleton" />
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <div className="drama-episodes-empty">
          <Clapperboard size={40} strokeWidth={1.25} aria-hidden />
          <p>{tv("暂无分集，请先完成分集剧本步骤。", "Chưa có tập, vui lòng hoàn tất bước kịch bản tập trước.")}</p>
        </div>
      ) : (
        <div className="drama-episode-grid">
          {episodes.map((ep) => {
            const summary = summarizeEpisode(ep)
            const planning = planningId === ep.id || summary.planStatus === 'generating'
            const progress =
              summary.fragmentCount > 0
                ? Math.round((summary.videoDone / summary.fragmentCount) * 100)
                : 0
            const epLabel =
              summary.epNo > 0 ? tv(`第 ${summary.epNo} 集`, `Tập ${summary.epNo}`) : tv(`分集 ${ep.id}`, `Tập ${ep.id}`)
            const statusLabel = planning
              ? tv('AI 分镜中…', 'AI đang chia phân cảnh…')
              : summary.planStatus === 'failed'
                ? tv('分镜失败', 'Chia phân cảnh thất bại')
                : summary.videoRunning > 0
                  ? tv(`${summary.videoRunning} 条生成中`, `${summary.videoRunning} mục đang tạo`)
                  : summary.videoFailed > 0
                    ? tv(`${summary.videoFailed} 条失败`, `${summary.videoFailed} mục thất bại`)
                    : summary.videoDone > 0
                      ? tv(`已出片 ${summary.videoDone}/${summary.fragmentCount}`, `Đã ra phim ${summary.videoDone}/${summary.fragmentCount}`)
                      : summary.planStatus === 'completed'
                        ? tv(`${summary.fragmentCount} 个分镜`, `${summary.fragmentCount} phân cảnh`)
                        : summary.fragmentCount > 0
                          ? tv(`${summary.fragmentCount} 个分镜`, `${summary.fragmentCount} phân cảnh`)
                          : tv('待 AI 分镜', 'Chờ AI chia phân cảnh')

            return (
              <article
                key={ep.id}
                className={`drama-ep-card${planning ? ' is-planning' : ''}${
                  summary.videoRunning > 0 ? ' is-generating' : ''
                }`}
              >
                <button
                  type="button"
                  className="drama-ep-card-poster"
                  onClick={() => navigate(`/drama/projects/${projectId}/episodes/${ep.id}`)}
                  aria-label={tv(`编辑 ${ep.name}`, `Chỉnh sửa ${ep.name}`)}
                >
                  {summary.previewUrl ? (
                    <img src={summary.previewUrl} alt="" className="drama-ep-card-poster-img" />
                  ) : (
                    <div className="drama-ep-card-poster-fallback">
                      <span className="drama-ep-card-poster-vertical">
                        {verticalTitleLabel(ep.name)}
                      </span>
                    </div>
                  )}
                  <span className="drama-ep-card-ep-badge">{epLabel}</span>
                  {summary.previewUrl ? (
                    <span className="drama-ep-card-play" aria-hidden>
                      <Film size={18} strokeWidth={1.75} />
                    </span>
                  ) : null}
                  {summary.videoRunning > 0 ? (
                    <span className="drama-ep-card-busy" aria-hidden />
                  ) : null}
                </button>

                <div className="drama-ep-card-body">
                  <h3 className="drama-ep-card-title">{ep.name}</h3>
                  <div className="drama-ep-card-meta">
                    <span className="drama-ep-card-meta-item">
                      <Layers size={14} strokeWidth={1.75} aria-hidden />
                      {statusLabel}
                    </span>
                    {summary.totalSec > 0 ? (
                      <span className="drama-ep-card-meta-item">
                        <Clapperboard size={14} strokeWidth={1.75} aria-hidden />
                        {tv("约", "Khoảng")} {summary.totalSec}s
                      </span>
                    ) : null}
                  </div>
                  {summary.fragmentCount > 0 ? (
                    <div className="drama-ep-card-progress" aria-hidden>
                      <div
                        className="drama-ep-card-progress-bar"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="drama-ep-card-actions">
                  <button
                    type="button"
                    className="drama-ep-card-ai-btn"
                    disabled={reseeding || planningId != null}
                    onClick={() => void handlePlanEpisode(ep)}
                  >
                    <Wand2 size={15} strokeWidth={1.75} aria-hidden />
                    {planning ? tv('AI 分镜中…', 'AI đang chia phân cảnh…') : 'AI 分镜'}
                  </button>
                  <button
                    type="button"
                    className="drama-btn-primary drama-ep-card-edit-btn"
                    disabled={planning}
                    onClick={() => navigate(`/drama/projects/${projectId}/episodes/${ep.id}`)}
                  >
                    {tv("编辑", "Chỉnh sửa")}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <FragmentPlanSkillModal
        open={planTarget != null}
        message={tv(`将调用大模型重新规划「${planTarget?.name || ''}」的分镜（覆盖本集现有分镜与视频），通常需要数十秒。可勾选本次使用的 Skill。字幕方式沿用该集当前设置。`, `Sẽ gọi model lớn lập kế hoạch lại phân cảnh của “${planTarget?.name || ''}” (ghi đè phân cảnh và video hiện có của tập này), thường mất vài chục giây. Có thể tích chọn Skill dùng lần này. Cách làm phụ đề giữ theo cài đặt hiện tại của tập đó.`)}
        onCancel={() => setPlanTarget(null)}
        onConfirm={(skillIds) => {
          if (planTarget) void startPlanEpisode(planTarget, skillIds)
        }}
      />
    </div>
  )
}
