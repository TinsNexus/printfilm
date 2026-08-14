/** 漫剧全局生成队列：图片 / 视频等任务统一展示与恢复 */
import { useSyncExternalStore } from 'react'

export type DramaGenJobKind = 'image' | 'video'

export type DramaGenJobStatus = 'queued' | 'running' | 'done' | 'failed'

export type DramaGenJob = {
  id: string
  kind: DramaGenJobKind
  projectId: number
  /** 资产 id 或分镜 id */
  targetId: number
  episodeId?: number
  title: string
  /** 子类型文案：角色 / 场景 / 分镜视频 等 */
  subtype: string
  status: DramaGenJobStatus
  message?: string
  error?: string
  createdAt: number
  finishedAt?: number
}

type Listener = () => void

const DONE_RETENTION_MS = 10 * 60 * 1000
const EMPTY: DramaGenJob[] = []

/*
 * jobs 统一任务列表
 * cachedSnapshot 对外快照
 * listeners 订阅
 */
let jobs: DramaGenJob[] = []
let cachedSnapshot: DramaGenJob[] = EMPTY
const listeners = new Set<Listener>()

// 快照是否等价
function snapshotsEqual(a: DramaGenJob[], b: DramaGenJob[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.message !== y.message ||
      x.error !== y.error ||
      x.finishedAt !== y.finishedAt ||
      x.title !== y.title
    ) {
      return false
    }
  }
  return true
}

// 清理过期完成/失败项（进行中永不清）
function pruneFinished() {
  const now = Date.now()
  jobs = jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return true
    return now - job.finishedAt < DONE_RETENTION_MS
  })
}

// 刷新快照并通知
function emit() {
  pruneFinished()
  const next = jobs.length === 0 ? EMPTY : [...jobs]
  if (!snapshotsEqual(cachedSnapshot, next)) {
    cachedSnapshot = next
  }
  listeners.forEach((fn) => fn())
}

// 读取快照
export function getDramaGenQueue(): DramaGenJob[] {
  pruneFinished()
  if (jobs.length === 0) {
    cachedSnapshot = EMPTY
    return EMPTY
  }
  if (!snapshotsEqual(cachedSnapshot, jobs)) {
    cachedSnapshot = [...jobs]
  }
  return cachedSnapshot
}

// 订阅
export function subscribeDramaGenQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Hook
export function useDramaGenQueue(): DramaGenJob[] {
  return useSyncExternalStore(subscribeDramaGenQueue, getDramaGenQueue, getDramaGenQueue)
}

// 活跃任务数（角标）
export function getDramaGenActiveCount(): number {
  return jobs.filter((j) => j.status === 'queued' || j.status === 'running').length
}

// 写入或更新一条任务
export function upsertDramaGenJob(patch: Omit<DramaGenJob, 'createdAt' | 'finishedAt'> & {
  createdAt?: number
  finishedAt?: number
}): void {
  const idx = jobs.findIndex((j) => j.id === patch.id)
  const prev = idx >= 0 ? jobs[idx] : null
  const status = patch.status
  const finishedAt =
    status === 'done' || status === 'failed'
      ? patch.finishedAt ?? prev?.finishedAt ?? Date.now()
      : undefined
  const next: DramaGenJob = {
    id: patch.id,
    kind: patch.kind,
    projectId: patch.projectId,
    targetId: patch.targetId,
    episodeId: patch.episodeId,
    title: patch.title,
    subtype: patch.subtype,
    status,
    message: patch.message,
    error: patch.error,
    createdAt: patch.createdAt ?? prev?.createdAt ?? Date.now(),
    finishedAt,
  }
  if (idx >= 0) {
    jobs = jobs.map((j, i) => (i === idx ? next : j))
  } else {
    jobs = [...jobs, next]
  }
  emit()
}

// 图片任务 id
export function imageJobId(assetId: number): string {
  return `image:${assetId}`
}

// 视频分镜任务 id
export function videoJobId(fragmentId: number): string {
  return `video:${fragmentId}`
}

// 同步资产生图任务到统一队列（由 dramaImageGenQueue 回调）
export function syncImageJobToUnified(input: {
  assetId: number
  projectId: number
  assetName: string
  assetType: string
  status: DramaGenJobStatus
  error?: string
}): void {
  upsertDramaGenJob({
    id: imageJobId(input.assetId),
    kind: 'image',
    projectId: input.projectId,
    targetId: input.assetId,
    title: input.assetName || `资产 ${input.assetId}`,
    subtype: input.assetType || 'image',
    status: input.status,
    error: input.error,
    message:
      input.status === 'running'
        ? '生图中'
        : input.status === 'queued'
          ? '排队中'
          : undefined,
  })
}

