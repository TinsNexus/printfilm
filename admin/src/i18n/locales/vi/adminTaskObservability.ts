/** 越南语：任务上游观测（taskObservability） */

export const viAdminTaskObservability = {
  taskObs: {
    notRecorded: "Chưa ghi nhận",
    billing: {
      none: "Chưa giữ trước · chưa quyết toán",
      frozen: "Đã đóng băng · chưa quyết toán",
      settled: "Đã quyết toán",
      skipped: "Đã bỏ qua giữ trước · chưa quyết toán",
      unknown: "Chưa ghi nhận trạng thái tính phí",
    },
    state: {
      queued: "Upstream xếp hàng",
      running: "Upstream đang tạo",
      done: "Upstream hoàn tất",
      failed: "Upstream thất bại",
      cancelled: "Upstream đã hủy",
    },
    hasTaskNoHttp: "Đã có tác vụ upstream · chưa ghi nhận HTTP",
    noRequests: "Chưa có bản ghi yêu cầu upstream",
    phase: {
      started: "Bắt đầu yêu cầu",
      accepted: "Phản hồi upstream",
      failed: "Yêu cầu thất bại",
      poll: "Kết quả truy vấn",
      simulated: "Mô phỏng cục bộ · đã ghi lại tham số",
    },
    durSeconds: "{s} giây",
    durMinutes: "{m} phút {s} giây",
    durHours: "{h} giờ {m} phút",
    upstreamStatus: "Trạng thái upstream: {status}",
  },
} as const;
