import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import { pollStudioToolTask, resolveToolMediaUrl, runStudioTool } from '../api/tools'
import { defaultToolChips, getToolDef, type ToolDef } from '../lib/toolsCatalog'

const VIDEO_POLL_MS = 3000

/** 独立工具工作台：表单生成、结果预览、视频任务轮询 */
export default function ToolDetailPage() {
  const { toolId } = useParams()
  const tool = useMemo(() => getToolDef(toolId), [toolId])

  if (!tool) return <Navigate to="/tools" replace />
  if (!localStorage.getItem('token')) {
    return <Navigate to={`/auth?next=/tools/${tool.id}`} replace />
  }

  return <ToolWorkspace tool={tool} />
}

/** 已登录后的工具表单与结果区 */
function ToolWorkspace({ tool }: { tool: ToolDef }) {
  /*
   * text 文本框
   * chips 画幅/时长等选项
   * files 待上传文件
   * previews 本地预览 URL
   * busy 生成中
   * error 错误文案
   * resultUrls 结果媒体
   * previewUrl 视频静帧预览
   * taskId 视频任务
   * status 任务状态
   */
  const [text, setText] = useState<Record<string, string>>({})
  const [chips, setChips] = useState(() => defaultToolChips(tool))
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultUrls, setResultUrls] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [taskId, setTaskId] = useState('')
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const Icon = tool.icon

  useEffect(() => {
    setText({})
    setChips(defaultToolChips(tool))
    setFiles([])
    setPreviews([])
    setBusy(false)
    setError('')
    setResultUrls([])
    setPreviewUrl('')
    setTaskId('')
    setStatus('')
  }, [tool.id])

  useEffect(() => {
    return () => {
      for (const url of previews) URL.revokeObjectURL(url)
    }
  }, [previews])

  useEffect(() => {
    if (!taskId || (status !== 'queued' && status !== 'running')) return
    let cancelled = false
    const tick = async () => {
      try {
        const data = await pollStudioToolTask(taskId)
        if (cancelled) return
        setStatus(data.status)
        if (data.status === 'succeeded' && data.urls.length) {
          setResultUrls(data.urls)
          setBusy(false)
        } else if (data.status === 'failed') {
          setError(data.error || '视频生成失败')
          setBusy(false)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '查询失败')
        setBusy(false)
      }
    }
    const timer = window.setInterval(() => void tick(), VIDEO_POLL_MS)
    void tick()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [taskId, status])

  // 替换上传文件并刷新本地预览
  function applyFiles(next: File[]) {
    setPreviews((prev) => {
      for (const url of prev) URL.revokeObjectURL(url)
      return next.map((file) => URL.createObjectURL(file))
    })
    setFiles(next)
  }

  // 选择本地文件并生成缩略预览
  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files || [])
    event.target.value = ''
    if (!list.length) return
    applyFiles(list)
  }

  // 拖拽上传
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const list = Array.from(event.dataTransfer.files || [])
    if (!list.length) return
    applyFiles(list)
  }

  // 提交生成；视频任务进入轮询
  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const prompt = (text.prompt || text.script || '').trim()
    if (tool.id === 't2i' && prompt.length < 4) {
      setError('请填写提示词')
      return
    }
    if ((tool.id === 'i2i' || tool.id === 'i2p') && !files.length) {
      setError('请上传参考图')
      return
    }
    if (tool.id === 't2v' && prompt.length < 4) {
      setError('请填写视频脚本')
      return
    }
    if (tool.id === 'v2v' && !files.length) {
      setError('请上传源视频或首帧图')
      return
    }
    if (tool.id === 'ecom' && chips.pack === '卖点海报' && !files.length) {
      setError('请上传商品图')
      return
    }
    if (tool.id === 'ecom' && chips.pack !== '卖点海报' && files.length < 2) {
      setError('拼接至少上传 2 张图片')
      return
    }
    setError('')
    setResultUrls([])
    setPreviewUrl('')
    setTaskId('')
    setStatus('')
    setBusy(true)
    try {
      const data = await runStudioTool({
        toolId: tool.id,
        prompt,
        negative: (text.negative || '').trim(),
        ratio: chips.ratio,
        strength: chips.strength,
        mode: chips.mode,
        pack: chips.pack,
        duration: chips.duration,
        motion: chips.motion,
        files,
      })
      setStatus(data.status)
      if (data.preview_url) setPreviewUrl(data.preview_url)
      if (data.urls.length) {
        setResultUrls(data.urls)
        setBusy(false)
        return
      }
      if (data.task_id) {
        setTaskId(data.task_id)
        setStatus(data.status || 'queued')
        return
      }
      setBusy(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败'
      if (message === '未登录') {
        nav(`/auth?next=/tools/${tool.id}`, { replace: true })
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  const uploadField = tool.fields.find((field) => field.kind === 'upload')
  const hasMedia = resultUrls.length > 0 || Boolean(previewUrl)
  const waitingVideo = busy && Boolean(taskId)

  return (
    <AppShell active="tools">
      <div className="pf-tool-detail">
        <Link to="/tools" className="pf-tool-back">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          全部工具
        </Link>
        <header className="pf-tool-detail-head">
          <span className="pf-ws-tool-icon" aria-hidden>
            <Icon size={22} strokeWidth={1.6} />
          </span>
          <div>
            <h1>{tool.title}</h1>
            <p className="pf-muted">{tool.desc}</p>
          </div>
        </header>

        <div className="pf-tool-workspace">
          <form className="pf-tool-panel" onSubmit={onSubmit}>
            <p className="pf-muted pf-tool-panel-hint">{tool.panelHint}</p>
            {tool.fields.map((field) => (
              <label key={field.key} className="pf-tool-field">
                <span>{field.label}</span>
                {field.kind === 'textarea' ? (
                  <textarea
                    rows={4}
                    placeholder={field.placeholder || `输入${field.label}…`}
                    value={text[field.key] || ''}
                    onChange={(e) => setText((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                ) : null}
                {field.kind === 'upload' ? (
                  <div
                    className="pf-tool-upload"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
                    }}
                  >
                    {files.length ? (
                      <span>
                        已选 {files.length} 个文件
                        {files[0] ? ` · ${files[0].name}` : ''}
                      </span>
                    ) : (
                      '点击或拖拽上传'
                    )}
                    {previews.length ? (
                      <div className="pf-tool-upload-thumbs">
                        {previews.map((url, idx) =>
                          files[idx]?.type.startsWith('video/') ? (
                            <video key={url} src={url} muted />
                          ) : (
                            <img key={url} src={url} alt="" />
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {field.kind === 'chips' && field.options ? (
                  <div className="pf-tool-chips">
                    {field.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={chips[field.key] === opt ? 'active' : ''}
                        onClick={() => setChips((prev) => ({ ...prev, [field.key]: opt }))}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
            ))}
            {uploadField ? (
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={uploadField.accept}
                multiple={Boolean(uploadField.multiple)}
                onChange={onPick}
              />
            ) : null}
            {error ? <p className="pf-tool-error">{error}</p> : null}
            <Button type="submit" variant="lime" block disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="pf-tool-spin" aria-hidden />
                  {waitingVideo ? '视频生成中…' : '生成中…'}
                </>
              ) : (
                tool.cta
              )}
            </Button>
          </form>

          <section
            className={`pf-tool-result${hasMedia ? ' has-media' : ''}`}
            aria-label="生成结果"
          >
            {!hasMedia && !busy ? (
              <div className="pf-tool-result-empty">
                <p>结果预览区</p>
                <span className="pf-muted">生成完成后将在此展示</span>
              </div>
            ) : null}
            {busy && !hasMedia ? (
              <div className="pf-tool-result-empty">
                <Loader2 size={28} className="pf-tool-spin" aria-hidden />
                <p>{waitingVideo ? '视频生成中' : '正在生成'}</p>
                <span className="pf-muted">
                  {waitingVideo ? '通常需要 1–3 分钟，可停留在本页等待' : '画面生成大约 20–40 秒'}
                </span>
              </div>
            ) : null}
            {previewUrl && !resultUrls.length ? (
              <img src={resolveToolMediaUrl(previewUrl)} alt="静帧预览" />
            ) : null}
            {resultUrls.map((url) => {
              const abs = resolveToolMediaUrl(url)
              const isVideo = tool.id === 't2v' || tool.id === 'v2v' || /\.mp4($|\?)/i.test(url)
              if (isVideo) {
                return (
                  <div key={url} className="pf-tool-result-item">
                    <video src={abs} controls playsInline />
                    <a className="pf-tool-download" href={abs} download>
                      <Download size={14} aria-hidden />
                      下载视频
                    </a>
                  </div>
                )
              }
              return (
                <div key={url} className="pf-tool-result-item">
                  <img src={abs} alt="生成结果" />
                  <a className="pf-tool-download" href={abs} download>
                    <Download size={14} aria-hidden />
                    下载图片
                  </a>
                </div>
              )
            })}
            {resultUrls.length ? (
              <p className="pf-muted pf-tool-saved">
                已保存，可在 <Link to="/settings?tab=tools">个人中心 · 工具创作</Link> 查看
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