// 画布视频资产任务 id（与分镜 video:{fragmentId} 区分）
export function assetVideoJobId(assetId: number): string {
  return `video-asset:${assetId}`
}

// 同步画布资产生视频到统一队列
export function syncAssetVideoJobToUnified(input: {
  assetId: number
  projectId: number
  assetName: string
  status: DramaGenJobStatus
  error?: string
}): void {
  upsertDramaGenJob({
    id: assetVideoJobId(input.assetId),
    kind: 'video',
    projectId: input.projectId,
    targetId: input.assetId,
    title: input.assetName || `视频 ${input.assetId}`,
    subtype: '画布视频',
    status: input.status,
    error: input.error,
    message:
      input.status === 'running'
        ? '生视频中'
        : input.status === 'queued'
          ? '排队中'
          : undefined,
  })
}

type FragmentStatusItem = {
  fragment_id: number
  status: string
  message?: string
  phase?: string
  error?: string
  video?: string
  cover?: string
}

// 从分集 generate_status 同步视频任务
export function syncEpisodeVideoJobs(input: {
  projectId: number
  episodeId: number
  episodeName?: string
  fragments: Array<{ id: number; sort_order?: number; content?: string }>
  statusItems: FragmentStatusItem[]
}): void {
  const fragLabel = (fragId: number) => {
    const frag = input.fragments.find((f) => f.id === fragId)
    const idx = frag?.sort_order ?? input.fragments.findIndex((f) => f.id === fragId)
    const n = String((typeof idx === 'number' && idx >= 0 ? idx : 0) + 1).padStart(2, '0')
    return `片段 ${n}`
  }

  for (const item of input.statusItems) {
    const raw = String(item.status || 'idle')
    if (raw === 'idle') continue
    let status: DramaGenJobStatus = 'running'
    if (raw === 'done') status = 'done'
    else if (raw === 'failed') status = 'failed'
    else if (raw === 'queued') status = 'queued'
    else status = 'running'

    const title = `${input.episodeName ? `${input.episodeName} · ` : ''}${fragLabel(item.fragment_id)}`
    upsertDramaGenJob({
      id: videoJobId(item.fragment_id),
      kind: 'video',
      projectId: input.projectId,
      targetId: item.fragment_id,
      episodeId: input.episodeId,
      title,
      subtype: '分镜视频',
      status,
      message: item.message || (item.phase === 'assets' ? '生成参考图…' : undefined),
      error: item.error,
    })
  }
  emit()
}

// 入队时立刻写入队列（乐观展示，不依赖首轮轮询）
export function enqueueEpisodeVideoJobs(input: {
  projectId: number
  episodeId: number
  episodeName?: string
  fragments: Array<{ id: number; sort_order?: number }>
  fragmentIds: number[]
}): void {
  const idSet = new Set(input.fragmentIds)
  const items = input.fragments
    .filter((f) => idSet.has(f.id))
    .map((f) => ({
      fragment_id: f.id,
      status: 'queued',
      message: '已入队',
    }))
  syncEpisodeVideoJobs({
    projectId: input.projectId,
    episodeId: input.episodeId,
    episodeName: input.episodeName,
    fragments: input.fragments,
    statusItems: items,
  })
  requestOpenDramaGenQueue()
}

// 请求打开右下角队列面板
let openRequestSeq = 0
const openListeners = new Set<() => void>()

export function requestOpenDramaGenQueue(): void {
  openRequestSeq += 1
  openListeners.forEach((fn) => fn())
}

export function subscribeDramaGenQueueOpen(listener: () => void): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

export function getDramaGenQueueOpenRequestSeq(): number {
  return openRequestSeq
}

// 清空已结束（完成+失败）
export function clearFinishedDramaGenJobs(): void {
  jobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running')
  emit()
}

// 将进行中/排队中的视频任务标记为已取消（本地队列同步）
export function markVideoJobsCancelled(fragmentIds?: number[]): void {
  const idSet = fragmentIds ? new Set(fragmentIds.map((id) => videoJobId(id))) : null
  jobs = jobs.map((job) => {
    if (job.kind !== 'video') return job
    if (idSet && !idSet.has(job.id)) return job
    if (job.status !== 'queued' && job.status !== 'running') return job
    return {
      ...job,
      status: 'failed' as const,
      error: '已取消',
      finishedAt: Date.now(),
    }
  })
  emit()
}
