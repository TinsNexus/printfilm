import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clapperboard, Download, Pause, Pencil, RefreshCw, Volume2 } from 'lucide-react'
import { api, type Project, type Shot, type Template } from '../../api'
import { ProjectCard, ProjectGrid } from '../../components/projects/ProjectCard'
import { IMAGE_TEXT_STEPS, imageTextAssetReadiness, imageTextBoardStep, imageTextNextAction } from '../../lib/imageTextStoryboard'
import { formatMmSs, isProjectWideBusy, isShotGenerating, statusLabel } from '../../lib/status'
import { shotDisplayDurationSec } from '../../lib/segmentDuration'
import { scenePromptForDisplay } from '../../promptDisplay'
import './imageTextStoryboard.css'
import { tv } from '../../i18n/tv'

type Props = {
  project: Project
  template: Template | null
  busy: boolean
  running: boolean
  busyShotIds: Set<number>
  onBack: () => void
  onSettings: () => void
  onGenerate: () => void
  onCompose: () => void
  onCancel: () => void
  onRestart: () => void
  onExport: () => void
  onDownload: () => void
  onEditor: () => void
  onEditShot: (shot: Shot, focus?: string) => void
  onPreviewShot: (shot: Shot) => void
  onRegenImage: (shot: Shot) => void
  onRegenAudio: (shot: Shot) => void
}

