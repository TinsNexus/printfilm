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
import { tr } from '../../i18n/translate.ts'

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
      title={tr('seedanceRulesModal.seedanceParametersUsageRules')}
      size="lg"
      className="pf-help-modal seedance-rules-modal"
      footer={
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
          {tr('seedanceRulesModal.got')}
        </button>
      }
    >
      <div className="pf-help">
        <p className="pf-help-lede">
          {tr('seedanceRulesModal.shotVideosGeneratedSeedanceMultimodal')}{' '}
          <code>docs/EPISODE_RULES.md</code>）。
        </p>

        <div className="pf-help-tabs" role="tablist" aria-label={tr('seedanceRulesModal.seedanceRuleCategories')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'payload'}
            className={tab === 'payload' ? 'active' : undefined}
            onClick={() => setTab('payload')}
          >
            {tr('seedanceRulesModal.parameters')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'script'}
            className={tab === 'script' ? 'active' : undefined}
            onClick={() => setTab('script')}
          >
            {tr('seedanceRulesModal.scriptSyntax')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usage'}
            className={tab === 'usage' ? 'active' : undefined}
            onClick={() => setTab('usage')}
          >
            {tr('seedanceRulesModal.tips')}
          </button>
        </div>

        {tab === 'payload' ? (
          <div className="seedance-rules-section">
            <h4>{tr('seedanceRulesModal.topBarSettingsApiFields')}</h4>
            <ul className="seedance-rules-list">
              <li>
                <strong>{tr('seedanceRulesModal.model')}</strong> → <code>model</code>（Seedance 2.5 / 1.5）
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.aspectRatioQuality')}</strong>{tr('seedanceRulesModal.episodeTopBar')} <code>ratio</code>、<code>resolution</code>
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.duration')}</strong> → <code>duration</code>{tr('seedanceRulesModal.scriptS')}{' '}
                <code>@duration</code> {tr('seedanceRulesModal.totalRecommended4')}{FRAGMENT_CONTENT_DURATION_MAX} {tr('seedanceRulesModal.sWithoutTagsShotS')}
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.videoStyle')}</strong> {tr('seedanceRulesModal.writtenIntoPromptSMandatory')}
              </li>
            </ul>

            <h4>{tr('seedanceRulesModal.contentMultimodalArraySentOrder')}</h4>
            <ol className="seedance-rules-list">
              <li>
                <strong>text</strong>{tr('seedanceRulesModal.automaticallyAssembledPromptConstraintBlocks')}
              </li>
              <li>
                <strong>reference_image</strong>{tr('seedanceRulesModal.coverMainImageEachCharacter')}
              </li>
              <li>
                <strong>reference_audio</strong>{tr('seedanceRulesModal.previewAudioSpeakingCharactersNarration')}
              </li>
            </ol>
            <p className="seedance-rules-note">
              {tr('seedanceRulesModal.default')} <code>generate_audio</code>{tr('seedanceRulesModal.seedanceVoicesLinesNativelyWhen')}
            </p>

            <h4>{tr('seedanceRulesModal.promptAssemblyOrder')}</h4>
            <ol className="seedance-rules-list">
              <li>【强制约束：视频画面风格】— 项目所选画风描述</li>
              <li>【强制约束：音频、字幕与配乐】— 根据脚本旁白 / 对白 / 画面 cue 推断</li>
              <li>【强制约束：角色音色】— 角色名 → 参考音频序号（已绑且本镜开口）</li>
              <li>【强制约束：旁白音色】— 旁白 → 参考音频序号（已绑项目旁白音色）</li>
              <li>【强制约束：角色形象】— 角色名 → 参考图序号</li>
              <li>【强制约束：场景】— 场景名 → 参考图序号</li>
              <li>【强制约束：道具】— 道具名 → 参考图序号</li>
              <li>
                {tr('seedanceRulesModal.bodyReplaces')} <code>@asset:ID</code> {tr('seedanceRulesModal.nameReferenceImageNReplaces')}{' '}
                <code>@duration:N</code> {tr('seedanceRulesModal.timeRangeEG00')}
              </li>
            </ol>
          </div>
        ) : null}

        {tab === 'script' ? (
          <div className="seedance-rules-section">
            <h4>{tr('seedanceRulesModal.durationTag')}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@duration:N</code>{tr('seedanceRulesModal.marksSegmentSDurationSeconds')}{' '}
                {DRAMA_SEGMENT_DURATION_MIN}–{DRAMA_SEGMENT_DURATION_MAX} {tr('seedanceRulesModal.s')}
              </li>
              <li>
                {tr('seedanceRulesModal.newShotsShouldTotal')} {FRAGMENT_CONTENT_DURATION_MAX} {tr('seedanceRulesModal.sPerShotOlderDrafts')} {DRAMA_SHOT_DURATION_HARD_MAX} {tr('seedanceRulesModal.s')}
              </li>
              <li>{tr('seedanceRulesModal.type')} <code>@</code> {tr('seedanceRulesModal.insertDurationChipReferenceAsset')}</li>
            </ul>

            <h4>{tr('seedanceRulesModal.assetReference')}</h4>
            <ul className="seedance-rules-list">
              <li>
                <code>@asset:123</code>{tr('seedanceRulesModal.referencesCharacterScenePropId')}
              </li>
              <li>{tr('seedanceRulesModal.clickingAssetLeftPanelShot')}</li>
              <li>{tr('seedanceRulesModal.referencedCharactersNeedReferenceImage')}</li>
            </ul>

            <h4>{tr('seedanceRulesModal.commonDramaCuesDonT')}</h4>
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
                <strong>{tr('seedanceRulesModal.emptyShotFraming')}</strong>{tr('seedanceRulesModal.write')}{' '}
                <code>{VISUAL_PREFIX}</code>；<strong>{tr('seedanceRulesModal.never')}</strong>{tr('seedanceRulesModal.markDialogueNarrationWouldVoiced')}
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.dialogue')}</strong>：<code>角色名：台词</code> {tr('seedanceRulesModal.or')} {DIALOGUE_PREFIX}
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.narration')}</strong>：{DRAMA_NARRATION_PREFIX}{tr('seedanceRulesModal.subtitlesChangeLineLineSync')}
              </li>
              <li>
                <strong>{tr('seedanceRulesModal.characterIntro')}</strong>{tr('seedanceRulesModal.whenKeyCharacterFirstAppears')}<strong>{tr('seedanceRulesModal.nextCharacter')}</strong>{tr('seedanceRulesModal.notBottomSubtitleLargeCentered')}
              </li>
              <li>
                <strong>BGM</strong>{tr('seedanceRulesModal.keptBelowVoicesSoDoesn')}
              </li>
            </ul>

            <h4>{tr('seedanceRulesModal.framingCameraMovesTools')}</h4>
            <ul className="seedance-rules-list">
              <li>
                {tr('seedanceRulesModal.editorType')} <code>@</code> {tr('seedanceRulesModal.toolsFramingCameraMovesInsert')}
              </li>
              <li>{tr('seedanceRulesModal.formulaSubjectActionSceneFraming')}</li>
              <li>{tr('seedanceRulesModal.largeRotationsCloseUpsTend')}</li>
            </ul>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div className="seedance-rules-section">
            <h4>{tr('seedanceRulesModal.beforeGenerating')}</h4>
            <ul className="seedance-rules-list">
              <li>{tr('seedanceRulesModal.scriptCheckDurationsValidEmpty')}</li>
              <li>{tr('seedanceRulesModal.charactersShotSAssetsHave')}</li>
              <li>{tr('seedanceRulesModal.confirmAspectRatioQualityProject')}</li>
            </ul>

            <h4>{tr('seedanceRulesModal.queueConcurrency')}</h4>
            <ul className="seedance-rules-list">
              <li>{tr('seedanceRulesModal.shotVideosUseSeparateVideo')}</li>
              <li>{tr('seedanceRulesModal.whileOneShotGeneratesCan')}</li>
              <li>{tr('seedanceRulesModal.generateAllQueuesEveryShot')}</li>
            </ul>

            <h4>{tr('seedanceRulesModal.lastFrameContinuityBetweenShots')}</h4>
            <ul className="seedance-rules-list">
              <li>
                {tr('seedanceRulesModal.generationUses')} <code>return_last_frame=true</code>{tr('seedanceRulesModal.defaultSuccessLastFrameSaved')}{' '}
                <code>params.lastFrameUrl</code>
              </li>
              <li>
                {tr('seedanceRulesModal.whenShotContinuityEpisodeTop')} <code>reference_image</code> {tr('seedanceRulesModal.appendedEndSeedanceDoesNot')} <code>first_frame</code> {tr('seedanceRulesModal.onlyWithoutReferenceMedia')} <code>first_frame</code>
              </li>
              <li>
                {tr('seedanceRulesModal.normalGenerationAvoidWordsLike')}
              </li>
            </ul>

            <h4>{tr('seedanceRulesModal.voicesReferenceAudio')}</h4>
            <ul className="seedance-rules-list">
              <li>{tr('seedanceRulesModal.voicesCanAssignedCharactersAsset')}</li>
              <li>{tr('seedanceRulesModal.withoutAssignedVoiceSeedanceGenerate')}</li>
              <li>{tr('seedanceRulesModal.linkedCharactersScenesPropsNeed')}</li>
            </ul>

            <h4>{tr('seedanceRulesModal.aiReSplitShots')}</h4>
            <p className="seedance-rules-note">
              {tr('seedanceRulesModal.shotScriptsDurationStructureRe')}
            </p>

          </div>
        ) : null}
      </div>
    </Modal>
  )
}
