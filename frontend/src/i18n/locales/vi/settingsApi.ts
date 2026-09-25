/** 越南语：API Key 管理（ApiKeysPanel） */

export const viSettingsApi = {
  apiKeys: {
    keyMeta: '{prefix}… · tạo lúc {when}',
    lastUsed: ' · dùng gần nhất {when}',
    failedLoad: 'Tải thất bại',
    defaultKey: 'Key mặc định',
    couldCreateKey: 'Tạo key thất bại',
    revokeApiKey: 'Thu hồi API key',
    revokeCannotUndone: 'Thu hồi “{itemName}” ({itemKey_prefix}…)? Không thể khôi phục sau khi thu hồi.',
    revoke: 'Thu hồi',
    couldRevokeKey: 'Thu hồi thất bại',
    useApiKeyCall: 'Dùng API key để gọi tạo ảnh, tạo video và chuyển tiếp Seedance; chi phí trừ vào số dư theo mức dùng',
    keyNameEG: 'Tên key, ví dụ “Môi trường sản xuất”',
    working: 'Đang xử lý…',
    createKey: 'Tạo key',
    copySaveNowCannot: 'Hãy sao chép và lưu ngay — sau khi đóng sẽ không xem lại được:',
    copyKey: 'Sao chép key',
    apiKeysYet: 'Chưa có API key',
    howCall: 'Hướng dẫn gọi',
    authPickOneHeader: 'Xác thực: chọn một header',
    imageGenerationSeedream: 'Tạo ảnh (Seedream)',
    videoGenerationSeedanceFirst: 'Tạo video (Seedance từ ảnh khung đầu)',
    seedanceForwardingMultimodalBody: 'Chuyển tiếp Seedance (body đa phương thức)',
    queryVideoTask: 'Truy vấn tác vụ video',
  },
} as const
