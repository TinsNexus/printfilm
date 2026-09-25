/** 中文：存储（OSS）设置（OssSettingsPanel） */

export const zhAdminOssSettings = {
  oss: {
    sourceLine: "配置来源：{s}",
    srcAdmin: "管理端",
    srcEnv: "环境变量",
    storageSettingsSaved: "存储配置已保存",
    storageReadiness: "存储就绪状态",
    alibabaCloudOss: "阿里云 OSS",
    ready: "已就绪",
    incompleteCredentials: "凭证不完整",
    disabled: "未启用",
    asyncUpload: "异步上传",
    on: "已开启",
    off: "已关闭",
    "1AlibabaCloudOss": "1. 阿里云 OSS",
    generatedFilesLandLocally: "生成文件先落本地，再异步上传 OSS",
    enableOss: "启用 OSS",
    whenOffOnlyLocal: "关闭后仅使用本地静态目录",
    directoryPrefix: "目录前缀",
    publicBaseUrl: "公网访问基址",
    leaveBlankComposeHttps: "留空则自动拼 https://{bucket}.{endpoint}",
    uploadQueueName: "上传队列名",
    returnsLocalUrlFirst: "先返回本地 URL，后台队列上传 OSS",
  },
} as const;
