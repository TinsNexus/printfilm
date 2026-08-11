/**
 * 科普分镜脚本内 @duration 解析、校验与分段预览
 * 常量与后端 seedance_segments 对齐（单段 3–12s，镜合计 ≤30s）
 */

/** 单段时长下限（秒） */
export const SEGMENT_DURATION_MIN = 3

/** 单段时长上限（秒） */
export const SEGMENT_DURATION_MAX = 12

/** 单镜脚本内 @duration 合计上限（秒） */
export const SHOT_DURATION_MAX = 30

/** 时长快捷选项（秒） */
export const SEGMENT_DURATION_PRESETS = [4, 6, 8, 10, 12] as const

/** 与后端一致的字幕 cue */
export const SUBTITLE_CUE = '【字幕：全程简体中文字幕，旁白逐句同步烧录】'

/** 与后端一致的旁白前缀 */
export const NARRATION_PREFIX = '【旁白·慢速清晰·同步字幕】'

/** 脚本编辑区 placeholder */
export const SEGMENT_SCRIPT_PLACEHOLDER = `${SUBTITLE_CUE}\n【BGM：轻快专业，音量低于人声】\n@duration:4\n过肩工位操作画面…\n@duration:8\n${NARRATION_PREFIX}口播内容…`

const DURATION_TOKEN_PATTERN = /@duration:(\d+)/g

export type SegmentBeatView = { duration: number; text: string }

/**
 * 从脚本中提取全部 @duration 秒数（保留顺序）
 * @param content 逐段分镜脚本文本
 */
export function extractDurations(content: string): number[] {
  const durations: number[] = []
  for (const match of content.matchAll(DURATION_TOKEN_PATTERN)) {
    const seconds = Number(match[1])
    if (Number.isFinite(seconds) && seconds > 0) {
      durations.push(seconds)
    }
  }
  return durations
}

/**
 * 合计脚本内 @duration 秒数
 * @param content 逐段分镜脚本文本
 */
export function sumDuration(content: string): number {
  return extractDurations(content).reduce((sum, value) => sum + value, 0)
}

/**
 * 校验单个时长是否在科普单段合法区间
 * @param seconds 时长秒数
 */
export function isValidSegmentDuration(seconds: number): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds >= SEGMENT_DURATION_MIN &&
    seconds <= SEGMENT_DURATION_MAX
  )
}

/**
 * 校验脚本内时长标签：单段范围 + 合计 ≤ 镜上限
 * @param content 逐段分镜脚本文本
 */
export function validateSegmentScriptDuration(content: string): {
  valid: boolean
  total: number
  durations: number[]
  message?: string
} {
  const durations = extractDurations(content)
  const total = durations.reduce((sum, value) => sum + value, 0)

  if (durations.length === 0) {
    return { valid: true, total: 0, durations }
  }

  if (durations.some((value) => !isValidSegmentDuration(value))) {
    return {
      valid: false,
      total,
      durations,
      message: `单个 @duration 需在 ${SEGMENT_DURATION_MIN}–${SEGMENT_DURATION_MAX} 秒之间`,
    }
  }

  if (total > SHOT_DURATION_MAX) {
    return {
      valid: false,
      total,
      durations,
      message: `镜头时长合计不能超过 ${SHOT_DURATION_MAX} 秒（当前 ${total}s）`,
    }
  }

  return { valid: true, total, durations }
}

/**
 * 解析脚本为字幕/BGM cues 与带时长的正文段（列表预览用）
 * @param script 逐段分镜脚本
 */
export function parseSegmentScript(script: string | undefined | null): {
  cues: string[]
  beats: SegmentBeatView[]
} {
  /*
   * cues 字幕/BGM 行
   * beats 带 duration 的正文段
   * pendingDur 上一段 @duration 值
   */
  const cues: string[] = []
  const beats: SegmentBeatView[] = []
  let pendingDur = 0

  const lines = String(script || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (line.startsWith('【字幕') || line.startsWith('【BGM')) {
      cues.push(line)
      continue
    }
    const m = line.match(/^@duration:(\d+)/)
    if (m) {
      pendingDur = Number(m[1]) || 0
      continue
    }
    if (pendingDur > 0 || beats.length === 0) {
      beats.push({ duration: pendingDur || 0, text: line })
      pendingDur = 0
    } else {
      beats.push({ duration: 0, text: line })
    }
  }

  return { cues, beats }
}