export default function ImageTextStoryboard({ project, template, busy, running, busyShotIds, onBack, onSettings, onGenerate, onCompose, onCancel, onRestart, onExport, onDownload, onEditor, onEditShot, onPreviewShot, onRegenImage, onRegenAudio }: Props) {
  const stage = imageTextBoardStep(project)
  // Remember a previous view only while the production stage is unchanged.
  const [view, setView] = useState<{ stage: number; step: number } | null>(null)
  const step = view?.stage === stage ? view.step : stage
  const readiness = imageTextAssetReadiness(project)
  const nextAction = imageTextNextAction(project)
  const shots = [...project.shots].sort((a, b) => a.shot_no - b.shot_no)
  const duration = shots.reduce((sum, shot) => sum + shotDisplayDurationSec(shot), 0)
  const targetDuration = project.target_duration_sec || 60
  const audioShot = shots.find((shot) => shot.audio_url)
  const cancelling = Boolean(project.active_tasks?.some((task) => task.cancel_requested))
  const failed = ['FAILED', 'CANCELLED', 'REJECTED'].includes(project.status)
  const locked = busy || running
  const actionLabel = nextAction === 'script' ? tv('生成分镜脚本', 'Tạo kịch bản phân cảnh') : nextAction === 'assets'
    ? readiness.images || readiness.audio ? tv('继续生成缺失素材', 'Tiếp tục tạo tư liệu còn thiếu') : tv('确认分镜，生成画面与配音', 'Xác nhận phân cảnh, tạo hình ảnh và lồng tiếng')
    : nextAction === 'compose' ? tv('下一步：合成成片', 'Bước sau: ghép phim') : tv('查看成片', 'Xem phim')
  function next() {
    if (nextAction === 'preview') setView({ stage, step: 3 })
    else if (nextAction === 'compose') onCompose()
    else onGenerate()
  }

  return (
    <div className="pf-image-storyboard">
      <header className="pf-is-header">
        <div>
          <button type="button" className="pf-back" onClick={onBack}><ArrowLeft size={16} />{tv("我的短片", "Video ngắn của tôi")}</button>
          <h1>{project.title}</h1>
          <p>{template?.name || tv('动画短片', 'Phim hoạt hình ngắn')}<span>·</span>{project.output_ratio || '9:16'}<span>·</span>{tv("目标约", "Mục tiêu khoảng")} {targetDuration} {tv("秒", "giây")}{shots.length ? <><span>·</span>{shots.length} {tv("个镜头 ·", "cảnh quay ·")} {formatMmSs(duration)}</> : null}</p>
        </div>
        <div className="pf-is-header-actions">
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={locked} onClick={onSettings}><Pencil size={14} />{tv("修改创作设置", "Sửa cài đặt sáng tạo")}</button>
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={!shots.length || locked} onClick={onEditor}>{tv("打开编辑器", "Mở trình chỉnh sửa")}</button>
        </div>
      </header>

      <nav className="pf-is-steps" aria-label={tv("短片创作步骤", "Các bước sáng tạo video ngắn")}>
        {IMAGE_TEXT_STEPS.map((item, index) => (
          <button key={item.key} type="button" className={`${step === index ? 'is-current' : ''} ${index < stage ? 'is-complete' : ''}`}
            aria-current={step === index ? 'step' : undefined}
            disabled={index > stage || (index === 0 && locked)}
            onClick={() => index === 0 ? onSettings() : setView({ stage, step: index })}>
            <span>{index < stage ? <Check size={16} /> : index + 1}</span><strong>{item.label}</strong>
          </button>
        ))}
      </nav>

      {running ? (
        <section className="pf-is-progress" aria-live="polite">
          <div><strong>{cancelling ? tv('正在停止，请稍候…', 'Đang dừng, vui lòng chờ…') : statusLabel(project)}</strong><p>{tv("进度会自动保存，可以离开页面，稍后从「我的短片」继续。", "Tiến độ tự động lưu, có thể rời khỏi trang, lát nữa tiếp tục từ “Video ngắn của tôi”.")}</p></div>
          <div className="pf-is-progress-track"><span style={{ width: `${Math.max(2, Math.min(100, project.progress))}%` }} /></div>
          <span>{project.progress}%</span>
          <button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={busy || cancelling} onClick={onCancel}><Pause size={14} />{tv("停止", "Dừng")}</button>
        </section>
      ) : failed ? <p className="pf-is-resume-note">{project.status === 'CANCELLED' ? tv('制作已停止。', 'Sản xuất đã dừng.') : tv('本阶段未完成。', 'Giai đoạn này chưa hoàn tất.')}{tv("已完成的素材已保存，可以从当前步骤继续。", "Tư liệu đã hoàn tất được lưu, có thể tiếp tục từ bước hiện tại.")}</p> : null}

      {step === 1 ? (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 02</span><h2>{tv("确认文案与分镜", "Xác nhận lời dẫn và phân cảnh")}</h2><p>{tv("逐张查看镜头，调整旁白和画面，满意后再生成素材。", "Xem từng cảnh quay, chỉnh lời dẫn và hình ảnh, ưng ý rồi mới tạo tư liệu.")}</p></div><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={!shots.length} onClick={onExport}><Download size={14} />{tv("导出脚本", "Xuất kịch bản")}</button></div>
          <details className="pf-is-copy" open={!shots.length}><summary>{tv("完整文案", "Lời dẫn hoàn chỉnh")} <span>{project.source_text.length} {tv("字", "chữ")}</span></summary><p>{project.source_text}</p></details>
          {shots.length ? <ProjectGrid className="pf-is-script-grid">
            {shots.map((shot) => {
              const shotBusy = locked || busyShotIds.has(shot.id) || isShotGenerating(project, shot.id)
              return <article key={shot.id} className="pf-is-script-card">
                <header><span>{tv("镜头", "Cảnh quay")} {String(shot.shot_no).padStart(2, '0')}</span><span>{formatMmSs(shotDisplayDurationSec(shot))}</span></header>
                <h3>{shot.overlay_title || tv(`场景 ${shot.shot_no}`, `Cảnh ${shot.shot_no}`)}</h3>
                <div className="pf-is-script-field"><label>{tv("旁白", "Lời dẫn")}</label><p>{shot.narration || tv('暂无旁白，点击编辑补充', 'Chưa có lời dẫn, bấm chỉnh sửa để bổ sung')}</p></div>
                <div className="pf-is-script-field"><label>{tv("画面", "Hình ảnh")}</label><p>{scenePromptForDisplay(shot.img_prompt) || tv('暂无画面描述', 'Chưa có mô tả hình ảnh')}</p></div>
                <footer><button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot, 'narration')}><Pencil size={13} />{tv("编辑旁白", "Chỉnh sửa lời dẫn")}</button><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot)}>{tv("编辑分镜", "Chỉnh sửa phân cảnh")}</button></footer>
              </article>
            })}
          </ProjectGrid> : <div className="pf-is-empty"><Clapperboard size={38} /><h3>{running ? tv('正在把文案拆成分镜', 'Đang tách lời dẫn thành phân cảnh') : tv('文案已就绪', 'Lời dẫn đã sẵn sàng')}</h3><p>{running ? tv('生成后，每个镜头会显示为一张可编辑卡片。', 'Sau khi tạo, mỗi cảnh quay sẽ hiển thị thành một thẻ chỉnh sửa được.') : tv('点击下方按钮生成分镜脚本。', 'Bấm nút bên dưới để tạo kịch bản phân cảnh.')}</p></div>}
        </section>
      ) : step === 2 ? (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 03</span><h2>{tv("检查画面与配音", "Kiểm tra hình ảnh và lồng tiếng")}</h2><p>{tv("画面", "Hình ảnh")} {readiness.images}/{readiness.total} {tv("· 配音", "· Lồng tiếng")} {readiness.audio === readiness.total && readiness.total ? tv('已完成', 'Đã hoàn tất') : tv('待完成', 'Chờ hoàn tất')}{tv("。画面齐备、试听满意后，即可合成。", ". Hình ảnh đầy đủ, nghe thử ưng ý là có thể ghép phim.")}</p></div></div>
          <div className="pf-is-audio"><div><Volume2 size={22} /><div><strong>{tv("整片旁白", "Lời dẫn toàn phim")}</strong><p>{tv("成片按真实配音时长安排画面，自动添加字幕。", "Phim sắp xếp hình theo thời lượng lồng tiếng thực tế, tự động thêm phụ đề.")}</p></div></div>{audioShot?.audio_url ? <audio aria-label={tv("试听整片旁白", "Nghe thử lời dẫn toàn phim")} controls preload="metadata" src={api.assetUrl(audioShot.audio_url, project.updated_at)} /> : <span className="pf-muted">{running ? tv('配音生成中…', 'Đang tạo lồng tiếng…') : tv('等待生成配音', 'Chờ tạo lồng tiếng')}</span>}<button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={locked || !shots.length} onClick={() => onRegenAudio(shots[0])}><RefreshCw size={13} />{tv("重新配音", "Lồng tiếng lại")}</button></div>
          <ProjectGrid>
            {shots.map((shot) => {
              const generating = busyShotIds.has(shot.id) || isShotGenerating(project, shot.id)
              const shotBusy = busy || isProjectWideBusy(project) || generating
              const imageReady = Boolean(shot.image_url)
              return <ProjectCard key={shot.id} className="pf-is-media-card" kind="drama" title={shot.overlay_title || tv(`场景 ${shot.shot_no}`, `Cảnh ${shot.shot_no}`)} category={tv(`镜头 ${String(shot.shot_no).padStart(2, '0')} · ${formatMmSs(shotDisplayDurationSec(shot))}`, `Cảnh quay ${String(shot.shot_no).padStart(2, '0')} · ${formatMmSs(shotDisplayDurationSec(shot))}`)}
                coverUrl={shot.image_url ? api.assetUrl(shot.image_url, shot.version) : undefined}
                status={{ label: generating ? tv('生成中', 'Đang tạo') : imageReady ? tv('画面已就绪', 'Hình ảnh đã sẵn sàng') : shot.status === 'FAILED' ? tv('生成失败', 'Tạo thất bại') : tv('待生成', 'Chờ tạo'), tone: generating ? 'producing' : imageReady ? 'completed' : 'draft' }}
                description={shot.narration} meta={<span>{shot.audio_url ? tv('✓ 配音已就绪', '✓ Lồng tiếng đã sẵn sàng') : tv('○ 等待配音', '○ Chờ lồng tiếng')}</span>}
                onOpen={() => onPreviewShot(shot)} openLabel={tv(`预览镜头 ${shot.shot_no}`, `Xem trước cảnh quay ${shot.shot_no}`)}
                actions={<><button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={shotBusy} onClick={() => onEditShot(shot)}>{tv("编辑", "Chỉnh sửa")}</button><button type="button" className="pf-btn pf-btn-outline pf-btn-sm" disabled={shotBusy} onClick={() => onRegenImage(shot)}><RefreshCw size={12} />{imageReady ? tv('重绘画面', 'Vẽ lại hình') : tv('生成画面', 'Tạo hình ảnh')}</button></>} />
            })}
          </ProjectGrid>
        </section>
      ) : (
        <section className="pf-is-section">
          <div className="pf-is-section-head"><div><span className="pf-is-eyebrow">STEP 04</span><h2>{project.final_video_url ? tv('你的短片已完成', 'Video ngắn của bạn đã hoàn thành') : tv('合成短片', 'Ghép video ngắn')}</h2><p>{tv("图片运镜、旁白和字幕，合为一部完整短片。", "Chuyển động máy ảnh tĩnh, lời dẫn và phụ đề, hợp thành một video ngắn hoàn chỉnh.")}</p></div></div>
          {project.final_video_url ? <div className="pf-is-final"><div className="pf-is-final-player"><video controls preload="metadata" src={api.assetUrl(project.final_video_url, project.updated_at)} poster={project.cover_url ? api.assetUrl(project.cover_url) : undefined} /></div><div><span className="pf-is-complete"><Check size={15} />{tv("制作完成", "Sản xuất hoàn tất")}</span><h3>{project.title}</h3><p>{project.output_ratio || '9:16'} {tv("· MP4 · 配音与字幕", "· MP4 · Lồng tiếng và phụ đề")}</p><button type="button" className="pf-btn pf-btn-lime" disabled={busy} onClick={onDownload}><Download size={16} />{busy ? tv('处理中…', 'Đang xử lý…') : tv('下载成片', 'Tải phim xuống')}</button><button type="button" className="pf-btn pf-btn-outline" disabled={locked} onClick={() => setView({ stage, step: 2 })}>{tv("返回修改素材", "Quay lại sửa tư liệu")}</button><button type="button" className="pf-btn pf-btn-ghost" disabled={locked || !readiness.ready} onClick={onCompose}>{tv("用当前素材重新合成", "Ghép lại bằng tư liệu hiện tại")}</button></div></div>
            : <div className="pf-is-empty"><Clapperboard size={42} /><h3>{running ? tv('正在合成成片', 'Đang ghép phim') : tv('准备合成', 'Chuẩn bị ghép')}</h3><p>{running ? tv('正在安排图片运镜、同步配音和字幕。完成后可直接预览和下载。', 'Đang sắp xếp chuyển động máy ảnh tĩnh, đồng bộ lồng tiếng và phụ đề. Xong có thể xem trước và tải xuống trực tiếp.') : tv('确认画面与配音后，开始合成最终视频。', 'Xác nhận hình ảnh và lồng tiếng rồi bắt đầu ghép video cuối cùng.')}</p></div>}
        </section>
      )}

      <footer className="pf-is-next">
        <div><strong>{running ? cancelling ? tv('正在停止制作', 'Đang dừng sản xuất') : tv('当前步骤制作中', 'Bước hiện tại đang sản xuất') : nextAction === 'preview' ? tv('成片已保存', 'Phim đã được lưu') : actionLabel}</strong><p>{running ? tv('完成后会停在当前阶段，等待你检查。', 'Xong sẽ dừng ở giai đoạn hiện tại, chờ bạn kiểm tra.') : nextAction === 'assets' && (readiness.images || readiness.audio) ? tv('沿用已成功的素材，补齐后继续。', 'Dùng lại tư liệu đã thành công, bổ sung đủ rồi tiếp tục.') : nextAction === 'compose' ? tv('图片和配音已齐，下一步添加运镜与字幕。', 'Hình ảnh và lồng tiếng đã đủ, bước sau thêm chuyển động máy và phụ đề.') : tv('每一步都可以查看和调整结果。', 'Mỗi bước đều có thể xem và điều chỉnh kết quả.')}</p></div>
        <div className="pf-is-next-buttons">{step > 1 ? <button type="button" className="pf-btn pf-btn-outline" onClick={() => setView({ stage, step: step - 1 })}><ArrowLeft size={14} />{tv("上一步", "Bước trước")}</button> : <button type="button" className="pf-btn pf-btn-ghost" disabled={locked} onClick={onRestart}><RefreshCw size={14} />{tv("重新生成分镜", "Tạo lại phân cảnh")}</button>}{nextAction === 'preview' && step === 3 ? null : <button type="button" className="pf-btn pf-btn-lime" disabled={locked} onClick={step === 1 && stage > 1 ? () => setView({ stage, step: 2 }) : next}>{running ? tv('制作中…', 'Đang sản xuất…') : step === 1 && stage > 1 ? tv('下一步：画面与配音', 'Bước sau: hình ảnh và lồng tiếng') : actionLabel}<ArrowRight size={16} /></button>}</div>
      </footer>
    </div>
  )
}
