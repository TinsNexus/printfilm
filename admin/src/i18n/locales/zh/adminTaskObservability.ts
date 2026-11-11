/** 中文：任务上游观测（taskObservability） */

export const zhAdminTaskObservability = {
  taskObs: {
    notRecorded: "未记录",
    billing: {
      none: "未预扣 · 尚未结算",
      frozen: "已冻结 · 尚未结算",
      settled: "已结算",
      skipped: "已跳过预扣 · 尚未结算",
      unknown: "计费状态未记录",
    },
    state: {
      queued: "上游排队",
      running: "上游生成中",
      done: "上游完成",
      failed: "上游失败",
      cancelled: "上游已取消",
    },
    hasTaskNoHttp: "已有上游任务 · HTTP未记录",
    noRequests: "尚无上游请求记录",
    phase: {
      started: "开始请求",
      accepted: "上游响应",
      failed: "请求失败",
      poll: "查询结果",
      simulated: "本地模拟 · 参数已记录",
    },
    durSeconds: "{s}秒",
    durMinutes: "{m}分{s}秒",
    durHours: "{h}小时{m}分",
    upstreamStatus: "上游状态：{status}",
  },
} as const;
