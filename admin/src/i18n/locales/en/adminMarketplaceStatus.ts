/** 英文：数字资产市场状态与详情标题（features/marketplace/presentation） */

export const enAdminMarketplaceStatus = {
  mkStatus: {
    review: {
      draft: "Draft",
      pending: "Pending review",
      processing: "Generating short preview",
      previewFailed: "Short preview failed",
      approved: "Approved",
      rejected: "Rejected",
    },
    task: {
      pending: "Queued",
      running: "Processing",
      done: "Done",
      ready: "Ready",
      failed: "Failed",
      cancelled: "Cancelled",
      missing: "Not generated",
    },
    order: {
      pending: "Awaiting payment",
      paid: "Paid",
      failed: "Payment failed",
    },
    payout: {
      pending: "Awaiting payout",
      paid: "Paid out",
      failed: "Payout failed",
    },
    report: {
      pending: "Open",
      resolved: "Resolved",
    },
    entitlement: {
      active: "Active entitlement",
      inactive: "Disabled",
    },
    ledger: {
      pending: "Unsettled",
      settled: "Settled",
      unknown: "Settlement status unconfirmed",
    },
    unknown: "Status unconfirmed",
    detail: {
      works: "Work and rights",
      series: "Series and rights",
      recruits: "Recruitment details",
      reports: "Report details",
      previews: "Short preview task details",
      jobs: "Legacy media task details",
      submissions: "Legacy submission details",
      orders: "Order details",
      entitlements: "Playback entitlement details",
      ledger: "Revenue details",
      payouts: "Payout details",
      events: "Action details",
      default: "Record details",
    },
  },
} as const;
