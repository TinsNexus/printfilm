import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Project, Shot } from '../../api'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import ComingSoon from '../../components/ui/ComingSoon'
import { STATUS_CN, shotsByNo } from '../../lib/status'
import { downloadSingleVideo } from '../../lib/clientDownload'
import { useI18n } from '../../i18n'

// 面板 id（展示名走 TAB_LABEL_KEY，避免用文案当状态值）
const PANEL_TABS = ['copy', 'visual', 'voice', 'transition'] as const
const TAB_LABEL_KEY: Record<(typeof PANEL_TABS)[number], string> = {
  copy: 'editorPage.tabCopy',
  visual: 'editorPage.tabVisual',
  voice: 'editorPage.tabVoice',
  transition: 'editorPage.tabTransition',
}

export default function EditorPage() {
  const { t: tx } = useI18n()
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [activeShotId, setActiveShotId] = useState<number | null>(null)
  const [tab, setTab] = useState<(typeof PANEL_TABS)[number]>('copy')
  const [narration, setNarration] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shotFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      nav('/auth')
      return
    }
    if (!projectId) {
      nav('/studio/new')
      return
    }
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        const first = p.shots[0]
        if (first) {
          setActiveShotId(first.id)
          setNarration(first.narration || '')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : tx('editorPage.failedLoad')))
  }, [nav, projectId])

  const orderedShots = useMemo(() => shotsByNo(project?.shots), [project?.shots])
  const shot: Shot | undefined = useMemo(
    () => orderedShots.find((s) => s.id === activeShotId),
    [orderedShots, activeShotId],
  )
  const shotIndex = shot ? orderedShots.findIndex((s) => s.id === shot.id) : -1

  const totalDuration = useMemo(
    () => (project?.shots || []).reduce((s, x) => s + (Number(x.duration) || 0), 0),
    [project?.shots],
  )

  function selectShot(s: Shot) {
    setActiveShotId(s.id)
    setNarration(s.narration || '')
  }

  async function saveNarration() {
    if (!project || !shot) return
    setBusy(true)
    setError('')
    try {
      await api.updateShot(project.id, shot.id, { narration })
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function regenImage() {
    if (!project || !shot) return
    setBusy(true)
    try {
      await api.regenImage(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.regenerateFailed'))
    } finally {
      setBusy(false)
    }
  }

  /** 在片尾追加一镜，并选中新建镜头。 */
  async function addShot() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const created = await api.createShot(project.id)
      const next = await api.getProject(project.id)
      setProject(next)
      const s = next.shots.find((x) => x.id === created.id)
      if (s) selectShot(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.couldAddShot'))
    } finally {
      setBusy(false)
    }
  }

  /** 将当前镜与相邻镜对调顺序。 */
  async function moveShot(delta: number) {
    if (!project || !shot) return
    const ordered = orderedShots
    const i = ordered.findIndex((s) => s.id === shot.id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= ordered.length) return
    const ids = ordered.map((s) => s.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBusy(true)
    setError('')
    try {
      setProject(await api.reorderShots(project.id, ids))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.couldReorder'))
    } finally {
      setBusy(false)
    }
  }

  /** 上传本镜静帧，替换后需重出视频。 */
  async function onShotImageFile(file: File | null) {
    if (!project || !shot || !file) return
    setBusy(true)
    setError('')
    try {
      setProject(await api.uploadShotImage(project.id, shot.id, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.couldUploadImage'))
    } finally {
      setBusy(false)
      if (shotFileRef.current) shotFileRef.current.value = ''
    }
  }

  /** 下载已合成的成片。 */
  async function exportFilm() {
    if (!project?.final_video_url) return
    setBusy(true)
    setError('')
    try {
      await downloadSingleVideo({
        projectId: project.id,
        title: project.title,
        url: api.assetUrl(project.final_video_url, project.updated_at),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.exportFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function regenAudio() {
    if (!project || !shot) return
    setBusy(true)
    try {
      await api.regenAudio(project.id, shot.id)
      setProject(await api.getProject(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('editorPage.reVoiceFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio" flush>
        <p className="pf-muted" style={{ padding: '2rem' }}>
          {tx('editorPage.loading')}
        </p>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell active="studio">
        <BillingErrorNotice message={error} />
      </AppShell>
    )
  }

  const isPortrait = (project.output_ratio || '') === '9:16' || (!project.output_ratio && project.pipeline_mode === 'image_text')
  // Prefer current shot media; final film is for dedicated preview, not shot editing.
  const shotVideo = shot?.video_url ? api.assetUrl(shot.video_url, shot.version) : null
  const shotImage = shot?.image_url ? api.assetUrl(shot.image_url, shot.version) : null

  return (
    <AppShell active="studio" flush>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--pf-line)',
          background: '#fff',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="pf-link" onClick={() => nav(`/studio/${project.id}`)}>
            {tx('editorPage.backProject')}
          </button>
          <strong>{project.title}</strong>
          <span className="pf-muted" style={{ fontSize: '0.8rem' }}>
            {STATUS_CN[project.status] || project.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tx('editorPage.undo')} <ComingSoon />
          </button>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tx('editorPage.redo')} <ComingSoon />
          </button>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tx('editorPage.saveDraft')} <ComingSoon />
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-sm"
            disabled={!shot?.video_url && !project.final_video_url}
            onClick={() => {
              const el = document.getElementById('pf-editor-player') as HTMLVideoElement | null
              if (el) {
                el.play()
                return
              }
              if (project.final_video_url) {
                window.open(api.assetUrl(project.final_video_url, project.updated_at), '_blank')
              }
            }}
          >
            {tx('editorPage.previewPlayback')}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-sm"
            disabled={busy || !project.final_video_url}
            onClick={() => void exportFilm()}
          >
            {tx('editorPage.exportVideo')}
          </button>
        </div>
      </div>

      {error ? (
        <BillingErrorNotice message={error} style={{ padding: '0.5rem 1.25rem' }} />
      ) : null}

      <div className="pf-editor">
        <aside>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong>{tx('editorPage.scenes')}</strong>
            <button type="button" className="pf-link" disabled={busy} onClick={() => void addShot()}>
              {tx('editorPage.addShot')}
            </button>
          </div>
          {orderedShots.map((s) => (
            <button
              key={s.id}
              type="button"
              className={activeShotId === s.id ? 'pf-scene-item active' : 'pf-scene-item'}
              onClick={() => selectShot(s)}
            >
              {s.image_url ? (
                <img src={api.assetUrl(s.image_url, s.version)} alt="" />
              ) : (
                <div className="ph" />
              )}
              <div>
                <strong style={{ fontSize: '0.82rem' }}>
                  {String(s.shot_no).padStart(2, '0')} {s.overlay_title || tx('editorPage.shot')}
                </strong>
                <div className="pf-muted" style={{ fontSize: '0.72rem' }}>
                  {(s.narration || '').slice(0, 28)}
                </div>
              </div>
            </button>
          ))}
          <p className="pf-muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
            {tx('editorPage.totalDuration')}{' '}
            {Math.floor(totalDuration / 60)
              .toString()
              .padStart(2, '0')}
            :
            {Math.floor(totalDuration % 60)
              .toString()
              .padStart(2, '0')}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm"
              disabled={busy || !shot || shotIndex <= 0}
              onClick={() => void moveShot(-1)}
            >
              {tx('editorPage.moveUp')}
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm"
              disabled={busy || !shot || shotIndex < 0 || shotIndex >= orderedShots.length - 1}
              onClick={() => void moveShot(1)}
            >
              {tx('editorPage.moveDown')}
            </button>
          </div>
        </aside>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <strong>
              {shot ? tx('editorPage.shot2', { shotShot_no: shot.shot_no }) : tx('editorPage.preview')} · {isPortrait ? '9:16' : '16:9'}
            </strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={shotFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => void onShotImageFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm"
                disabled={busy || !shot}
                onClick={() => shotFileRef.current?.click()}
              >
                {tx('editorPage.uploadImage')}
              </button>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={busy} onClick={regenImage}>
                {tx('editorPage.aiRedraw')}
              </button>
            </div>
          </div>
          <div className={isPortrait ? 'pf-editor-preview portrait' : 'pf-editor-preview'}>
            {shotVideo ? (
              <video
                id="pf-editor-player"
                key={`v-${shot?.id}-${shot?.version}`}
                src={shotVideo}
                poster={shotImage || undefined}
                controls
                playsInline
              />
            ) : shotImage ? (
              <img key={`i-${shot?.id}-${shot?.version}`} src={shotImage} alt="" />
            ) : (
              <span className="empty">{tx('editorPage.imageYet')}</span>
            )}
          </div>
          {shot?.audio_url ? (
            <audio
              src={api.assetUrl(shot.audio_url)}
              controls
              style={{ width: '100%', marginTop: '0.65rem' }}
            />
          ) : null}

          <div
            style={{
              marginTop: '0.85rem',
              display: 'flex',
              gap: '0.4rem',
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            {orderedShots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectShot(s)}
                style={{
                  border: activeShotId === s.id ? '2px solid var(--pf-lime)' : '1px solid var(--pf-line)',
                  borderRadius: 8,
                  padding: 0,
                  background: 'transparent',
                }}
              >
                {s.image_url ? (
                  <img
                    src={api.assetUrl(s.image_url, s.version)}
                    alt=""
                    style={{ width: 88, height: 50, objectFit: 'cover', display: 'block', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{ width: 88, height: 50, background: '#eee', borderRadius: 6 }} />
                )}
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: '0.85rem',
              border: '1px dashed var(--pf-line)',
              borderRadius: 12,
              padding: '1.25rem',
              textAlign: 'center',
              color: 'var(--pf-muted)',
              fontSize: '0.9rem',
            }}
          >
            {tx('editorPage.useUploadImageReplace')}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="pf-panel-tabs">
              {[tx('editorPage.assetLibrary'), tx('editorPage.favorites'), tx('editorPage.aiGenerated'), tx('editorPage.myUploads')].map((t) => (
                <button key={t} type="button" disabled>
                  {t}
                </button>
              ))}
            </div>
            <p className="pf-muted" style={{ fontSize: '0.85rem' }}>
              {tx('editorPage.assetLibraryComingSoon')}
            </p>
          </div>
        </section>

        <aside>
          <div className="pf-panel-tabs">
            {PANEL_TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {tx(TAB_LABEL_KEY[t])}
              </button>
            ))}
          </div>

          {tab === 'copy' ? (
            <>
              <label className="pf-muted" style={{ fontSize: '0.85rem', display: 'block' }}>
                {tx('editorPage.copyText')}
                <textarea
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    borderRadius: 10,
                    border: '1px solid var(--pf-line)',
                    padding: '0.65rem',
                  }}
                />
              </label>
              <button
                type="button"
                className="pf-btn pf-btn-ghost pf-btn-sm pf-btn-block"
                style={{ marginTop: 8 }}
                disabled
              >
                {tx('editorPage.aiOptimize')} <ComingSoon />
              </button>
              <div style={{ marginTop: '0.85rem' }}>
                <strong style={{ fontSize: '0.88rem' }}>
                  {tx('editorPage.styleSettings')} <ComingSoon />
                </strong>
                <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
                  {tx('editorPage.fontSizeColorAlignment')}
                </p>
              </div>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                style={{ marginTop: '1rem' }}
                disabled={busy}
                onClick={saveNarration}
              >
                {tx('editorPage.saveCopy')}
              </button>
            </>
          ) : null}

          {tab === 'visual' ? (
            <>
              <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                {tx('editorPage.useUploadImagePreview')}
              </p>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                disabled={busy}
                onClick={regenImage}
              >
                {tx('editorPage.regenerateShot')}
              </button>
            </>
          ) : null}

          {tab === 'voice' ? (
            <>
              <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                {tx('editorPage.replaceShotSVoice')}
              </p>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                disabled={busy}
                onClick={regenAudio}
              >
                {tx('editorPage.replaceVoice')}
              </button>
            </>
          ) : null}

          {tab === 'transition' ? (
            <div className="pf-hint">
              {tx('editorPage.transitionEffectsFadeFlash')}
            </div>
          ) : null}

          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block"
            style={{ marginTop: '1rem' }}
            disabled
          >
            {tx('editorPage.applyAll')} <ComingSoon />
          </button>
        </aside>
      </div>
    </AppShell>
  )
}
