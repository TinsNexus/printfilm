/** 漫剧生成队列：把上游/平台原始错误翻成可读中文，并附处理建议 */

export type DramaGenErrorView = {
  /** 短标题 */
  title: string
  /** 用户可读说明 */
  message: string
  /** 建议操作 */
  suggestion?: string
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
  return /PrivacyInformation|InputImageSensitive|SensitiveContentDetected|参考图疑似|参考音频过短|may contain real person|Seedance create error|上一镜失败|无法衔接|分镜已变更|分镜上下文|InputTextSensitive|resource download failed|audio_url|audio duration/i.test(
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
  if (!text) {
    return {
      title: '生成失败',
      message: '任务未能完成。',
      suggestion: '请稍后重试；若反复失败，检查分镜参考图与脚本后重新生成。',
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
        title: '参考图疑似真人',
        message: `视频服务审核未通过：${named[1]}「${named[2]}」的参考图可能含真人肖像，已拒绝生成。`,
        suggestion: `请在左侧资产中打开「${named[2]}」，重新生成或上传偏动漫/插画的形象后再生成该分镜。`,
      }
    }
    const where =
      idx != null
        ? `（提交内容第 ${idx + 1} 项 / content[${idx}]，多为角色或场景参考图）`
        : '（某张参考图）'
    return {
      title: '参考图疑似真人',
      message: `视频服务审核未通过：输入图片${where}可能含真人肖像，已拒绝生成。`,
      suggestion:
        '打开左侧资产，为相关角色/场景重新用 AI 生成偏动漫或插画的形象（避免真人照片），或上传合规图后再重新生成该分镜。',
    }
  }

  if (/重试超过上限|超过重试上限/.test(text)) {
    return {
      title: '多次生成仍失败',
      message: text,
      suggestion:
        '常见原因是参考图触发真人肖像审核。请打开左侧资产，为相关角色/场景更换或重新生成形象后再点生成。',
    }
  }

  if (/上一镜失败|无法衔接尾帧/.test(text)) {
    return {
      title: '无法衔接上一镜',
      message: '本镜依赖上一镜的尾帧衔接，但上一镜未成功，因此本镜未开始生成。',
      suggestion: '先修复并重新生成失败的上一镜，再按镜序生成后续片段。',
    }
  }

  if (/分镜已变更|分镜上下文丢失|分镜不存在/.test(text)) {
    return {
      title: '分镜已更新',
      message: '分镜在生成过程中被保存或重切，旧任务已失效。',
      suggestion: '请回到分集页，用当前分镜列表重新点生成；不要重试旧任务。',
    }
  }

  if (/InputTextSensitive|text.*sensitive|敏感/i.test(text) && /Seedance|create error/i.test(text)) {
    return {
      title: '文案未通过审核',
      message: '分镜脚本或提示词触发了内容安全审核。',
      suggestion: '请修改分镜中的敏感表述后重试。',
    }
  }

  if (/resource download failed|audio_url/i.test(text) && !/audio duration/i.test(text)) {
    return {
      title: '参考音频无法下载',
      message: '音色参考文件地址无效或暂时无法访问。',
      suggestion: '检查角色绑定的试听音频，重新生成或更换音色后再试。',
    }
  }

  // Seedance r2v：reference_audio 须 ≥ 1.8 秒（不是参考图）
  if (/audio duration|参考音频过短|1\.8/i.test(text) && /audio|音色|reference_audio|content\[/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? `提交内容第 ${idx + 1} 项 / content[${idx}]（参考音频，不是图片）` : '某条角色/旁白音色')
    return {
      title: '参考音频过短',
      message: `视频服务要求参考音频时长 ≥ 1.8 秒，当前过短：${where}。`,
      suggestion:
        '打开左侧对应角色或旁白资产，重新生成/上传更长的试听音频（建议 ≥ 2 秒）后再生成该分镜。这不是参考图问题。',
    }
  }

  if (/Seedance create error\s*400/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? `（提交内容第 ${idx + 1} 项 / content[${idx}]）` : '')
    return {
      title: '视频服务拒绝请求',
      message: `上游返回参数或内容错误，未能创建生成任务${where}。`,
      suggestion: '检查本镜参考图、参考音频时长（须 ≥ 1.8 秒）与脚本后重试；若持续失败请联系客服并提供任务号。',
    }
  }

  if (/Seedance|上游生成失败/i.test(text)) {
    return {
      title: '视频生成失败',
      message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      suggestion: '可稍后重试该分镜；连续失败时请更换参考图或简化脚本。',
    }
  }

  if (/跳过重复任务|分镜已生成完成/.test(text)) {
    return {
      title: '旧任务已跳过',
      message: '调度器发现该分镜已有成片，因此取消了这条重复入队的旧任务。',
      suggestion:
        '若你是在「重新生成」，请看队列里是否还有进行中的新任务；没有的话再点一次重新生成。不要把这条旧取消当成当前失败。',
    }
  }

  if (/已取消|任务已中断/.test(text)) {
    return {
      title: text.includes('取消') ? '已取消' : '任务已中断',
      message: text,
      suggestion: '需要成片时请重新入队生成。',
    }
  }

  // 已是较短中文：原样展示，补通用建议
  if (!/[{\\[\]"]/.test(text) && text.length <= 120 && /[\u4e00-\u9fff]/.test(text)) {
    return {
      title: '生成失败',
      message: text,
      suggestion: '请按提示处理后重新生成该分镜。',
    }
  }

  return {
    title: '生成失败',
    message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    suggestion: '请检查本镜参考图与脚本后重试。',
  }
}
