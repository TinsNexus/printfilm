/** 中文：API Key 管理（ApiKeysPanel） */

export const zhSettingsApi = {
  apiKeys: {
    keyMeta: '{prefix}… · 创建于 {when}',
    lastUsed: ' · 最近使用 {when}',
    failedLoad: '加载失败',
    defaultKey: '默认 Key',
    couldCreateKey: '创建失败',
    revokeApiKey: '撤销 API Key',
    revokeCannotUndone: '确定撤销「{itemName}」（{itemKey_prefix}…）？撤销后无法恢复。',
    revoke: '撤销',
    couldRevokeKey: '撤销失败',
    useApiKeyCall: '使用 API Key 调用生图、生视频与 Seedance 转发，按量从余额扣费',
    keyNameEG: 'Key 名称，如「生产环境」',
    working: '处理中…',
    createKey: '创建 Key',
    copySaveNowCannot: '请立即复制保存，关闭后无法再次查看：',
    copyKey: '复制 Key',
    apiKeysYet: '还没有 API Key',
    howCall: '调用说明',
    authPickOneHeader: '鉴权：Header 任选其一',
    imageGenerationSeedream: '生图（Seedream）',
    videoGenerationSeedanceFirst: '生视频（Seedance 首帧图生视频）',
    seedanceForwardingMultimodalBody: 'Seedance 转发（多模态 body）',
    queryVideoTask: '查询视频任务',
  },
} as const
