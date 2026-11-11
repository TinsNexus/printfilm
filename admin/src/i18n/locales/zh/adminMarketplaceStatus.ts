/** 中文：数字资产市场状态与详情标题（features/marketplace/presentation） */

export const zhAdminMarketplaceStatus = {
  mkStatus: {
    review: {
      draft: "草稿",
      pending: "待审核",
      processing: "正在生成短试看",
      previewFailed: "短试看生成失败",
      approved: "已通过",
      rejected: "已驳回",
    },
    task: {
      pending: "排队中",
      running: "处理中",
      done: "已完成",
      ready: "已就绪",
      failed: "处理失败",
      cancelled: "已取消",
      missing: "未生成",
    },
    order: {
      pending: "待支付",
      paid: "已支付",
      failed: "支付失败",
    },
    payout: {
      pending: "待打款",
      paid: "已打款",
      failed: "打款失败",
    },
    report: {
      pending: "待处理",
      resolved: "已处理",
    },
    entitlement: {
      active: "有效权益",
      inactive: "已停用",
    },
    ledger: {
      pending: "待结算",
      settled: "已结算",
      unknown: "结算状态待确认",
    },
    unknown: "状态待确认",
    detail: {
      works: "作品与版权信息",
      series: "短剧与版权信息",
      recruits: "招募需求详情",
      reports: "举报详情",
      previews: "短试看任务详情",
      jobs: "历史媒体任务详情",
      submissions: "历史投稿详情",
      orders: "订单详情",
      entitlements: "播放权益详情",
      ledger: "收益明细",
      payouts: "打款详情",
      events: "操作详情",
      default: "记录详情",
    },
  },
} as const;
