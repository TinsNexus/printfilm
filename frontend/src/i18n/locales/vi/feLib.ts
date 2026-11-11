/** 越南语：前端文案：src/lib */

export const viFeLib = {
  generationError: {
    videoDidNotPassCopyright: "Video chưa qua duyệt bản quyền",
    videoServiceReportsResultMay: "Dịch vụ video báo kết quả tạo lần này có thể dính hạn chế bản quyền, tạm thời không cung cấp video được.",
    requestId: "\nMã yêu cầu: {requestId}",
    adjustPromptReferenceMaterialTry: "Vui lòng điều chỉnh prompt hoặc tư liệu tham chiếu rồi thử lại; nếu tư liệu là sáng tác gốc hoặc đã được cấp phép, vui lòng liên hệ CSKH kiểm tra.",
  },
  clientDownload: {
    untitledWork: "Tác phẩm chưa đặt tên",
    downloadFailed: "Tải xuống thất bại ({status})",
    selectCompletedProject: "Vui lòng chọn dự án đã hoàn tất",
  },
  creationApiError: {
    creationServiceApiNotLoaded: "Giao diện dịch vụ sáng tạo chưa được tải, vui lòng khởi động lại dịch vụ backend rồi thử lại.",
    creationSessionDoesNotExist: "Phiên sáng tạo không tồn tại hoặc đã bị xóa, vui lòng quay lại video ngắn của tôi hoặc tạo hội thoại mới.",
  },
  dramaGenerationOptions: {
    auto: "Tự động",
    auto2: "Tự động · {resolution}",
    imageModel: "Model hình ảnh",
  },
  agentSkillSelection: {
    noSkill: "Không dùng Skill",
  },
  segmentDuration: {
    eachDurationMustBetweenSeconds: "Mỗi @duration phải nằm trong khoảng {SEGMENT_DURATION_MIN}–{SEGMENT_DURATION_MAX} giây",
    totalShotDurationCannotExceed: "Tổng thời lượng cảnh quay không được vượt quá {SHOT_DURATION_MAX} giây (hiện {total}s)",
  },
  canvasNodeMedia: {
    untitled: "Chưa đặt tên",
  },
  imageTextStoryboard: {
    creationSettings: "Cài đặt sáng tạo",
    scriptStoryboard: "Lời dẫn và phân cảnh",
    visualsVoiceOver: "Hình ảnh và lồng tiếng",
    preview: "Xem trước phim",
  },
  billingError: {
    teamSpendingLimited: "Chi tiêu nhóm bị giới hạn",
    checkLimitTeamWalletTeam: "{message}. Vui lòng xem hạn mức của bạn trong ví nhóm; số dư và nạp tiền của nhóm do chủ sở hữu quản lý.",
    got: "Đã hiểu",
  },
  publicCapabilities: {
    voiceGenerationTemporarilyUnavailableChoose: "Tạo giọng nói tạm thời bị dừng, có thể chọn giọng có sẵn hoặc tải âm thanh lên.",
  },
  dramaAssetImage: {
    regenerateLook: "Tạo lại hình tượng",
    generateLook: "Tạo hình tượng",
  },
  apiError: {
    requestFailed: "Yêu cầu thất bại",
  },
  toolRunDetails: {
    videoGeneration: "Tạo video",
    imageGeneration: "Tạo hình ảnh",
    audioGeneration: "Tạo âm thanh",
    textGeneration: "Tạo văn bản",
    taskQueuedResultsWillUpdate: "Tác vụ đang xếp hàng, kết quả sẽ tự cập nhật.",
    taskGeneratingResultsWillUpdate: "Tác vụ đang tạo, kết quả sẽ tự cập nhật.",
    taskFinishedButThereNo: "Tác vụ đã hoàn tất, chưa có kết quả phương tiện để xem trước.",
    generationFailed: "Tạo thất bại.",
    taskWasCancelled: "Tác vụ đã bị hủy.",
    taskStatus: "Trạng thái tác vụ: {status}",
    generationRecord: "Bản ghi tạo",
  },
  dramaAssetImageVersions: {
    upload: "Tải lên",
    aiGenerated: "AI tạo",
    previousVersions: "Phiên bản lịch sử",
  },
  characterVoiceGenerate: {
    voiceDescriptionEmpty: "Mô tả giọng nói trống",
    voice: "Giọng {name}",
    voiceSynthesisFailed: "Tổng hợp giọng nói thất bại",
  },
  dramaVideoGenerationOptions: {
    videoModel: "Model video",
  },
  dramaUsage: {
    calls: " · Gọi {calls}",
    imagesVideos: "{charge} · Ảnh {image_gens} · Video {video_gens}{calls}",
  },
} as const;
