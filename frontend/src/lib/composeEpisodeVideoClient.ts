/** 浏览器内无损拼接本集分镜 MP4（不走服务端 ffmpeg） */

import type { DramaFragment } from '../api/drama'
import { resolveDramaMediaUrl } from '../api/drama'
import { fetchMediaBlob } from './clientDownload'
import { sanitizeMediaBasename } from './canvasNodeMedia'

export type EpisodeComposeClip = {
  id: number
  label: string
  url: string
}

export type EpisodeComposeProgress = {
  phase: 'download' | 'concat'
  done: number
  total: number
}

/** 按分镜顺序收集可拼接的视频地址 */
export function listEpisodeComposeClips(fragments: DramaFragment[]): EpisodeComposeClip[] {
  const clips: EpisodeComposeClip[] = []
  fragments.forEach((fragment, index) => {
    const url = resolveDramaMediaUrl(fragment.video)
    if (!url || fragment.id == null) return
    clips.push({
      id: fragment.id,
      label: `分镜${index + 1}`,
      url,
    })
  })
  return clips
}

/** 全片下载文件名 */
export function episodeComposeFilename(episodeName: string) {
  return `${sanitizeMediaBasename(episodeName || '本集')}_全片.mp4`
}

/** 拉取各镜并在本地拼成一条 MP4 */
export async function composeEpisodeVideoClient(
  clips: EpisodeComposeClip[],
  onProgress?: (progress: EpisodeComposeProgress) => void,
): Promise<Blob> {
  if (clips.length === 0) {
    throw new Error('本集还没有可拼接的分镜视频')
  }

  const buffers: Uint8Array[] = new Array(clips.length)
  let downloaded = 0
  await Promise.all(
    clips.map(async (clip, index) => {
      const blob = await fetchMediaBlob(clip.url)
      buffers[index] = new Uint8Array(await blob.arrayBuffer())
      downloaded += 1
      onProgress?.({ phase: 'download', done: downloaded, total: clips.length })
    }),
  )

  if (clips.length === 1) {
    const single = buffers[0]
    return new Blob([single], { type: 'video/mp4' })
  }

  onProgress?.({ phase: 'concat', done: 0, total: clips.length })
  const { concatMp4, isMp4, mp4Compat } = await import('mp4cat')
  const names = clips.map((clip) => clip.label)
  for (let i = 0; i < buffers.length; i++) {
    if (!isMp4(buffers[i])) {
      throw new Error(`${names[i]} 不是可拼接的 MP4`)
    }
  }
  const compat = mp4Compat(buffers, { names })
  if (!compat.ok) {
    throw new Error(
      `各镜编码不一致，无法在浏览器里无损拼接。请用同一模型、比例和清晰度生成后再试。${
        compat.reason ? `（${compat.reason}）` : ''
      }`,
    )
  }
  const merged = concatMp4(buffers)
  onProgress?.({ phase: 'concat', done: clips.length, total: clips.length })
  return new Blob([merged], { type: 'video/mp4' })
}
