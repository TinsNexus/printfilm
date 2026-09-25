/** 越南语：漫剧生成失败的可读说明（对应 lib/dramaGenError.ts） */

export const viErrors = {
  genErr: {
    slotNamed: '{kind} “{name}”',
    slot: { 角色: 'Nhân vật', 场景: 'Bối cảnh', 道具: 'Đạo cụ', 旁白: 'Người dẫn chuyện', 参考图: 'Ảnh tham chiếu', 音色: 'Giọng nói' },
    failed: 'Tạo thất bại',
    empty: {
      message: 'Tác vụ chưa hoàn thành và không ghi lại thông tin lỗi cụ thể.',
      suggestion: 'Vui lòng thử lại sau. Nếu vẫn lỗi, hãy kiểm tra mạng/proxy có truy cập được TokenFree không và khóa kênh mô hình trong trang quản trị.',
    },
    timeout: {
      title: 'Phản hồi từ upstream quá hạn',
      suggestion:
        'Đã kết nối được TokenFree nhưng thời gian chờ tạo ảnh/video vượt giới hạn. Vui lòng thử lại sau. Nếu tạo văn bản bình thường mà chỉ ảnh/video bị quá hạn, nhiều khả năng hàng đợi upstream đang chậm, không phải do proxy mất mạng.',
    },
    connect: {
      title: 'Không kết nối được dịch vụ ảnh/video',
      suggestion:
        'Máy hiện không kết nối được upstream (thường do proxy chưa cho phép hoặc mạng bị ngắt). Hãy kiểm tra mạng/proxy rồi thử lại, đồng thời xác nhận khóa kênh TokenFree trong trang quản trị còn hiệu lực.',
    },
    legacyImage: {
      title: 'Tạo ảnh thất bại',
      message: 'Tạo ảnh không thành công, nhưng tác vụ cũ không lưu lý do cụ thể (thường là lỗi kết nối upstream và nội dung lỗi trống).',
      suggestion: 'Hãy tạo lại một lần; phiên bản mới sẽ ghi rõ lỗi. Nếu vẫn thất bại, kiểm tra mạng và khóa TokenFree.',
    },
    upstreamAccount: {
      title: 'Tài khoản upstream của nền tảng đã hết tiền',
      message: 'Số dư tài khoản mô hình Seedream ở upstream không đủ nên yêu cầu tạo ảnh bị từ chối. Đây là tài khoản mô hình upstream của trang, không phải ví cá nhân của bạn.',
      suggestion: 'Vui lòng liên hệ quản trị viên nạp tiền ở bảng điều khiển TokenFree, sau đó thử tạo ảnh lại.',
    },
    balance: {
      title: 'Số dư không đủ',
      message: 'Số dư hiện tại không đủ để tiếp tục tạo.',
      suggestion: 'Vui lòng nạp tiền rồi thử lại tác vụ này.',
    },
    realPerson: {
      title: 'Ảnh tham chiếu có thể là người thật',
      messageNamed: 'Dịch vụ video không duyệt được: ảnh tham chiếu của {slot} có thể chứa chân dung người thật nên đã bị từ chối.',
      suggestionNamed: 'Hãy mở “{name}” trong tài nguyên bên trái, tạo lại hoặc tải lên hình ảnh phong cách anime/minh họa, rồi tạo lại cảnh này.',
      whereIndex: ' (mục thứ {n} của nội dung gửi đi / content[{idx}], thường là ảnh tham chiếu nhân vật hoặc bối cảnh)',
      whereUnknown: ' (một ảnh tham chiếu nào đó)',
      message: 'Dịch vụ video không duyệt được: ảnh đầu vào{where} có thể chứa chân dung người thật nên đã bị từ chối.',
      suggestion:
        'Mở tài nguyên bên trái, dùng AI tạo lại nhân vật/bối cảnh liên quan theo phong cách anime hoặc minh họa (tránh ảnh người thật), hoặc tải lên ảnh hợp lệ rồi tạo lại cảnh này.',
    },
    retryExhausted: {
      title: 'Nhiều lần tạo vẫn thất bại',
      suggestion:
        'Đây là do số lần tự thử lại trong cùng một tác vụ đã hết, không phải bạn bị cấm bấm tạo lại. Hãy sửa nguyên nhân thật (thường là bị duyệt vì ảnh tham chiếu có người thật) bằng cách đổi tài nguyên hoặc nội dung, rồi bấm tạo lại.',
    },
    prevShot: {
      title: 'Không thể nối tiếp cảnh trước',
      message: 'Cảnh này nối tiếp từ khung hình cuối của cảnh trước, nhưng cảnh trước chưa thành công nên cảnh này chưa bắt đầu tạo.',
      suggestion: 'Hãy sửa và tạo lại cảnh trước bị lỗi trước, rồi tạo các đoạn sau theo thứ tự cảnh.',
    },
    shotChanged: {
      title: 'Storyboard đã được cập nhật',
      message: 'Storyboard đã bị lưu hoặc cắt lại trong lúc tạo nên tác vụ cũ không còn hiệu lực.',
      suggestion: 'Hãy quay lại trang tập phim và tạo lại từ danh sách cảnh hiện tại; đừng thử lại tác vụ cũ.',
    },
    textSensitive: {
      title: 'Nội dung chữ không qua kiểm duyệt',
      message: 'Kịch bản cảnh hoặc prompt đã kích hoạt kiểm duyệt an toàn nội dung.',
      suggestion: 'Hãy sửa các cách diễn đạt nhạy cảm trong cảnh rồi thử lại.',
    },
    audioDownload: {
      title: 'Không tải được âm thanh tham chiếu',
      message: 'Địa chỉ tệp giọng nói tham chiếu không hợp lệ hoặc tạm thời không truy cập được.',
      suggestion: 'Kiểm tra âm thanh nghe thử đã gắn cho nhân vật, tạo lại hoặc đổi giọng khác rồi thử lại.',
    },
    audioShort: {
      title: 'Âm thanh tham chiếu quá ngắn',
      whereIndex: 'mục thứ {n} của nội dung gửi đi / content[{idx}] (âm thanh tham chiếu, không phải hình ảnh)',
      whereUnknown: 'giọng của một nhân vật/người dẫn chuyện',
      message: 'Dịch vụ video yêu cầu âm thanh tham chiếu dài ≥ 1,8 giây; hiện quá ngắn: {where}.',
      suggestion:
        'Mở tài nguyên nhân vật hoặc người dẫn chuyện tương ứng ở bên trái, tạo lại/tải lên âm thanh nghe thử dài hơn (khuyến nghị ≥ 2 giây) rồi tạo lại cảnh này. Đây không phải lỗi ảnh tham chiếu.',
    },
    aspect: {
      title: 'Tỷ lệ khung không tương thích',
      message: 'Với kênh video hiện tại, nếu chuyển ảnh thành video chỉ dùng một khung đầu thì tỷ lệ cố định có thể bị từ chối.',
      suggestion: 'Hãy tạo lại cảnh này; máy chủ sẽ tự điều chỉnh tỷ lệ theo ảnh tham chiếu.',
    },
    kieCredits: {
      title: 'Kênh video hết điểm',
      message: 'Tài khoản upstream không đủ điểm nên không tạo được tác vụ video (không phải do ảnh tham chiếu hay độ dài âm thanh).',
      suggestion: 'Vui lòng liên hệ quản trị viên nạp tiền ở bảng điều khiển TokenFree, sau đó tạo lại cảnh này.',
    },
    fileType: {
      title: 'Định dạng ảnh tham chiếu không được hỗ trợ',
      message: 'Upstream từ chối ảnh tham chiếu: File type not supported (thường do ảnh giữ chỗ SVG hoặc tệp không phải ảnh bitmap).',
      suggestion:
        'Kiểm tra ảnh bìa nhân vật/bối cảnh/đạo cụ được dùng trong cảnh này có phải PNG/JPG/WEBP không. Nếu vẫn là ảnh giữ chỗ SVG, hãy tạo lại ảnh hoặc tải lên ảnh bitmap rồi tạo video.',
    },
    rejected: {
      title: 'Dịch vụ video từ chối yêu cầu',
      whereIndex: ' (mục thứ {n} của nội dung gửi đi / content[{idx}])',
      message: 'Upstream trả về lỗi tham số hoặc nội dung nên không tạo được tác vụ{where}.',
      suggestion: 'Kiểm tra ảnh tham chiếu, độ dài âm thanh tham chiếu (phải ≥ 1,8 giây) và kịch bản của cảnh này rồi thử lại; nếu vẫn lỗi, hãy liên hệ hỗ trợ kèm mã tác vụ.',
    },
    videoFailed: {
      title: 'Tạo video thất bại',
      suggestion: 'Có thể thử lại cảnh này sau; nếu lỗi liên tục, hãy đổi ảnh tham chiếu hoặc đơn giản hóa kịch bản.',
    },
    skipped: {
      title: 'Đã bỏ qua tác vụ cũ',
      message: 'Bộ lập lịch thấy cảnh này đã có bản phim hoàn chỉnh nên đã hủy tác vụ cũ được xếp hàng trùng lặp.',
      suggestion:
        'Nếu bạn đang “tạo lại”, hãy xem trong hàng đợi còn tác vụ mới đang chạy không; nếu không có thì bấm tạo lại một lần nữa. Đừng coi việc hủy tác vụ cũ này là lỗi hiện tại.',
    },
    cancelled: 'Đã hủy',
    interrupted: 'Tác vụ đã bị gián đoạn',
    requeue: 'Khi cần bản phim, hãy đưa vào hàng đợi tạo lại.',
    plainSuggestion: 'Hãy xử lý theo thông báo rồi tạo lại cảnh này.',
    fallbackSuggestion: 'Kiểm tra ảnh tham chiếu và kịch bản của cảnh này rồi thử lại.',
  },
} as const
