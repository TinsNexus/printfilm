/** 漫剧生成队列：把上游/平台原始错误翻成可读中文，并附处理建议 */

import { dialog } from './dialog'
import { isBillingError } from './billingError'
import { formatCopyrightError } from './generationError.ts'
import { tv } from '../i18n/tv'

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
      title: tv('生成失败', 'Tạo thất bại'),
      message: tv('任务未能完成，且未记录具体错误信息。', 'Tác vụ chưa hoàn tất, và chưa ghi lại thông tin lỗi cụ thể.'),
      suggestion: tv('请稍后重试；若反复失败，检查网络/代理是否能访问 TokenFree，以及后台模型渠道密钥。', 'Vui lòng thử lại sau; nếu thất bại liên tục, hãy kiểm tra mạng/proxy có truy cập được TokenFree không, và khóa kênh model trong trang quản trị.'),
    }
  }

  if (/ReadTimeout|WriteTimeout|等待上游超时|响应超时/i.test(text)) {
    return {
      title: tv('上游响应超时', 'Upstream phản hồi quá thời gian'),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion:
        tv('已经连上 TokenFree，但出图/出视频等待超过上限。请稍后重试；若文本能生成、只有图/视频超时，多半是上游排队较慢，不是代理断网。', 'Đã kết nối được TokenFree, nhưng thời gian chờ tạo ảnh/video vượt giới hạn. Vui lòng thử lại sau; nếu văn bản tạo được còn chỉ ảnh/video hết thời gian, phần lớn là upstream xếp hàng chậm, không phải proxy mất mạng.'),
    }
  }

  if (/网络错误|ConnectError|ConnectTimeout|无法连接上游|tokenfree\.com/i.test(text)) {
    return {
      title: tv('无法连接图片/视频服务', 'Không kết nối được dịch vụ hình ảnh/video'),
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      suggestion:
        tv('本机当前连不上上游（常见于代理未放行或网络中断）。请检查网络/代理后重试，并确认后台 TokenFree 渠道密钥有效。', 'Máy này hiện không kết nối được upstream (thường do proxy chưa cho phép hoặc mạng bị gián đoạn). Vui lòng kiểm tra mạng/proxy rồi thử lại, và xác nhận khóa kênh TokenFree trong trang quản trị còn hiệu lực.'),
    }
  }

  if (/^生图失败$/.test(text)) {
    return {
      title: tv('生图失败', 'Tạo ảnh thất bại'),
      message: tv('生图未成功，但旧任务未保存具体原因（多为上游连接失败且错误文案为空）。', 'Tạo ảnh không thành công, nhưng tác vụ cũ không lưu nguyên nhân cụ thể (phần lớn do kết nối upstream thất bại và nội dung lỗi trống).'),
      suggestion:
        tv('请重新生成一次；新版本会写出明确错误。仍失败时检查 TokenFree 网络与密钥。', 'Vui lòng tạo lại một lần; phiên bản mới sẽ ghi rõ lỗi. Nếu vẫn thất bại thì kiểm tra mạng và khóa TokenFree.'),
    }
  }

  if (isUpstreamAccountError(text) || (/Seedream error 403/i.test(text) && /AccountOverdue/i.test(text))) {
    return {
      title: tv('平台上游账户欠费', 'Tài khoản upstream của nền tảng nợ phí'),
      message:
        tv('上游 Seedream 模型账户余额不足，生图请求被拒绝。这是站点上游模型账户欠费，不是您个人钱包余额问题。', 'Số dư tài khoản model Seedream upstream không đủ, yêu cầu tạo ảnh bị từ chối. Đây là tài khoản model upstream của site nợ phí, không phải vấn đề số dư ví cá nhân của bạn.'),
      suggestion: tv('请联系站点管理员在 TokenFree 控制台充值；充值完成后请重试生图。', 'Vui lòng liên hệ quản trị viên site nạp tiền trong bảng điều khiển TokenFree; nạp xong hãy thử tạo ảnh lại.'),
      upstreamAccountBlocked: true,
    }
  }

  if (isBillingError(text)) {
    return {
      title: tv('余额不足', 'Số dư không đủ'),
      message: /余额不足|请先充值/.test(text) ? text : tv('当前余额不足，无法继续生成。', 'Số dư hiện tại không đủ, không thể tiếp tục tạo.'),
      suggestion: tv('请先充值后再重试该任务。', 'Vui lòng nạp tiền rồi thử lại tác vụ này.'),
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
        title: tv('参考图疑似真人', 'Ảnh tham chiếu nghi có người thật'),
        message: tv(`视频服务审核未通过：${named[1]}「${named[2]}」的参考图可能含真人肖像，已拒绝生成。`, `Dịch vụ video duyệt không qua: ảnh tham chiếu của ${named[1]} “${named[2]}” có thể chứa chân dung người thật, đã từ chối tạo.`),
        suggestion: tv(`请在左侧资产中打开「${named[2]}」，重新生成或上传偏动漫/插画的形象后再生成该分镜。`, `Vui lòng mở “${named[2]}” trong tài sản bên trái, tạo lại hoặc tải lên hình tượng thiên về anime/minh họa rồi mới tạo phân cảnh này.`),
      }
    }
    const where =
      idx != null
        ? tv(`（提交内容第 ${idx + 1} 项 / content[${idx}]，多为角色或场景参考图）`, `(Mục thứ ${idx + 1} của nội dung gửi / content[${idx}], phần lớn là ảnh tham chiếu nhân vật hoặc bối cảnh)`)
        : tv('（某张参考图）', '(Một ảnh tham chiếu nào đó)')
    return {
      title: tv('参考图疑似真人', 'Ảnh tham chiếu nghi có người thật'),
      message: tv(`视频服务审核未通过：输入图片${where}可能含真人肖像，已拒绝生成。`, `Dịch vụ video duyệt không qua: ảnh đầu vào ${where} có thể chứa chân dung người thật, đã từ chối tạo.`),
      suggestion:
        tv('打开左侧资产，为相关角色/场景重新用 AI 生成偏动漫或插画的形象（避免真人照片），或上传合规图后再重新生成该分镜。', 'Mở tài sản bên trái, tạo lại bằng AI hình tượng thiên về anime hoặc minh họa cho nhân vật/bối cảnh liên quan (tránh ảnh người thật), hoặc tải ảnh hợp quy rồi tạo lại phân cảnh này.'),
    }
  }

  if (/重试超过上限|超过重试上限|内部自动重试超过上限/.test(text)) {
    return {
      title: tv('多次生成仍失败', 'Tạo nhiều lần vẫn thất bại'),
      message: text,
      suggestion:
        tv('这是同一次任务内的自动重试耗尽，不是禁止你再点生成。请根据真实原因（常见是参考图真人审核）改素材或文案后，再重新点生成。', 'Đây là do thử lại tự động trong cùng một tác vụ đã hết lượt, không phải cấm bạn bấm tạo lại. Hãy đổi tư liệu hoặc nội dung theo nguyên nhân thực tế (thường là duyệt người thật trong ảnh tham chiếu) rồi bấm tạo lại.'),
    }
  }

  if (/上一镜失败|无法衔接尾帧/.test(text)) {
    return {
      title: tv('无法衔接上一镜', 'Không nối được cảnh trước'),
      message: tv('本镜依赖上一镜的尾帧衔接，但上一镜未成功，因此本镜未开始生成。', 'Cảnh này phụ thuộc khung cuối của cảnh trước để nối, nhưng cảnh trước chưa thành công nên cảnh này chưa bắt đầu tạo.'),
      suggestion: tv('先修复并重新生成失败的上一镜，再按镜序生成后续片段。', 'Hãy sửa và tạo lại cảnh trước đã thất bại, rồi tạo các đoạn sau theo thứ tự cảnh.'),
    }
  }

  if (/分镜已变更|分镜上下文丢失|分镜不存在/.test(text)) {
    return {
      title: tv('分镜已更新', 'Phân cảnh đã được cập nhật'),
      message: tv('分镜在生成过程中被保存或重切，旧任务已失效。', 'Phân cảnh bị lưu hoặc cắt lại trong lúc tạo, tác vụ cũ đã mất hiệu lực.'),
      suggestion: tv('请回到分集页，用当前分镜列表重新点生成；不要重试旧任务。', 'Vui lòng quay lại trang tập, dùng danh sách phân cảnh hiện tại bấm tạo lại; đừng thử lại tác vụ cũ.'),
    }
  }

  if (/InputTextSensitive|text.*sensitive|敏感/i.test(text) && /Seedance|create error/i.test(text)) {
    return {
      title: tv('文案未通过审核', 'Nội dung chưa qua duyệt'),
      message: tv('分镜脚本或提示词触发了内容安全审核。', 'Kịch bản phân cảnh hoặc prompt đã kích hoạt kiểm duyệt an toàn nội dung.'),
      suggestion: tv('请修改分镜中的敏感表述后重试。', 'Vui lòng sửa các diễn đạt nhạy cảm trong phân cảnh rồi thử lại.'),
    }
  }

  if (/resource download failed|audio_url/i.test(text) && !/audio duration/i.test(text)) {
    return {
      title: tv('参考音频无法下载', 'Không tải được âm thanh tham chiếu'),
      message: tv('音色参考文件地址无效或暂时无法访问。', 'Địa chỉ tệp tham chiếu giọng nói không hợp lệ hoặc tạm thời không truy cập được.'),
      suggestion: tv('检查角色绑定的试听音频，重新生成或更换音色后再试。', 'Kiểm tra âm thanh nghe thử đã gắn cho nhân vật, tạo lại hoặc đổi giọng nói rồi thử lại.'),
    }
  }

  if (/无法读取参考音频时长|参考音频地址为空/i.test(text)) {
    const named = extractNamedSlot(text)
    return {
      title: tv('参考音频无法校验', 'Không xác minh được âm thanh tham chiếu'),
      message: named
        ? tv(`无法读取 ${named} 的参考音频时长或地址无效。`, `Không đọc được thời lượng âm thanh tham chiếu của ${named} hoặc địa chỉ không hợp lệ.`)
        : text.length > 160
          ? `${text.slice(0, 160)}…`
          : text,
      suggestion: tv('请检查角色/旁白试听文件是否可访问，重新上传或生成后再生成该分镜。', 'Vui lòng kiểm tra tệp nghe thử của nhân vật/lời dẫn có truy cập được không, tải lên hoặc tạo lại rồi mới tạo phân cảnh này.'),
    }
  }

  if (/参考音频过长/i.test(text)) {
    const named = extractNamedSlot(text)
    const dur = text.match(/当前约\s*([\d.]+)\s*秒/)
    return {
      title: tv('参考音频过长', 'Âm thanh tham chiếu quá dài'),
      message: named
        ? tv(`${named} 参考音频过长${dur ? `（约 ${dur[1]} 秒）` : ''}，须 ≤ 30 秒。`, `Âm thanh tham chiếu của ${named} quá dài${dur ? `（约 ${dur[1]} 秒）` : ''}, phải ≤ 30 giây.`)
        : text.length > 160
          ? `${text.slice(0, 160)}…`
          : text,
      suggestion: tv('请截短对应角色/旁白试听音频后再生成该分镜。这不是参考图问题。', 'Vui lòng cắt ngắn âm thanh nghe thử của nhân vật/lời dẫn tương ứng rồi mới tạo phân cảnh này. Đây không phải vấn đề ảnh tham chiếu.'),
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
      (idx != null ? tv(`提交内容第 ${idx + 1} 项 / content[${idx}]（参考音频，不是图片）`, `Mục thứ ${idx + 1} của nội dung gửi / content[${idx}] (âm thanh tham chiếu, không phải ảnh)`) : tv('某条角色/旁白音色', 'Giọng nói của một nhân vật/lời dẫn nào đó'))
    return {
      title: tv('参考音频过短', 'Âm thanh tham chiếu quá ngắn'),
      message: dur
        ? tv(`${where} 参考音频约 ${dur[1]} 秒，须 ≥ 1.8 秒。`, `Âm thanh tham chiếu của ${where} khoảng ${dur[1]} giây, phải ≥ 1,8 giây.`)
        : tv(`视频服务要求参考音频时长 ≥ 1.8 秒，当前过短：${where}。`, `Dịch vụ video yêu cầu âm thanh tham chiếu dài ≥ 1,8 giây, hiện quá ngắn: ${where}.`),
      suggestion:
        tv('打开左侧对应角色或旁白资产，重新生成/上传更长的试听音频（建议 ≥ 2 秒）后再生成该分镜。这不是参考图问题。', 'Mở tài sản nhân vật hoặc lời dẫn tương ứng ở bên trái, tạo lại/tải lên âm thanh nghe thử dài hơn (gợi ý ≥ 2 giây) rồi mới tạo phân cảnh này. Đây không phải vấn đề ảnh tham chiếu.'),
    }
  }

  if (/only support adaptive aspect ratio|adaptive aspect ratio/i.test(text)) {
    return {
      title: tv('画幅参数不兼容', 'Tham số tỷ lệ khung không tương thích'),
      message: tv('当前视频通道的图生视频若走单首帧，固定比例可能被拒绝。', 'Nếu ảnh thành video của kênh video hiện tại chạy bằng một khung đầu, tỷ lệ cố định có thể bị từ chối.'),
      suggestion: tv('请重新生成该分镜；服务端会按参考图自适应画幅。', 'Vui lòng tạo lại phân cảnh này; máy chủ sẽ tự thích ứng tỷ lệ khung theo ảnh tham chiếu.'),
    }
  }

  if (/Credits insufficient|积分不足|余额不足.*[Kk]ie|Kie.*积分/i.test(text)) {
    return {
      title: tv('视频渠道积分不足', 'Kênh video không đủ điểm'),
      message: tv('上游账户积分不足，无法创建视频生成任务（不是参考图或音频时长问题）。', 'Điểm tài khoản upstream không đủ, không thể tạo tác vụ tạo video (không phải vấn đề ảnh tham chiếu hay thời lượng âm thanh).'),
      suggestion: tv('请联系管理员在 TokenFree 控制台充值后再重试；充值后重新生成该分镜即可。', 'Vui lòng liên hệ quản trị viên nạp tiền trong bảng điều khiển TokenFree rồi thử lại; nạp xong tạo lại phân cảnh này là được.'),
      upstreamAccountBlocked: true,
    }
  }

  if (/未开通|无可用渠道|distributor/i.test(text)) {
    return {
      title: tv('图像模型未开通', 'Model hình ảnh chưa được mở'),
      message: text.length > 180 ? `${text.slice(0, 180)}…` : text,
      suggestion: tv('请管理员在 TokenFree 控制台为 default 分组开通该模型（如 GPT Image 2.5）后再生成。', 'Vui lòng nhờ quản trị viên mở model này (như GPT Image 2.5) cho nhóm default trong bảng điều khiển TokenFree rồi mới tạo.'),
    }
  }

  if (/File type not supported|参考图格式不支持|不支持 SVG/i.test(text)) {
    return {
      title: tv('参考图格式不支持', 'Định dạng ảnh tham chiếu không được hỗ trợ'),
      message:
        text.includes('参考图格式不支持')
          ? text
          : tv('上游拒绝了参考图：File type not supported（常见原因是 SVG 占位图或非位图）。', 'Upstream từ chối ảnh tham chiếu: File type not supported (nguyên nhân thường gặp là ảnh giữ chỗ SVG hoặc không phải ảnh bitmap).'),
      suggestion:
        tv('检查本镜引用的角色/场景/道具封面是否为 PNG/JPG/WEBP。若仍是 SVG 占位图，请对该资产重新生图或上传位图后再生成视频。', 'Kiểm tra ảnh bìa nhân vật/bối cảnh/đạo cụ mà cảnh này tham chiếu có phải PNG/JPG/WEBP không. Nếu vẫn là ảnh giữ chỗ SVG, hãy tạo lại ảnh cho tài sản đó hoặc tải ảnh bitmap lên rồi mới tạo video.'),
    }
  }

  // 参考图槽位收到非图片（常见：音色 mp3 误进 image_url）
  if (/invalid image format|参考图格式无效/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tv(`提交内容第 ${idx + 1} 项 / content[${idx}]`, `Mục thứ ${idx + 1} của nội dung gửi / content[${idx}]`) : tv('某张参考图', 'Một ảnh tham chiếu nào đó'))
    return {
      title: tv('参考图格式无效', 'Định dạng ảnh tham chiếu không hợp lệ'),
      message: tv(`视频服务按图片校验失败：${where}。这不是参考音频时长问题。`, `Dịch vụ video kiểm tra ảnh thất bại: ${where}. Đây không phải vấn đề thời lượng âm thanh tham chiếu.`),
      suggestion:
        tv('请检查本镜角色/场景封面是否为 PNG/JPG/WEBP；若画布上挂了独立音色节点，确认它只作参考音频、不要占用参考图。修好素材后重新生成该分镜。', 'Vui lòng kiểm tra ảnh bìa nhân vật/bối cảnh của cảnh này có phải PNG/JPG/WEBP không; nếu trên canvas có gắn nút giọng nói độc lập, hãy xác nhận nó chỉ là âm thanh tham chiếu, đừng chiếm vị trí ảnh tham chiếu. Sửa tư liệu xong tạo lại phân cảnh này.'),
    }
  }

  if (/Seedance create error\s*400|Kie createTask error/i.test(text)) {
    const idx = extractContentIndex(text)
    const named = extractNamedSlot(text)
    const where =
      named ||
      (idx != null ? tv(`（提交内容第 ${idx + 1} 项 / content[${idx}]）`, `(Mục thứ ${idx + 1} của nội dung gửi / content[${idx}])`) : '')
    return {
      title: tv('视频服务拒绝请求', 'Dịch vụ video từ chối yêu cầu'),
      message: tv(`上游返回参数或内容错误，未能创建生成任务${where}。`, `Upstream trả về lỗi tham số hoặc nội dung, không tạo được tác vụ tạo${where}.`),
      suggestion:
        tv('优先检查本镜参考图是否为可访问的 PNG/JPG/WEBP；若错误原文含 audio duration 再查参考音频是否 ≥ 1.8 秒。持续失败请联系客服并提供任务号。', 'Ưu tiên kiểm tra ảnh tham chiếu của cảnh này có phải PNG/JPG/WEBP truy cập được không; nếu nội dung lỗi gốc có audio duration thì kiểm tra âm thanh tham chiếu có ≥ 1,8 giây không. Thất bại liên tục thì liên hệ CSKH và cung cấp mã tác vụ.'),
    }
  }

  if (/Seedance|上游生成失败/i.test(text)) {
    return {
      title: tv('视频生成失败', 'Tạo video thất bại'),
      message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      suggestion: tv('可稍后重试该分镜；连续失败时请更换参考图或简化脚本。', 'Có thể thử lại phân cảnh này sau; thất bại liên tiếp thì hãy đổi ảnh tham chiếu hoặc đơn giản hóa kịch bản.'),
    }
  }

  if (/跳过重复任务|分镜已生成完成/.test(text)) {
    return {
      title: tv('旧任务已跳过', 'Tác vụ cũ đã bị bỏ qua'),
      message: tv('调度器发现该分镜已有成片，因此取消了这条重复入队的旧任务。', 'Bộ điều phối phát hiện phân cảnh này đã có phim nên đã hủy tác vụ cũ bị xếp hàng trùng.'),
      suggestion:
        tv('若你是在「重新生成」，请看队列里是否还有进行中的新任务；没有的话再点一次重新生成。不要把这条旧取消当成当前失败。', 'Nếu bạn đang “Tạo lại”, hãy xem trong hàng đợi còn tác vụ mới đang chạy không; nếu không có thì bấm tạo lại thêm một lần. Đừng coi lần hủy cũ này là thất bại hiện tại.'),
    }
  }

  if (/已取消|任务已中断/.test(text)) {
    return {
      title: text.includes('取消') ? tv('已取消', 'Đã hủy') : tv('任务已中断', 'Tác vụ đã bị gián đoạn'),
      message: text,
      suggestion: tv('需要成片时请重新入队生成。', 'Khi cần phim hãy xếp hàng tạo lại.'),
    }
  }

  // 成片下载被对端掐断（TokenFree content / CDN），不是参考图或脚本问题
  if (/RemoteProtocolError|peer closed|complete message body|incomplete download/i.test(text)) {
    return {
      title: tv('成片下载中断', 'Tải phim bị gián đoạn'),
      message: tv('视频已在上游生成，但下载到服务器时连接被中断。', 'Video đã được tạo ở upstream, nhưng kết nối bị gián đoạn khi tải về máy chủ.'),
      suggestion: tv('系统会沿原任务自动重试下载，请勿重新生成该节点。', 'Hệ thống sẽ tự động thử lại tải theo tác vụ gốc, vui lòng đừng tạo lại nút này.'),
    }
  }

  // 浏览器层断连：不是脚本/参考图问题，常因后端热重载或瞬时网络
  if (/failed to fetch|networkerror|load failed|connection reset|连接被重置/i.test(text)) {
    return {
      title: tv('网络中断', 'Mạng bị gián đoạn'),
      message: tv('请求后端失败（Failed to fetch）。任务可能仍在排队或已完成。', 'Yêu cầu backend thất bại (Failed to fetch). Tác vụ có thể vẫn đang xếp hàng hoặc đã hoàn tất.'),
      suggestion: tv('请刷新画布查看节点是否已有成片；没有的话再点一次生成。开发时后端 --reload 热重载也容易触发此提示。', 'Vui lòng làm mới canvas xem nút đã có phim chưa; nếu chưa thì bấm tạo lại. Khi phát triển, backend --reload nóng cũng dễ gây ra thông báo này.'),
    }
  }

  // 已是较短中文：原样展示，补通用建议
  if (!/[{\\[\]"]/.test(text) && text.length <= 120 && /[\u4e00-\u9fff]/.test(text)) {
    return {
      title: tv('生成失败', 'Tạo thất bại'),
      message: text,
      suggestion: tv('请按提示处理后重新生成该分镜。', 'Vui lòng xử lý theo gợi ý rồi tạo lại phân cảnh này.'),
    }
  }

  return {
    title: tv('生成失败', 'Tạo thất bại'),
    message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    suggestion: tv('请检查本镜参考图与脚本后重试。', 'Vui lòng kiểm tra ảnh tham chiếu và kịch bản của cảnh này rồi thử lại.'),
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
