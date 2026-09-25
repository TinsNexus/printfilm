/** 漫剧生成队列：把上游/平台原始错误翻成当前界面语言的可读说明，并附处理建议（匹配的仍是后端中文/英文原文） */

import { tr } from '../i18n'
import { dialog } from './dialog'
import { isBillingError } from './billingError'

export type DramaGenErrorView = {
  /** 短标题 */
  title: string
  /** 用户可读说明 */
  message: string
  /** 建议操作 */
  suggestion?: string
  /** 是否余额不足（展示充值跳转） */
  billingBlocked?: boolean
  /** 是否上游模型账户欠费（提醒管理员，非用户钱包） */
  upstreamAccountBlocked?: boolean
}

/** 是否为上游 Seedream 账户欠费 */
export function isUpstreamAccountError(message: string): boolean {
  return /AccountOverdueError|上游 Seedream 账户欠费|上游.*账户欠费/i.test(message)
}

// 从 Seedance JSON 文案里取出 content[n]
function extractContentIndex(raw: string): number | null {
  const m = raw.match(/content\[(\d+)\]/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** 判断文案是否像「具体根因」（优先于「重试上限」等包装句） */
function looksLikeRootCause(text: string): boolean {
  return /PrivacyInformation|InputImageSensitive|SensitiveContentDetected|参考图疑似|参考音频过短|may contain real person|Seedance create error|上一镜失败|无法衔接|分镜已变更|分镜上下文|InputTextSensitive|resource download failed|audio_url|audio duration|Credits insufficient|File type not supported|参考图格式不支持/i.test(
    text,
  )
}

// 槽位类型（角色/场景/…）译为当前界面语言
function slotLabel(kind: string): string {
  const path = `genErr.slot.${kind}`
  const label = tr(path)
  return label === path ? kind : label
}

// 从错误里尽量抽出已标注的槽位名（后端 content_labels）
function extractNamedSlot(text: string): string | null {
  const named = text.match(/(角色|场景|道具|旁白|参考图|音色)「([^」]+)」/)
  if (named) return tr('genErr.slotNamed', { kind: slotLabel(named[1]), name: named[2] })
  return null
}

/**
 * 从多条候选错误里挑出最具体的根因（例如隐私图审核），
 * 避免只展示「重试超过上限」这类包装文案。
 */
export function pickRootDramaGenError(
  candidates: Array<string | null | undefined>,
): string {
  const cleaned = candidates.map((c) => String(c || '').trim()).filter(Boolean)
  const root = cleaned.find(looksLikeRootCause)
  if (root) return root
  return cleaned[0] || ''
}

/**
 * 将任务 error / error_message 转为前端展示文案（按当前界面语言）。
 * 已是中文短句时尽量保留，仅补建议。
 */
export function formatDramaGenError(raw: string | null | undefined): DramaGenErrorView {
  const text = String(raw || '').trim()
  const clip = (n: number) => (text.length > n ? `${text.slice(0, n)}…` : text)
  if (!text) {
    return {
      title: tr('genErr.failed'),
      message: tr('genErr.empty.message'),
      suggestion: tr('genErr.empty.suggestion'),
    }
  }

  if (/ReadTimeout|WriteTimeout|等待上游超时|响应超时/i.test(text)) {
    return { title: tr('genErr.timeout.title'), message: clip(200), suggestion: tr('genErr.timeout.suggestion') }
  }

  if (/网络错误|ConnectError|ConnectTimeout|无法连接上游|tokenfree\.com|api\.kie\.ai/i.test(text)) {
    return { title: tr('genErr.connect.title'), message: clip(200), suggestion: tr('genErr.connect.suggestion') }
  }

  if (/^生图失败$/.test(text)) {
    return {
      title: tr('genErr.legacyImage.title'),
      message: tr('genErr.legacyImage.message'),
      suggestion: tr('genErr.legacyImage.suggestion'),
    }
  }

  if (isUpstreamAccountError(text) || (/Seedream error 403/i.test(text) && /AccountOverdue/i.test(text))) {
    return {
      title: tr('genErr.upstreamAccount.title'),
      message: tr('genErr.upstreamAccount.message'),
      suggestion: tr('genErr.upstreamAccount.suggestion'),
      upstreamAccountBlocked: true,
    }
  }

  if (isBillingError(text)) {
    return {
      title: tr('genErr.balance.title'),
      // 后端已给出明确说明时原样保留
      message: /余额不足|请先充值/.test(text) ? text : tr('genErr.balance.message'),
      suggestion: tr('genErr.balance.suggestion'),
      billingBlocked: true,
    }
  }

  if (
    /参考图疑似真人|PrivacyInformation|InputImageSensitive|SensitiveContentDetected|may contain real person/i.test(
      text,
    )
  ) {
    const idx = extractContentIndex(text)
    const named = text.match(/(角色|场景|道具|参考图)「([^」]+)」/)
    if (named) {
      return {
        title: tr('genErr.realPerson.title'),
        message: tr('genErr.realPerson.messageNamed', {
          slot: tr('genErr.slotNamed', { kind: slotLabel(named[1]), name: named[2] }),
        }),
        suggestion: tr('genErr.realPerson.suggestionNamed', { name: named[2] }),
      }
    }
    const where =
      idx != null
        ? tr('genErr.realPerson.whereIndex', { n: idx + 1, idx })
        : tr('genErr.realPerson.whereUnknown')
    return {
      title: tr('genErr.realPerson.title'),
      message: tr('genErr.realPerson.message', { where }),
      suggestion: tr('genErr.realPerson.suggestion'),
    }
  }

  if (/重试超过上限|超过重试上限|内部自动重试超过上限/.test(text)) {
    return {
      title: tr('genErr.retryExhausted.title'),
      message: text,
      suggestion: tr('genErr.retryExhausted.suggestion'),
    }
  }

  if (/上一镜失败|无法衔接尾帧/.test(text)) {
    return {
      title: tr('genErr.prevShot.title'),
      message: tr('genErr.prevShot.message'),
      suggestion: tr('genErr.prevShot.suggestion'),
    }
  }

  if (/分镜已变更|分镜上下文丢失|分镜不存在/.test(text)) {
    return {
      title: tr('genErr.shotChanged.title'),
      message: tr('genErr.shotChanged.message'),
      suggestion: tr('genErr.shotChanged.suggestion'),
    }
  }

  if (/InputTextSensitive|text.*sensitive|敏感/i.test(text) && /Seedance|create error/i.test(text)) {
    return {
      title: tr('genErr.textSensitive.title'),
      message: tr('genErr.textSensitive.message'),
      suggestion: tr('genErr.textSensitive.suggestion'),
    }
  }

  if (/resource download failed|audio_url/i.test(text) && !/audio duration/i.test(text)) {
    return {
      title: tr('genErr.audioDownload.title'),
      message: tr('genErr.audioDownload.message'),
      suggestion: tr('genErr.audioDownload.suggestion'),
    }
  }

  // Seedance r2v：reference_audio 须 ≥ 1.8 秒（不是参考图）
  if (/audio duration|参考音频过短|1\.8/i.test(text) && /audio|音色|reference_audio|content\[/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tr('genErr.audioShort.whereIndex', { n: idx + 1, idx }) : tr('genErr.audioShort.whereUnknown'))
    return {
      title: tr('genErr.audioShort.title'),
      message: tr('genErr.audioShort.message', { where }),
      suggestion: tr('genErr.audioShort.suggestion'),
    }
  }

  if (/only support adaptive aspect ratio|adaptive aspect ratio/i.test(text)) {
    return {
      title: tr('genErr.aspect.title'),
      message: tr('genErr.aspect.message'),
      suggestion: tr('genErr.aspect.suggestion'),
    }
  }

  if (/Credits insufficient|积分不足|余额不足.*[Kk]ie|Kie.*积分/i.test(text)) {
    return {
      title: tr('genErr.kieCredits.title'),
      message: tr('genErr.kieCredits.message'),
      suggestion: tr('genErr.kieCredits.suggestion'),
      upstreamAccountBlocked: true,
    }
  }

  if (/File type not supported|参考图格式不支持|不支持 SVG/i.test(text)) {
    return {
      title: tr('genErr.fileType.title'),
      message: text.includes('参考图格式不支持') ? text : tr('genErr.fileType.message'),
      suggestion: tr('genErr.fileType.suggestion'),
    }
  }

  if (/Seedance create error\s*400|Kie createTask error/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tr('genErr.rejected.whereIndex', { n: idx + 1, idx }) : '')
    return {
      title: tr('genErr.rejected.title'),
      message: tr('genErr.rejected.message', { where }),
      suggestion: tr('genErr.rejected.suggestion'),
    }
  }

  if (/Seedance|上游生成失败/i.test(text)) {
    return {
      title: tr('genErr.videoFailed.title'),
      message: clip(160),
      suggestion: tr('genErr.videoFailed.suggestion'),
    }
  }

  if (/跳过重复任务|分镜已生成完成/.test(text)) {
    return {
      title: tr('genErr.skipped.title'),
      message: tr('genErr.skipped.message'),
      suggestion: tr('genErr.skipped.suggestion'),
    }
  }

  if (/已取消|任务已中断/.test(text)) {
    return {
      title: text.includes('取消') ? tr('genErr.cancelled') : tr('genErr.interrupted'),
      message: text,
      suggestion: tr('genErr.requeue'),
    }
  }

  // 已是较短中文：原样展示，补通用建议
  if (!/[{\\[\]"]/.test(text) && text.length <= 120 && /[\u4e00-\u9fff]/.test(text)) {
    return { title: tr('genErr.failed'), message: text, suggestion: tr('genErr.plainSuggestion') }
  }

  return { title: tr('genErr.failed'), message: clip(200), suggestion: tr('genErr.fallbackSuggestion') }
}

/** 弹窗展示生成失败（含上游欠费 / 用户余额不足等） */
export async function alertDramaGenError(raw: unknown): Promise<void> {
  const text = raw instanceof Error ? raw.message : String(raw || '')
  const view = formatDramaGenError(text)
  const body = [view.message, view.suggestion].filter(Boolean).join('\n\n')
  await dialog.alert({
    title: view.title,
    message: body || view.title,
    tone: 'danger',
  })
}
