/** 中文：前端文案：src/lib */

export const zhFeLib = {
  generationError: {
    videoDidNotPassCopyright: "视频未通过版权审核",
    videoServiceReportsResultMay: "视频服务提示本次生成结果可能涉及版权限制，暂时无法提供视频。",
    requestId: "\n请求编号：{requestId}",
    adjustPromptReferenceMaterialTry: "请调整提示词或参考素材后重试；如素材为原创或已获授权，请联系客服核查。",
  },
  clientDownload: {
    untitledWork: "未命名作品",
    downloadFailed: "下载失败（{status}）",
    selectCompletedProject: "请选择已完成的项目",
  },
  creationApiError: {
    creationServiceApiNotLoaded: "创作服务接口尚未加载，请重启后端服务后重试。",
    creationSessionDoesNotExist: "创作会话不存在或已被删除，请返回我的短片或新建对话。",
  },
  dramaGenerationOptions: {
    auto: "自动",
    auto2: "自动 · {resolution}",
    imageModel: "图片模型",
  },
  agentSkillSelection: {
    noSkill: "不使用 Skill",
  },
  segmentDuration: {
    eachDurationMustBetweenSeconds: "单个 @duration 需在 {SEGMENT_DURATION_MIN}–{SEGMENT_DURATION_MAX} 秒之间",
    totalShotDurationCannotExceed: "镜头时长合计不能超过 {SHOT_DURATION_MAX} 秒（当前 {total}s）",
  },
  canvasNodeMedia: {
    untitled: "未命名",
  },
  imageTextStoryboard: {
    creationSettings: "创作设置",
    scriptStoryboard: "文案与分镜",
    visualsVoiceOver: "画面与配音",
    preview: "成片预览",
  },
  billingError: {
    teamSpendingLimited: "团队消费受限",
    checkLimitTeamWalletTeam: "{message}。请在团队钱包查看本人额度；团队余额与充值由所有者管理。",
    got: "知道了",
  },
  publicCapabilities: {
    voiceGenerationTemporarilyUnavailableChoose: "音色生成暂时停用，可选择已有音色或上传音频。",
  },
  dramaAssetImage: {
    regenerateLook: "重新生成形象",
    generateLook: "生成形象",
  },
  apiError: {
    requestFailed: "请求失败",
  },
  toolRunDetails: {
    videoGeneration: "视频生成",
    imageGeneration: "图片生成",
    audioGeneration: "音频生成",
    textGeneration: "文字生成",
    taskQueuedResultsWillUpdate: "任务正在排队，结果会自动更新。",
    taskGeneratingResultsWillUpdate: "任务正在生成，结果会自动更新。",
    taskFinishedButThereNo: "任务已完成，暂无可预览的媒体结果。",
    generationFailed: "生成失败。",
    taskWasCancelled: "任务已取消。",
    taskStatus: "任务状态：{status}",
    generationRecord: "生成记录",
  },
  dramaAssetImageVersions: {
    upload: "上传",
    aiGenerated: "AI 生成",
    previousVersions: "历史版本",
  },
  characterVoiceGenerate: {
    voiceDescriptionEmpty: "音色描述为空",
    voice: "{name}音色",
    voiceSynthesisFailed: "音色合成失败",
  },
  dramaVideoGenerationOptions: {
    videoModel: "视频模型",
  },
  dramaUsage: {
    calls: " · 调用 {calls}",
    imagesVideos: "{charge} · 生图 {image_gens} · 生视频 {video_gens}{calls}",
  },
} as const;
