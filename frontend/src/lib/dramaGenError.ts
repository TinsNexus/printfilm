/** 漫剧生成队列：把上游/平台原始错误翻成可读中文，并附处理建议 */

import { dialog } from './dialog'
import { isBillingError } from './billingError'
import { formatCopyrightError } from './generationError.ts'
import { tr } from '../i18n/translate.ts'

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
  if (formatCopyrightError(text)) return true
  return /PrivacyInformation|InputImageSensitive|SensitiveContentDetected|参考图疑似|参考音频过短|参考音频过长|无法读取参考音频时长|may contain real person|Seedance create error|上一镜失败|无法衔接|分镜已变更|分镜上下文|InputTextSensitive|resource download failed|audio_url|audio duration|Credits insufficient|File type not supported|参考图格式不支持|invalid image format|参考图格式无效|未开通/i.test(
    text,
  )
}

// 从错误里尽量抽出已标注的槽位名（后端 content_labels）
function extractNamedSlot(text: string): string | null {
  const named = text.match(/(角色|场景|道具|旁白|参考图|音色)「([^」]+)」/)
  if (named) return `${named[1]}「${named[2]}」`
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
 * 将任务 error / error_message 转为前端展示文案。
 * 已是中文短句时尽量保留，仅补建议。
 */
export function formatDramaGenError(raw: string | null | undefined): DramaGenErrorView {
  const text = String(raw || '').trim()
  const copyright = formatCopyrightError(text)
  if (copyright) return copyright
  if (!text) {
    return {
      title: tr('dramaGenError.generationFailed'),
      message: tr('dramaGenError.taskDidNotFinishNo'),
      suggestion: tr('dramaGenError.tryAgainLaterIfKeeps'),
    }
  }

  if (/ReadTimeout|WriteTimeout|等待上游超时|响应超时/i.test(text)) {
    return {
      title: tr('dramaGenError.upstreamTimedOut'),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion:
        tr('dramaGenError.tokenfreeWasReachedButImage'),
    }
  }

  if (/网络错误|ConnectError|ConnectTimeout|无法连接上游|tokenfree\.com/i.test(text)) {
    return {
      title: tr('dramaGenError.cannotReachImageVideoService'),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion:
        tr('dramaGenError.machineCannotReachUpstreamRight'),
    }
  }

  if (/^生图失败$/.test(text)) {
    return {
      title: tr('dramaGenError.imageGenerationFailed'),
      message: tr('dramaGenError.imageGenerationFailedButOlder'),
      suggestion:
        tr('dramaGenError.generateAgainNewerVersionsRecord'),
    }
  }

  if (isUpstreamAccountError(text) || (/Seedream error 403/i.test(text) && /AccountOverdue/i.test(text))) {
    return {
      title: tr('dramaGenError.platformUpstreamAccountOutCredit'),
      message:
        tr('dramaGenError.upstreamSeedreamAccountHasInsufficient'),
      suggestion: tr('dramaGenError.askSiteAdminTopUp'),
      upstreamAccountBlocked: true,
    }
  }

  if (isBillingError(text)) {
    return {
      title: tr('dramaGenError.insufficientBalance'),
      message: /余额不足|请先充值/.test(text) ? text : tr('dramaGenError.balanceTooLowKeepGenerating'),
      suggestion: tr('dramaGenError.topUpThenRetryTask'),
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
        title: tr('dramaGenError.referenceImageMayShowReal'),
        message: tr('dramaGenError.videoModerationFailedReferenceImage', { p: named[1], p2: named[2] }),
        suggestion: tr('dramaGenError.openAssetsLeftRegenerateUpload', { p: named[2] }),
      }
    }
    const where =
      idx != null
        ? tr('dramaGenError.itemRequestContentUsuallyCharacter', { n: idx + 1, idx })
        : tr('dramaGenError.oneReferenceImages')
    return {
      title: tr('dramaGenError.referenceImageMayShowReal'),
      message: tr('dramaGenError.videoModerationFailedInputImage', { where }),
      suggestion:
        tr('dramaGenError.openAssetsLeftRegenerateAnime'),
    }
  }

  if (/重试超过上限|超过重试上限|内部自动重试超过上限/.test(text)) {
    return {
      title: tr('dramaGenError.stillFailingAfterSeveralAttempts'),
      message: text,
      suggestion:
        tr('dramaGenError.automaticRetriesWithinTaskRan'),
    }
  }

  if (/上一镜失败|无法衔接尾帧/.test(text)) {
    return {
      title: tr('dramaGenError.cannotContinuePreviousShot'),
      message: tr('dramaGenError.shotContinuesPreviousShotS'),
      suggestion: tr('dramaGenError.fixRegenerateFailedPreviousShot'),
    }
  }

  if (/分镜已变更|分镜上下文丢失|分镜不存在/.test(text)) {
    return {
      title: tr('dramaGenError.shotsWereUpdated'),
      message: tr('dramaGenError.shotsWereSavedReSplit'),
      suggestion: tr('dramaGenError.goBackEpisodePageGenerate'),
    }
  }

  if (/InputTextSensitive|text.*sensitive|敏感/i.test(text) && /Seedance|create error/i.test(text)) {
    return {
      title: tr('dramaGenError.scriptFailedModeration'),
      message: tr('dramaGenError.shotScriptPromptTriggeredContent'),
      suggestion: tr('dramaGenError.editSensitiveWordingShotTry'),
    }
  }

  if (/resource download failed|audio_url/i.test(text) && !/audio duration/i.test(text)) {
    return {
      title: tr('dramaGenError.referenceAudioCannotDownloaded'),
      message: tr('dramaGenError.voiceReferenceFileUrlInvalid'),
      suggestion: tr('dramaGenError.checkCharacterSAssignedPreview'),
    }
  }

  if (/无法读取参考音频时长|参考音频地址为空/i.test(text)) {
    const named = extractNamedSlot(text)
    return {
      title: tr('dramaGenError.referenceAudioCannotVerified'),
      message: named
        ? tr('dramaGenError.couldNotReadReferenceAudio', { named })
        : text.length > 160
          ? `${text.slice(0, 160)}…`
          : text,
      suggestion: tr('dramaGenError.checkCharacterNarrationPreviewFile'),
    }
  }

  if (/参考音频过长/i.test(text)) {
    const named = extractNamedSlot(text)
    const dur = text.match(/当前约\s*([\d.]+)\s*秒/)
    const durNote = dur ? tr('dramaGenError.aboutS', { p: dur[1] }) : ''
    return {
      title: tr('dramaGenError.referenceAudioTooLong'),
      message: named
        ? tr('dramaGenError.referenceAudioTooLongMust', { named, durNote })
        : text.length > 160
          ? `${text.slice(0, 160)}…`
          : text,
      suggestion: tr('dramaGenError.shortenCharacterNarrationPreviewAudio'),
    }
  }

  // Seedance r2v：reference_audio 须 ≥ 1.8 秒（不是参考图）
  if (
    /参考音频过短/i.test(text) ||
    (/audio duration|1\.8/i.test(text) && /audio|音色|reference_audio|content\[/i.test(text))
  ) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const dur = text.match(/当前约\s*([\d.]+)\s*秒/)
    const where =
      named ||
      (idx != null ? tr('dramaGenError.itemRequestContentReferenceAudio', { n: idx + 1, idx }) : tr('dramaGenError.characterNarrationVoice'))
    return {
      title: tr('dramaGenError.referenceAudioTooShort'),
      message: dur
        ? tr('dramaGenError.referenceAudioAboutSMust', { where, p: dur[1] })
        : tr('dramaGenError.videoServiceRequiresReferenceAudio', { where }),
      suggestion:
        tr('dramaGenError.openMatchingCharacterNarrationAsset'),
    }
  }

  if (/only support adaptive aspect ratio|adaptive aspect ratio/i.test(text)) {
    return {
      title: tr('dramaGenError.incompatibleAspectRatio'),
      message: tr('dramaGenError.whenCurrentVideoChannelRuns'),
      suggestion: tr('dramaGenError.generateShotAgainServerWill'),
    }
  }

  if (/Credits insufficient|积分不足|余额不足.*[Kk]ie|Kie.*积分/i.test(text)) {
    return {
      title: tr('dramaGenError.videoChannelOutCredit'),
      message: tr('dramaGenError.upstreamAccountOutCreditSo'),
      suggestion: tr('dramaGenError.askAdminTopUpTokenfree'),
      upstreamAccountBlocked: true,
    }
  }

  if (/未开通|无可用渠道|distributor/i.test(text)) {
    return {
      title: tr('dramaGenError.imageModelNotEnabled'),
      message: text.length > 180 ? `${text.slice(0, 180)}…` : text,
      suggestion: tr('dramaGenError.askAdminEnableModelE'),
    }
  }

  if (/File type not supported|参考图格式不支持|不支持 SVG/i.test(text)) {
    return {
      title: tr('dramaGenError.unsupportedReferenceImageFormat'),
      message:
        text.includes('参考图格式不支持')
          ? text
          : tr('dramaGenError.upstreamRejectedReferenceImageFile'),
      suggestion:
        tr('dramaGenError.checkCoversCharactersScenesProps'),
    }
  }

  // 参考图槽位收到非图片（常见：音色 mp3 误进 image_url）
  if (/invalid image format|参考图格式无效/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tr('dramaGenError.itemRequestContent', { n: idx + 1, idx }) : tr('dramaGenError.oneReferenceImages2'))
    return {
      title: tr('dramaGenError.invalidReferenceImage'),
      message: tr('dramaGenError.videoServiceFailedValidateImage', { where }),
      suggestion:
        tr('dramaGenError.checkShotSCharacterScene'),
    }
  }

  if (/Seedance create error\s*400|Kie createTask error/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tr('dramaGenError.itemRequestContent2', { n: idx + 1, idx }) : '')
    return {
      title: tr('dramaGenError.videoServiceRejectedRequest'),
      message: tr('dramaGenError.upstreamReportedParameterContentError', { where }),
      suggestion:
        tr('dramaGenError.firstCheckShotSReference'),
    }
  }

  if (/Seedance|上游生成失败/i.test(text)) {
    return {
      title: tr('dramaGenError.videoGenerationFailed'),
      message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      suggestion: tr('dramaGenError.retryShotLaterIfKeeps'),
    }
  }

  if (/跳过重复任务|分镜已生成完成/.test(text)) {
    return {
      title: tr('dramaGenError.oldTaskSkipped'),
      message: tr('dramaGenError.schedulerFoundShotAlreadyHas'),
      suggestion:
        tr('dramaGenError.ifWereRegeneratingCheckQueue'),
    }
  }

  if (/已取消|任务已中断/.test(text)) {
    return {
      title: text.includes('取消') ? tr('dramaGenError.cancelled') : tr('dramaGenError.taskInterrupted'),
      message: text,
      suggestion: tr('dramaGenError.queueAgainWhenNeedVideo'),
    }
  }

  // 成片下载被对端掐断（TokenFree content / CDN），不是参考图或脚本问题
  if (/RemoteProtocolError|peer closed|complete message body|incomplete download/i.test(text)) {
    return {
      title: tr('dramaGenError.videoDownloadInterrupted'),
      message: tr('dramaGenError.videoWasGeneratedUpstreamBut'),
      suggestion: tr('dramaGenError.systemRetriesDownloadWithinOriginal'),
    }
  }

  // 浏览器层断连：不是脚本/参考图问题，常因后端热重载或瞬时网络
  if (/failed to fetch|networkerror|load failed|connection reset|连接被重置/i.test(text)) {
    return {
      title: tr('dramaGenError.networkInterrupted'),
      message: tr('dramaGenError.requestBackendFailedFailedFetch'),
      suggestion: tr('dramaGenError.refreshCanvasSeeWhetherNode'),
    }
  }

  // 已是较短中文：原样展示，补通用建议
  if (!/[{\\[\]"]/.test(text) && text.length <= 120 && /[\u4e00-\u9fff]/.test(text)) {
    return {
      title: tr('dramaGenError.generationFailed'),
      message: text,
      suggestion: tr('dramaGenError.followSuggestionThenGenerateShot'),
    }
  }

  return {
    title: tr('dramaGenError.generationFailed'),
    message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    suggestion: tr('dramaGenError.checkShotSReferenceImages'),
  }
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
