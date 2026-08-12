/** 漫剧资产生图全局队列：串行入队，避免多次点击互相顶掉 */
import { dramaApi, type DramaAsset } from '../api/drama'
import type { ImageGenerationOptions } from './dramaGenerationOptions'

export type DramaImageGenStatus = 'queued' | 'running' | 'done' | 'failed'

export type DramaImageGenJob = {
  id: string
  projectId: number
  assetId: number
  assetName: string
  assetType: string
  prompt: string
  options: Partial<ImageGenerationOptions>
  status: DramaImageGenStatus
  error?: string
  createdAt: number
  finishedAt?: number
}

type EnqueueInput = {
  projectId: number
  assetId: number
  assetName?: string
  assetType?: string
  prompt: string
  options?: Partial<ImageGenerationOptions>
}

type InternalJob = DramaImageGenJob & {
  resolve: (asset: DramaAsset) => void
  reject: (err: Error) => void
}

/* 同时跑几路生图；1 = 严格队列，避免互相顶掉与限流 */
const MAX_CONCURRENT = 1
/* 完成后在面板保留多久 */
const DONE_RETENTION_MS = 45_000
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

/*
 * jobs 内部队列
 * cachedSnapshot useSyncExternalStore 稳定快照（必须复用引用）
 * listeners 订阅回调
 * activeCount 正在请求/轮询的任务数
 * pumping 是否已调度 pump
 */
let jobs: InternalJob[] = []
const EMPTY_SNAPSHOT: DramaImageGenJob[] = []
let cachedSnapshot: DramaImageGenJob[] = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()
let activeCount = 0
let pumping = false

// 将内部 job 转为对外结构
function toPublicJob(job: InternalJob): DramaImageGenJob {
  return {
    id: job.id,
    projectId: job.projectId,
    assetId: job.assetId,
    assetName: job.assetName,
    assetType: job.assetType,
    prompt: job.prompt,
    options: job.options,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }
}

// 两个快照内容是否一致
function snapshotsEqual(a: DramaImageGenJob[], b: DramaImageGenJob[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.status !== right.status ||
      left.error !== right.error ||
      left.finishedAt !== right.finishedAt
    ) {
      return false
    }
  }
  return true
}

// 重建并缓存对外快照（仅在内容变化时换新引用）
function refreshSnapshot() {
  pruneFinished()
  const next =
    jobs.length === 0 ? EMPTY_SNAPSHOT : jobs.map((job) => toPublicJob(job))
  if (!snapshotsEqual(cachedSnapshot, next)) {
    cachedSnapshot = next
  }
}

// 通知所有订阅方刷新
function emit() {
  refreshSnapshot()
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore listener errors */
    }
  })
}

// 清理过期的完成/失败项
function pruneFinished() {
  const now = Date.now()
  jobs = jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return false
    return now - job.finishedAt < DONE_RETENTION_MS
  })
}

// 对外只读快照（稳定引用，供 useSyncExternalStore）
export function getDramaImageGenQueue(): DramaImageGenJob[] {
  return cachedSnapshot
}

// 资产是否仍在队列中（排队或生成中）
export function isDramaAssetImageBusy(assetId: number): boolean {
  return jobs.some(
    (job) =>
      job.assetId === assetId && (job.status === 'queued' || job.status === 'running'),
  )
}

// 当前排队 + 进行中数量
export function getDramaImageGenActiveCount(): number {
  return jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
}

// 订阅队列变化
export function subscribeDramaImageGenQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 生成本地任务 id
function makeJobId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 轮询直到资产生图结束，返回最新资产
async function waitForAssetImage(projectId: number, assetId: number): Promise<DramaAsset> {
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const list = await dramaApi.listAssets(projectId)
    const latest = list.find((a) => a.id === assetId)
    if (!latest) throw new Error('资产不存在')
    const gen = (latest.params || {}).generation as
      | { status?: string; error?: string }
      | undefined
    const status = String(gen?.status || '')
    if ((latest.url || latest.cover) && status !== 'generating') {
      return latest
    }
    if (status === 'failed') {
      throw new Error(String(gen?.error || '生图失败'))
    }
    if (status === 'done' && (latest.url || latest.cover)) {
      return latest
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error('生图超时，请刷新后重试')
}

// 执行单个任务：调 API + 轮询
async function runJob(job: InternalJob) {
  job.status = 'running'
  emit()
  try {
    await dramaApi.generateImage({
      project_id: job.projectId,
      asset_id: job.assetId,
      prompt: job.prompt,
      name: job.assetName || undefined,
      asset_type_kind: job.assetType,
      image_style_id: job.options.image_style_id,
      model_id: job.options.model_id,
      aspect_ratio: job.options.aspect_ratio,
      resolution: job.options.resolution,
    })
    const asset = await waitForAssetImage(job.projectId, job.assetId)
    job.status = 'done'
    job.finishedAt = Date.now()
    emit()
    job.resolve(asset)
  } catch (err) {
    const message = err instanceof Error ? err.message : '生图失败'
    job.status = 'failed'
    job.error = message
    job.finishedAt = Date.now()
    emit()
    job.reject(err instanceof Error ? err : new Error(message))
  }
}

// 拉取排队任务并控制并发
function pump() {
  if (pumping) return
  pumping = true
  queueMicrotask(() => {
    pumping = false
    while (activeCount < MAX_CONCURRENT) {
      const next = jobs.find((job) => job.status === 'queued')
      if (!next) break
      activeCount += 1
      void runJob(next).finally(() => {
        activeCount -= 1
        pump()
        emit()
      })
    }
    emit()
  })
}

/**
 * 将资产生图加入全局队列；同资产已在排队/生成中时复用同一 Promise。
 * @returns 完成后的最新资产
 */
export function enqueueDramaImageGen(input: EnqueueInput): Promise<DramaAsset> {
  const existing = jobs.find(
    (job) =>
      job.assetId === input.assetId &&
      (job.status === 'queued' || job.status === 'running'),
  )
  if (existing) {
    return new Promise((resolve, reject) => {
      const prevResolve = existing.resolve
      const prevReject = existing.reject
      existing.resolve = (asset) => {
        prevResolve(asset)
        resolve(asset)
      }
      existing.reject = (err) => {
        prevReject(err)
        reject(err)
      }
    })
  }

  return new Promise<DramaAsset>((resolve, reject) => {
    const job: InternalJob = {
      id: makeJobId(),
      projectId: input.projectId,
      assetId: input.assetId,
      assetName: (input.assetName || '').trim() || `资产 ${input.assetId}`,
      assetType: input.assetType || 'character',
      prompt: input.prompt,
      options: input.options || {},
      status: 'queued',
      createdAt: Date.now(),
      resolve,
      reject,
    }
    jobs = [...jobs, job]
    emit()
    pump()
  })
}

// 清空已结束项（手动关闭面板时）
export function clearFinishedDramaImageGenJobs() {
  jobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running')
  emit()
}
