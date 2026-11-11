import { marketText as mt } from '../../features/marketplace/translate'
import { useMarketplaceLocale } from '../../features/marketplace/useMarketplaceLocale'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Project, Shot } from '../../api'
import BillingErrorNotice from '../../components/billing/BillingErrorNotice'
import AppShell from '../../components/layout/AppShell'
import ComingSoon from '../../components/ui/ComingSoon'
import { STATUS_CN, shotsByNo } from '../../lib/status'
import { downloadSingleVideo } from '../../lib/clientDownload'
import { withReturn } from '../../features/marketplace/ui'
import { tr } from '../../i18n/translate.ts'

// 面板 id 固定，标签渲染时再翻译（不能用已翻译文字做状态比较）
const PANEL_TABS = ['script', 'visuals', 'voiceOver', 'transitions'] as const

export default function EditorPage() {
  useMarketplaceLocale()
  const { id } = useParams()
  const projectId = Number(id)
  const nav = useNavigate()
  const location = useLocation()
  const [project, setProject] = useState<Project | null>(null)
  const [activeShotId, setActiveShotId] = useState<number | null>(null)
  const [tab, setTab] = useState<(typeof PANEL_TABS)[number]>('script')
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
        if (p.creation_session_id) {
          nav(`/studio/sessions/${p.creation_session_id}?project=${p.id}`, { replace: true })
          return
        }
        setProject(p)
        const first = p.shots[0]
        if (first) {
          setActiveShotId(first.id)
          setNarration(first.narration || '')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : tr('editorPage.failedLoad')))
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
      setError(err instanceof Error ? err.message : tr('editorPage.saveFailed'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.regenerationFailed'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.failedAddShot'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.failedReorder'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.failedUploadImage'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.exportFailed'))
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
      setError(err instanceof Error ? err.message : tr('editorPage.failedReRecordVoiceOver'))
    } finally {
      setBusy(false)
    }
  }

  if (!project && !error) {
    return (
      <AppShell active="studio" flush>
        <p className="pf-muted" style={{ padding: '2rem' }}>
          {tr('editorPage.loading')}
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
            {tr('editorPage.backProject')}
          </button>
          <strong>{project.title}</strong>
          <span className="pf-muted" style={{ fontSize: '0.8rem' }}>
            {STATUS_CN[project.status] || project.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tr('editorPage.undo')} <ComingSoon />
          </button>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tr('editorPage.redo')} <ComingSoon />
          </button>
          <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled>
            {tr('editorPage.saveDraft')} <ComingSoon />
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
            {tr('editorPage.playPreview')}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-lime pf-btn-sm"
            disabled={busy || !project.final_video_url}
            onClick={() => void exportFilm()}
          >
            {tr('editorPage.exportVideo')}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-sm"
            disabled={!project.final_video_url}
            onClick={() => nav(withReturn(`/marketplace/from-printfilm?project=${project.id}`, `${location.pathname}${location.search}`))}
          >
            {mt("发布到数字资产市场")}
          </button>
        </div>
      </div>

      {error ? (
        <BillingErrorNotice message={error} style={{ padding: '0.5rem 1.25rem' }} />
      ) : null}

      <div className="pf-editor">
        <aside>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong>{tr('editorPage.scenes')}</strong>
            <button type="button" className="pf-link" disabled={busy} onClick={() => void addShot()}>
              {tr('editorPage.addShot')}
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
                  {String(s.shot_no).padStart(2, '0')} {s.overlay_title || tr('editorPage.shot')}
                </strong>
                <div className="pf-muted" style={{ fontSize: '0.72rem' }}>
                  {(s.narration || '').slice(0, 28)}
                </div>
              </div>
            </button>
          ))}
          <p className="pf-muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
            {tr('editorPage.totalLength')}{' '}
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
              {tr('editorPage.moveUp')}
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-ghost pf-btn-sm"
              disabled={busy || !shot || shotIndex < 0 || shotIndex >= orderedShots.length - 1}
              onClick={() => void moveShot(1)}
            >
              {tr('editorPage.moveDown')}
            </button>
          </div>
        </aside>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <strong>
              {shot ? tr('editorPage.shot2', { shot_no: shot.shot_no }) : tr('editorPage.preview')} · {isPortrait ? '9:16' : '16:9'}
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
                {tr('editorPage.uploadImage')}
              </button>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" disabled={busy} onClick={regenImage}>
                {tr('editorPage.aiRedraw')}
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
              <span className="empty">{tr('editorPage.noImage')}</span>
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
            {tr('editorPage.useUploadImageReplaceShot')}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="pf-panel-tabs">
              {[tr('editorPage.materialLibrary'), tr('editorPage.savedMaterial'), tr('editorPage.aiGeneratedMaterial'), tr('editorPage.myUploads')].map((t) => (
                <button key={t} type="button" disabled>
                  {t}
                </button>
              ))}
            </div>
            <p className="pf-muted" style={{ fontSize: '0.85rem' }}>
              {tr('editorPage.materialLibraryComingSoonNow')}
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
                {tr(`editorPage.${t}`)}
              </button>
            ))}
          </div>

          {tab === 'script' ? (
            <>
              <label className="pf-muted" style={{ fontSize: '0.85rem', display: 'block' }}>
                {tr('editorPage.scriptText')}
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
                {tr('editorPage.improveShotAi')} <ComingSoon />
              </button>
              <div style={{ marginTop: '0.85rem' }}>
                <strong style={{ fontSize: '0.88rem' }}>
                  {tr('editorPage.styleSettings')} <ComingSoon />
                </strong>
                <p className="pf-muted" style={{ fontSize: '0.8rem' }}>
                  {tr('editorPage.fontSizeColorAlignmentPlaceholder')}
                </p>
              </div>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                style={{ marginTop: '1rem' }}
                disabled={busy}
                onClick={saveNarration}
              >
                {tr('editorPage.saveScript')}
              </button>
            </>
          ) : null}

          {tab === 'visuals' ? (
            <>
              <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                {tr('editorPage.useUploadImagePreviewReplace')}
              </p>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                disabled={busy}
                onClick={regenImage}
              >
                {tr('editorPage.regenerateShot')}
              </button>
            </>
          ) : null}

          {tab === 'voiceOver' ? (
            <>
              <p className="pf-muted" style={{ fontSize: '0.88rem' }}>
                {tr('editorPage.replaceShotSVoiceOver')}
              </p>
              <button
                type="button"
                className="pf-btn pf-btn-lime pf-btn-block"
                disabled={busy}
                onClick={regenAudio}
              >
                {tr('editorPage.replaceVoiceOver')}
              </button>
            </>
          ) : null}

          {tab === 'transitions' ? (
            <div className="pf-hint">
              {tr('editorPage.transitionEffectsFadesWhiteFlashes')}
            </div>
          ) : null}

          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-btn-block"
            style={{ marginTop: '1rem' }}
            disabled
          >
            {tr('editorPage.applyAllSimilarShots')} <ComingSoon />
          </button>
        </aside>
      </div>
    </AppShell>
  )
}
