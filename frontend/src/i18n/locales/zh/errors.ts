/** 中文：漫剧生成失败的可读说明（对应 lib/dramaGenError.ts） */

export const zhErrors = {
  genErr: {
    slotNamed: '{kind}「{name}」',
    slot: { 角色: '角色', 场景: '场景', 道具: '道具', 旁白: '旁白', 参考图: '参考图', 音色: '音色' },
    failed: '生成失败',
    empty: {
      message: '任务未能完成，且未记录具体错误信息。',
      suggestion: '请稍后重试；若反复失败，检查网络/代理是否能访问 TokenFree，以及后台模型渠道密钥。',
    },
    timeout: {
      title: '上游响应超时',
      suggestion:
        '已经连上 TokenFree，但出图/出视频等待超过上限。请稍后重试；若文本能生成、只有图/视频超时，多半是上游排队较慢，不是代理断网。',
    },
    connect: {
      title: '无法连接图片/视频服务',
      suggestion:
        '本机当前连不上上游（常见于代理未放行或网络中断）。请检查网络/代理后重试，并确认后台 TokenFree 渠道密钥有效。',
    },
    legacyImage: {
      title: '生图失败',
      message: '生图未成功，但旧任务未保存具体原因（多为上游连接失败且错误文案为空）。',
      suggestion: '请重新生成一次；新版本会写出明确错误。仍失败时检查 TokenFree 网络与密钥。',
    },
    upstreamAccount: {
      title: '平台上游账户欠费',
      message: '上游 Seedream 模型账户余额不足，生图请求被拒绝。这是站点上游模型账户欠费，不是您个人钱包余额问题。',
      suggestion: '请联系站点管理员在 TokenFree 控制台充值；充值完成后请重试生图。',
    },
    balance: {
      title: '余额不足',
      message: '当前余额不足，无法继续生成。',
      suggestion: '请先充值后再重试该任务。',
    },
    realPerson: {
      title: '参考图疑似真人',
      messageNamed: '视频服务审核未通过：{slot}的参考图可能含真人肖像，已拒绝生成。',
      suggestionNamed: '请在左侧资产中打开「{name}」，重新生成或上传偏动漫/插画的形象后再生成该分镜。',
      whereIndex: '（提交内容第 {n} 项 / content[{idx}]，多为角色或场景参考图）',
      whereUnknown: '（某张参考图）',
      message: '视频服务审核未通过：输入图片{where}可能含真人肖像，已拒绝生成。',
      suggestion:
        '打开左侧资产，为相关角色/场景重新用 AI 生成偏动漫或插画的形象（避免真人照片），或上传合规图后再重新生成该分镜。',
    },
    retryExhausted: {
      title: '多次生成仍失败',
      suggestion:
        '这是同一次任务内的自动重试耗尽，不是禁止你再点生成。请根据真实原因（常见是参考图真人审核）改素材或文案后，再重新点生成。',
    },
    prevShot: {
      title: '无法衔接上一镜',
      message: '本镜依赖上一镜的尾帧衔接，但上一镜未成功，因此本镜未开始生成。',
      suggestion: '先修复并重新生成失败的上一镜，再按镜序生成后续片段。',
    },
    shotChanged: {
      title: '分镜已更新',
      message: '分镜在生成过程中被保存或重切，旧任务已失效。',
      suggestion: '请回到分集页，用当前分镜列表重新点生成；不要重试旧任务。',
    },
    textSensitive: {
      title: '文案未通过审核',
      message: '分镜脚本或提示词触发了内容安全审核。',
      suggestion: '请修改分镜中的敏感表述后重试。',
    },
    audioDownload: {
      title: '参考音频无法下载',
      message: '音色参考文件地址无效或暂时无法访问。',
      suggestion: '检查角色绑定的试听音频，重新生成或更换音色后再试。',
    },
    audioShort: {
      title: '参考音频过短',
      whereIndex: '提交内容第 {n} 项 / content[{idx}]（参考音频，不是图片）',
      whereUnknown: '某条角色/旁白音色',
      message: '视频服务要求参考音频时长 ≥ 1.8 秒，当前过短：{where}。',
      suggestion:
        '打开左侧对应角色或旁白资产，重新生成/上传更长的试听音频（建议 ≥ 2 秒）后再生成该分镜。这不是参考图问题。',
    },
    aspect: {
      title: '画幅参数不兼容',
      message: '当前视频通道的图生视频若走单首帧，固定比例可能被拒绝。',
      suggestion: '请重新生成该分镜；服务端会按参考图自适应画幅。',
    },
    kieCredits: {
      title: '视频渠道积分不足',
      message: '上游账户积分不足，无法创建视频生成任务（不是参考图或音频时长问题）。',
      suggestion: '请联系管理员在 TokenFree 控制台充值后再重试；充值后重新生成该分镜即可。',
    },
    fileType: {
      title: '参考图格式不支持',
      message: '上游拒绝了参考图：File type not supported（常见原因是 SVG 占位图或非位图）。',
      suggestion:
        '检查本镜引用的角色/场景/道具封面是否为 PNG/JPG/WEBP。若仍是 SVG 占位图，请对该资产重新生图或上传位图后再生成视频。',
    },
    rejected: {
      title: '视频服务拒绝请求',
      whereIndex: '（提交内容第 {n} 项 / content[{idx}]）',
      message: '上游返回参数或内容错误，未能创建生成任务{where}。',
      suggestion: '检查本镜参考图、参考音频时长（须 ≥ 1.8 秒）与脚本后重试；若持续失败请联系客服并提供任务号。',
    },
    videoFailed: {
      title: '视频生成失败',
      suggestion: '可稍后重试该分镜；连续失败时请更换参考图或简化脚本。',
    },
    skipped: {
      title: '旧任务已跳过',
      message: '调度器发现该分镜已有成片，因此取消了这条重复入队的旧任务。',
      suggestion:
        '若你是在「重新生成」，请看队列里是否还有进行中的新任务；没有的话再点一次重新生成。不要把这条旧取消当成当前失败。',
    },
    cancelled: '已取消',
    interrupted: '任务已中断',
    requeue: '需要成片时请重新入队生成。',
    plainSuggestion: '请按提示处理后重新生成该分镜。',
    fallbackSuggestion: '请检查本镜参考图与脚本后重试。',
  },
} as const
