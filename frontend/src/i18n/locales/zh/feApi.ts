/** 中文：前端文案：src/api */

export const zhFeApi = {
  generationTasks: {
    notSigned: "未登录",
    failedLoadTasks: "加载任务失败",
  },
  agentSkills: {
    requestFailed: "请求失败",
    uploadFailed: "上传失败",
  },
  http: {
    requestCancelled: "请求已取消",
  },
  apiPublicCapabilities: {
    couldNotReadFeatureStatus: "无法读取功能状态",
  },
  teams: {
    drama: "漫剧",
    untitledAsset: "未命名资产",
  },
  drama: {
    requestFailed: "请求失败",
    projectPageHasChanged: "项目页面已切换",
    workspaceHasChanged: "创作空间已切换",
  },
  tools: {
    notSigned: "未登录",
    estimatedCostUnavailable: "预计消耗暂不可用",
    failedLoadAssetLibrary: "加载资产库失败",
    generationFailed: "生成失败",
    queryFailed: "查询失败",
    failedLoad: "加载失败",
    failedLoadModelSettings: "加载模型配置失败",
  },
} as const;
