/** 英文：存储（OSS）设置（OssSettingsPanel） */

export const enAdminOssSettings = {
  oss: {
    sourceLine: "Configured via: {s}",
    srcAdmin: "Admin console",
    srcEnv: "Environment variables",
    storageSettingsSaved: "Storage settings saved",
    storageReadiness: "Storage readiness",
    alibabaCloudOss: "Alibaba Cloud OSS",
    ready: "Ready",
    incompleteCredentials: "Incomplete credentials",
    disabled: "Disabled",
    asyncUpload: "Async upload",
    on: "On",
    off: "Off",
    "1AlibabaCloudOss": "1. Alibaba Cloud OSS",
    generatedFilesLandLocally: "Generated files land locally first, then upload to OSS asynchronously",
    enableOss: "Enable OSS",
    whenOffOnlyLocal: "When off, only the local static directory is used",
    directoryPrefix: "Directory prefix",
    publicBaseUrl: "Public base URL",
    leaveBlankComposeHttps: "Leave blank to compose https://{bucket}.{endpoint} automatically",
    uploadQueueName: "Upload queue name",
    returnsLocalUrlFirst: "Returns the local URL first; the background queue uploads to OSS",
  },
} as const;
