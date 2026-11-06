/** Seedance 传值与脚本规则说明弹窗（分集编辑页，对齐 docs/EPISODE_RULES.md） */
import { useState } from 'react'
import Modal from '../ui/Modal'
import {
  DRAMA_SEGMENT_DURATION_MAX,
  DRAMA_SEGMENT_DURATION_MIN,
  DRAMA_SHOT_DURATION_HARD_MAX,
  FRAGMENT_CONTENT_DURATION_MAX,
} from '../../lib/dramaEpisodePromptEditor'
import {
  DIALOGUE_PREFIX,
  DRAMA_NARRATION_PREFIX,
  DRAMA_SUBTITLE_CUE,
  VISUAL_PREFIX,
} from '../../lib/dramaEpisodeScriptValidate'
import { tv } from '../../i18n/tv'

type Tab = 'payload' | 'script' | 'usage'

type Props = {
  open: boolean
  onClose: () => void
}

// 渲染 Seedance 规则说明弹窗
export function SeedanceRulesModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('payload')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tv("Seedance 传值与使用规则", "Cách truyền giá trị và quy tắc dùng Seedance")}
      size="lg"
      className="pf-help-modal seedance-rules-modal"
      footer={
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
          {tv("知道了", "Đã hiểu")}
        </button>
      }
    >
      <div className="pf-help">
        <p className="pf-help-lede">
          {tv("分镜视频由 Seedance 多模态接口生成。下方说明系统如何把脚本、资产与顶栏参数组装成请求，以及漫剧分集脚本写法（详见", "Video phân cảnh do giao diện đa phương thức Seedance tạo. Phần dưới giải thích hệ thống ghép kịch bản, tài sản và tham số thanh trên thành yêu cầu thế nào, cùng cách viết kịch bản tập phim truyện (xem chi tiết")}{' '}
          <code>docs/EPISODE_RULES.md</code>）。
        </p>

        <div className="pf-help-tabs" role="tablist" aria-label={tv("Seedance 规则分类", "Phân loại quy tắc Seedance")}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'payload'}
            className={tab === 'payload' ? 'active' : undefined}
            onClick={() => setTab('payload')}
          >
            {tv("传值规则", "Quy tắc truyền giá trị")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'script'}
            className={tab === 'script' ? 'active' : undefined}
            onClick={() => setTab('script')}
          >
            {tv("脚本写法", "Cách viết kịch bản")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usage'}
            className={tab === 'usage' ? 'active' : undefined}
            onClick={() => setTab('usage')}
          >
            {tv("使用建议", "Gợi ý sử dụng")}
          </button>
        </div>

        {tab === 'payload' ? (
          <div className="seedance-rules-section">
            <h4>{tv("顶栏参数 → API 字段", "Tham số thanh trên → trường API")}</h4>
            <ul className="seedance-rules-list">
              <li>
                <strong>{tv("模型", "Model")}</strong> → <code>model</code>（Seedance 2.5 / 1.5）
              </li>
              <li>
                <strong>{tv("画幅 · 清晰度", "Tỷ lệ khung · Độ nét")}</strong>{tv("（分集顶栏设置）→", "(cài đặt thanh trên của tập) →")} <code>ratio</code>、<code>resolution</code>
              </li>
              <li>
                <strong>{tv("时长", "Thời lượng")}</strong> → <code>duration</code>{tv("：脚本内", ": trong kịch bản")}{' '}
                <code>@duration</code> {tv("合计（建议 4–", "Tổng (gợi ý 4–")}{FRAGMENT_CONTENT_DURATION_MAX} {tv("秒）；无标签时用本镜「时长」字段", "giây); khi không có nhãn thì dùng trường “Thời lượng” của phân cảnh này")}
              </li>
              <li>
                <strong>{tv("视频风格", "Phong cách video")}</strong> {tv("→ 写入提示词「画面风格」强制约束块", "→ ghi vào khối ràng buộc bắt buộc “Phong cách hình ảnh” trong prompt")}
              </li>
            </ul>

            <h4>{tv("content 多模态数组（按顺序提交）", "Mảng đa phương thức content (gửi theo thứ tự)")}</h4>
            <ol className="seedance-rules-list">
              <li>
                <strong>text</strong>{tv("：自动组装的完整提示词（见下方各约束块 + 正文）", ": prompt hoàn chỉnh tự động ghép (xem các khối ràng buộc bên dưới + nội dung chính)")}
              </li>
              <li>
                <strong>reference_image</strong>{tv("：本镜引用角色 / 场景 / 道具的封面或主图", ": ảnh bìa hoặc ảnh chính của nhân vật / bối cảnh / đạo cụ được phân cảnh này tham chiếu")}
              </li>
              <li>
                <strong>reference_audio</strong>{tv("：本镜开口且已绑定音色的角色 / 旁白试听音频", ": âm thanh nghe thử của nhân vật / lời dẫn đã gắn giọng nói và đang nói trong phân cảnh này")}
              </li>
            </ol>
            <p className="seedance-rules-note">
              {tv("系统默认开启", "Hệ thống mặc định bật")} <code>generate_audio</code>{tv("：有口播意图时 Seedance 原生配音；字幕默认后期叠字（画面内禁止烧录）；纯画面镜仅环境音。", ": khi có ý định nói thì Seedance lồng tiếng gốc; phụ đề mặc định chèn chữ ở hậu kỳ (cấm đốt chữ trong hình); phân cảnh thuần hình chỉ có âm thanh môi trường.")}
            </p>

            <h4>{tv("提示词自动组装顺序", "Thứ tự tự động ghép prompt")}</h4>
            <ol className="seedance-rules-list">
              <li>【强制约束：视频画面风格】— 项目所选画风描述</li>
              <li>【强制约束：音频、字幕与配乐】— 根据脚本旁白 / 对白 / 画面 cue 推断</li>
              <li>【强制约束：角色音色】— 角色名 → 参考音频序号（已绑且本镜开口）</li>
              <li>【强制约束：旁白音色】— 旁白 → 参考音频序号（已绑项目旁白音色）</li>
              <li>【强制约束：角色形象】— 角色名 → 参考图序号</li>
              <li>【强制约束：场景】— 场景名 → 参考图序号</li>
              <li>【强制约束：道具】— 道具名 → 参考图序号</li>
              <li>
                {tv("正文：将", "Nội dung chính: thay")} <code>@asset:ID</code> {tv("替换为「名称（参考图 N）」；将", "bằng “Tên (ảnh tham chiếu N)”; thay")}{' '}
                <code>@duration:N</code> {tv("替换为时间区间（如 00:00-00:04）", "bằng khoảng thời gian (như 00:00-00:04)")}
              </li>
            </ol>
          </div>
        ) : null}

        {tab === 'script' ? (
          <div className="seedance-rules-section">
            <h4>{tv("时长标签", "Nhãn thời lượng")}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@duration:N</code>{tv("：标记一段内容的时长（秒），单段建议", ": đánh dấu thời lượng một đoạn nội dung (giây), mỗi đoạn gợi ý")}{' '}
                {DRAMA_SEGMENT_DURATION_MIN}–{DRAMA_SEGMENT_DURATION_MAX} {tv("秒", "giây")}
              </li>
              <li>
                {tv("新分镜建议镜内合计 ≤", "Phân cảnh mới gợi ý tổng trong cảnh ≤")} {FRAGMENT_CONTENT_DURATION_MAX} {tv("秒；旧稿最高", "giây; bản cũ tối đa")} {DRAMA_SHOT_DURATION_HARD_MAX} {tv("秒", "giây")}
              </li>
              <li>{tv("键入", "Gõ")} <code>@</code> {tv("可插入时长 chip 或引用资产", "có thể chèn chip thời lượng hoặc tham chiếu tài sản")}</li>
            </ul>

            <h4>{tv("资产引用", "Tham chiếu tài sản")}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@asset:123</code>{tv("：在正文中引用 ID 为 123 的角色 / 场景 / 道具", ": tham chiếu nhân vật / bối cảnh / đạo cụ có ID 123 trong nội dung")}
              </li>
              <li>{tv("左侧资产面板点击资产，或本镜「参与资产」条，也会自动写入引用", "Bấm tài sản ở bảng tài sản bên trái, hoặc thanh “Tài sản tham gia” của phân cảnh này, cũng sẽ tự động ghi tham chiếu")}</li>
              <li>{tv("被引用的角色需有参考图；要对白的角色建议绑定试听，未绑则由 Seedance 自发挥口播", "Nhân vật được tham chiếu cần có ảnh tham chiếu; nhân vật có thoại nên gắn nghe thử, chưa gắn thì Seedance tự do thể hiện lời nói")}</li>
            </ul>

            <h4>{tv("漫剧常用 cue（勿用科普版「全程旁白烧录」字幕句）", "Cue thường dùng cho phim truyện (đừng dùng câu phụ đề “thuyết minh đốt chữ toàn bộ” của bản khoa học)")}</h4>
            <div className="seedance-rules-examples">
              <code>{DRAMA_SUBTITLE_CUE}</code>
              <code>【BGM：低沉史诗，音量低于人声】</code>
              <code>@duration:4</code>
              <code>{VISUAL_PREFIX}空镜：浑浊黄河拍击老石……</code>
              <code>@duration:6</code>
              <code>{DIALOGUE_PREFIX}禹：水患未平，岂能退！</code>
              <code>{DRAMA_NARRATION_PREFIX}千年后，人们仍记得这一战。</code>
            </div>
            <ul className="seedance-rules-list">
              <li>
                <strong>{tv("空镜 / 景别", "Cảnh trống / cỡ cảnh")}</strong>{tv("：写成「空镜：…」「远景：…」「特写：…」或", ": viết thành “空镜：…”, “远景：…”, “特写：…” hoặc")}{' '}
                <code>{VISUAL_PREFIX}</code>；<strong>{tv("禁止", "cấm")}</strong>{tv("标成对白/旁白（会口播并烧字幕）", "đánh dấu thành thoại/lời dẫn (sẽ đọc và đốt phụ đề)")}
              </li>
              <li>
                <strong>{tv("对白", "Thoại")}</strong>：<code>角色名：台词</code> {tv("或", "hoặc")} {DIALOGUE_PREFIX}
              </li>
              <li>
                <strong>{tv("旁白", "Lời dẫn")}</strong>：{DRAMA_NARRATION_PREFIX}{tv("；字幕逐句轮换、与当前口播句同步，禁止整段叠满屏幕", "; phụ đề luân phiên từng câu, đồng bộ với câu đang nói, cấm chèn nguyên đoạn đầy màn hình")}
              </li>
              <li>
                <strong>{tv("人物介绍", "Giới thiệu nhân vật")}</strong>{tv("：本剧首次出场重要角色叠字贴在", ": chữ giới thiệu nhân vật quan trọng xuất hiện lần đầu của phim được dán")}<strong>{tv("该角色身旁", "bên cạnh nhân vật đó")}</strong>{tv("（非底部字幕、非居中大标题）", "(không phải phụ đề dưới đáy, không phải tiêu đề lớn ở giữa)")}
              </li>
              <li>
                <strong>BGM</strong>{tv("：音量低于人声，不抢戏", ": âm lượng thấp hơn giọng người, không lấn át")}
              </li>
            </ul>

            <h4>{tv("景别 / 运镜（@ → 小工具）", "Cỡ cảnh / chuyển động máy (@ → công cụ nhỏ)")}</h4>
            <ul className="seedance-rules-list">
              <li>
                {tv("编辑器键入", "Trình soạn thảo gõ")} <code>@</code> {tv("→「小工具」→「景别 / 运镜」，可一键插入「空镜：」「特写：」「推镜：」等前缀", "→ “Công cụ nhỏ” → “Cỡ cảnh / chuyển động máy”, có thể chèn nhanh các tiền tố như “空镜：”, “特写：”, “推镜：”")}
              </li>
              <li>{tv("公式：主体 + 动作 + 场景 +（景别/运镜）+（光影）；每段运动轴建议 ≤ 2", "Công thức: chủ thể + hành động + bối cảnh + (cỡ cảnh/chuyển động máy) + (ánh sáng); mỗi đoạn gợi ý trục chuyển động ≤ 2")}</li>
              <li>{tv("近景大旋转易崩脸，环绕留给中景以上", "Cận cảnh xoay lớn dễ méo mặt, vòng quanh để cho cỡ trung trở lên")}</li>
            </ul>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div className="seedance-rules-section">
            <h4>{tv("生成前检查", "Kiểm tra trước khi tạo")}</h4>
            <ul className="seedance-rules-list">
              <li>{tv("脚本校验：时长合法；空镜未被标成对白/旁白（编辑区会即时提示，有错误不可生成）", "Kiểm tra kịch bản: thời lượng hợp lệ; cảnh trống không bị đánh dấu thành thoại/lời dẫn (khu vực chỉnh sửa sẽ nhắc ngay, có lỗi thì không tạo được)")}</li>
              <li>{tv("本镜「参与资产」中的角色已有参考图（缺图会警告）；要对白角色建议绑定音色（缺音色警告可继续）", "Nhân vật trong “Tài sản tham gia” của phân cảnh này đã có ảnh tham chiếu (thiếu ảnh sẽ cảnh báo); nhân vật có thoại nên gắn giọng nói (thiếu giọng chỉ cảnh báo, vẫn tiếp tục được)")}</li>
              <li>{tv("项目顶栏确认画幅与清晰度；分集顶栏确认视频风格、模型后再点「生成」", "Xác nhận tỷ lệ khung và độ nét ở thanh trên của dự án; xác nhận phong cách video và model ở thanh trên của tập rồi mới bấm “Tạo”")}</li>
            </ul>

            <h4>{tv("队列与并行", "Hàng đợi và song song")}</h4>
            <ul className="seedance-rules-list">
              <li>{tv("分镜视频走独立 video 队列，Seedance 最多 10 路并行", "Video phân cảnh đi qua hàng đợi video riêng, Seedance song song tối đa 10 luồng")}</li>
              <li>{tv("某一镜生成中时，仍可编辑其他镜脚本、预览已完成的视频", "Khi một phân cảnh đang tạo, vẫn có thể chỉnh kịch bản phân cảnh khác và xem trước video đã hoàn tất")}</li>
              <li>{tv("「一键生成」会为本集各镜依次入队；单镜「生成」仅提交当前镜", "“Tạo một lần” sẽ lần lượt đưa các phân cảnh của tập này vào hàng đợi; “Tạo” của từng phân cảnh chỉ gửi phân cảnh hiện tại")}</li>
            </ul>

            <h4>{tv("镜间尾帧衔接", "Nối khung cuối giữa các phân cảnh")}</h4>
            <ul className="seedance-rules-list">
              <li>
                {tv("生成时默认", "Khi tạo mặc định")} <code>return_last_frame=true</code>{tv("，成功后把尾帧写入分镜", ", thành công thì ghi khung cuối vào phân cảnh")}{' '}
                <code>params.lastFrameUrl</code>
              </li>
              <li>
                {tv("分集顶栏「镜间衔接」开启时：若本镜有角色/场景参考图或音色， 尾帧以", "Khi “Nối giữa các phân cảnh” ở thanh trên của tập bật: nếu phân cảnh này có ảnh tham chiếu nhân vật/bối cảnh hoặc giọng nói, khung cuối được")} <code>reference_image</code> {tv("附在末尾（Seedance 禁止与", "gắn vào cuối (Seedance cấm dùng lẫn với")} <code>first_frame</code> {tv("混用）； 无参考媒体时才用", "); chỉ khi không có phương tiện tham chiếu mới dùng")} <code>first_frame</code>
              </li>
              <li>
                {tv("普通生成请勿在脚本里写「编辑 / 延长」类措辞，以免任务被重分类；真正的「延长路径」仍未产品化", "Khi tạo thông thường đừng viết cách nói kiểu “chỉnh sửa / kéo dài” trong kịch bản, kẻo tác vụ bị phân loại lại; “đường kéo dài” thật sự vẫn chưa thành sản phẩm")}
              </li>
            </ul>

            <h4>{tv("音色与参考音频", "Giọng nói và âm thanh tham chiếu")}</h4>
            <ul className="seedance-rules-list">
              <li>{tv("资产库 / 分集 / 画布可为角色绑定试听；本镜开口时提交为 reference_audio", "Thư viện tài sản / tập / canvas có thể gắn nghe thử cho nhân vật; khi phân cảnh có thoại thì gửi dưới dạng reference_audio")}</li>
              <li>{tv("未绑定音色时，口播由 Seedance generate_audio 自行发挥", "Khi chưa gắn giọng nói, lời nói do Seedance generate_audio tự thể hiện")}</li>
              <li>{tv("关联角色/场景/道具须先有参考图（生成或上传），否则不能生成视频", "Nhân vật/bối cảnh/đạo cụ liên quan phải có ảnh tham chiếu (tạo hoặc tải lên) trước, nếu không không thể tạo video")}</li>
            </ul>

            <h4>{tv("AI 重新分镜", "AI chia lại phân cảnh")}</h4>
            <p className="seedance-rules-note">
              {tv("会按剧本与资产重新规划各镜脚本与 @duration 结构；进行中的视频生成需等待完成后再操作，以免状态冲突。空镜须用「空镜：…」等画面写法，勿写成对白。", "Sẽ lập kế hoạch lại kịch bản các phân cảnh và cấu trúc @duration theo kịch bản và tài sản; video đang tạo cần chờ hoàn tất mới thao tác để tránh xung đột trạng thái. Cảnh trống phải viết dạng “空镜：…”, đừng viết thành thoại.")}
            </p>

          </div>
        ) : null}
      </div>
    </Modal>
  )
}
