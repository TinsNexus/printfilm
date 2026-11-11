/** 越南语：数字资产市场状态与详情标题（features/marketplace/presentation） */

export const viAdminMarketplaceStatus = {
  mkStatus: {
    review: {
      draft: "Bản nháp",
      pending: "Chờ duyệt",
      processing: "Đang tạo bản xem thử ngắn",
      previewFailed: "Tạo xem thử ngắn thất bại",
      approved: "Đã duyệt",
      rejected: "Đã từ chối",
    },
    task: {
      pending: "Đang xếp hàng",
      running: "Đang xử lý",
      done: "Đã hoàn tất",
      ready: "Đã sẵn sàng",
      failed: "Xử lý thất bại",
      cancelled: "Đã hủy",
      missing: "Chưa tạo",
    },
    order: {
      pending: "Chờ thanh toán",
      paid: "Đã thanh toán",
      failed: "Thanh toán thất bại",
    },
    payout: {
      pending: "Chờ chi trả",
      paid: "Đã chi trả",
      failed: "Chi trả thất bại",
    },
    report: {
      pending: "Chờ xử lý",
      resolved: "Đã xử lý",
    },
    entitlement: {
      active: "Quyền lợi hiệu lực",
      inactive: "Đã tắt",
    },
    ledger: {
      pending: "Chờ quyết toán",
      settled: "Đã quyết toán",
      unknown: "Trạng thái quyết toán chờ xác nhận",
    },
    unknown: "Trạng thái chờ xác nhận",
    detail: {
      works: "Thông tin tác phẩm và bản quyền",
      series: "Thông tin phim ngắn và bản quyền",
      recruits: "Chi tiết nhu cầu tuyển dụng",
      reports: "Chi tiết báo cáo",
      previews: "Chi tiết tác vụ xem thử ngắn",
      jobs: "Chi tiết tác vụ phương tiện lịch sử",
      submissions: "Chi tiết đóng góp lịch sử",
      orders: "Chi tiết đơn hàng",
      entitlements: "Chi tiết quyền phát",
      ledger: "Chi tiết doanh thu",
      payouts: "Chi tiết chi trả",
      events: "Chi tiết thao tác",
      default: "Chi tiết bản ghi",
    },
  },
} as const;
