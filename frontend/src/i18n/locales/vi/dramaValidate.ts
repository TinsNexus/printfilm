/** 越南语：漫剧分集脚本校验提示（dramaEpisodeScriptValidate） */

export const viDramaValidate = {
  scriptValidate: {
    listSep: ', ',
    missingImage: 'Các tài nguyên sau thiếu ảnh tham chiếu, khi tạo có thể tự bổ sung ảnh hoặc kết quả không ổn định: {names}',
    missingVoice: 'Kịch bản có thoại nhưng các nhân vật sau chưa gắn giọng nói: {names}',
    eachDurationMustBetween: 'Mỗi @duration phải nằm trong khoảng {DRAMA_SEGMENT_DURATION_MIN}–{DRAMA_SEGMENT_DURATION_HARD_MAX} giây',
    someDurationValuesExceed: 'Một số @duration vượt mức khuyến nghị {DRAMA_SEGMENT_DURATION_MAX}s cho cảnh mới; bản nháp cũ vẫn có thể tạo tiếp',
    shotSDurationTotal: 'Tổng @duration của cảnh này là {total}s, vượt giới hạn Seedance {DRAMA_SHOT_DURATION_HARD_MAX}s',
    shotSDurationTotal2: 'Tổng @duration của cảnh này là {total}s, vượt mức khuyến nghị {FRAGMENT_CONTENT_DURATION_MAX}s cho cảnh mới (bản nháp cũ vẫn có thể tạo tiếp)',
    shotSizeEmptyShot: 'Phát hiện dòng “空镜 / cỡ cảnh” (cảnh trống / khung hình) bị gắn nhãn thoại hoặc lời dẫn (sẽ được đọc và in phụ đề). Hãy đổi thành “【画面·无配音仅环境音】” hoặc một dòng hình ảnh thuần như “空镜：…”.',
    mustFixFirst: '[Cần sửa trước]',
    recommendedStillContinue: '[Nên xử lý — vẫn có thể tiếp tục]',
  },
} as const
