/** Seedance 传值与脚本规则说明弹窗（分集编辑页，对齐 docs/EPISODE_RULES.md） */
import { useState } from 'react'
import { tMarkup, useI18n } from '../../i18n'
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

type Tab = 'payload' | 'script' | 'usage'

type Props = {
  open: boolean
  onClose: () => void
}

// 渲染 Seedance 规则说明弹窗
export function SeedanceRulesModal({ open, onClose }: Props) {
  const { t: tx } = useI18n()
  // 说明文案里 **粗体** / `代码` 由 tMarkup 渲染；{变量} 先插值
  const md = (key: string, vars?: Record<string, string | number>) => tMarkup(tx(`seedanceRules.${key}`, vars))
  const [tab, setTab] = useState<Tab>('payload')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tx('seedanceRules.title')}
      size="lg"
      className="pf-help-modal seedance-rules-modal"
      footer={
        <button type="button" className="pf-btn pf-btn-lime pf-btn-sm" onClick={onClose}>
          {tx('seedanceRules.gotIt')}
        </button>
      }
    >
      <div className="pf-help">
        <p className="pf-help-lede">
          {md('lede')}
        </p>

        <div className="pf-help-tabs" role="tablist" aria-label={tx('seedanceRules.tabsAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'payload'}
            className={tab === 'payload' ? 'active' : undefined}
            onClick={() => setTab('payload')}
          >
            {tx('seedanceRules.tabPayload')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'script'}
            className={tab === 'script' ? 'active' : undefined}
            onClick={() => setTab('script')}
          >
            {tx('seedanceRules.tabScript')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usage'}
            className={tab === 'usage' ? 'active' : undefined}
            onClick={() => setTab('usage')}
          >
            {tx('seedanceRules.tabUsage')}
          </button>
        </div>

        {tab === 'payload' ? (
          <div className="seedance-rules-section">
            <h4>{tx('seedanceRules.hTopbar')}</h4>
            <ul className="seedance-rules-list">
              <li>{md('pModel')}</li>
              <li>{md('pRatio')}</li>
              <li>{md('pDuration', { max: FRAGMENT_CONTENT_DURATION_MAX })}</li>
              <li>{md('pStyle')}</li>
            </ul>

            <h4>{tx('seedanceRules.hContent')}</h4>
            <ol className="seedance-rules-list">
              <li>{md('cText')}</li>
              <li>{md('cImage')}</li>
              {/* 音色难控：暂不提交 reference_audio，口播由 generate_audio 自发挥
              <li>
                <strong>reference_audio</strong>：已绑定音色的角色与旁白试听音频
              </li>
              */}
            </ol>
            <p className="seedance-rules-note">{md('noteAudio')}</p>

            <h4>{tx('seedanceRules.hOrder')}</h4>
            <ol className="seedance-rules-list">
              <li>{tx('seedanceRules.o1')}</li>
              <li>{tx('seedanceRules.o2')}</li>
              {/*
              <li>【强制约束：角色音色】— 角色名 → 参考音频序号</li>
              <li>【强制约束：旁白音色】— 旁白 → 参考音频序号</li>
              */}
              <li>{tx('seedanceRules.o3')}</li>
              <li>{tx('seedanceRules.o4')}</li>
              <li>{tx('seedanceRules.o5')}</li>
              <li>{md('o6')}</li>
            </ol>
          </div>
        ) : null}

        {tab === 'script' ? (
          <div className="seedance-rules-section">
            <h4>{tx('seedanceRules.hDuration')}</h4>
            <ul className="seedance-rules-list">
              <li>{md('dTag', { min: DRAMA_SEGMENT_DURATION_MIN, max: DRAMA_SEGMENT_DURATION_MAX })}</li>
              <li>{md('dTotal', { max: FRAGMENT_CONTENT_DURATION_MAX, hard: DRAMA_SHOT_DURATION_HARD_MAX })}</li>
              <li>{md('dAt')}</li>
            </ul>

            <h4>{tx('seedanceRules.hRef')}</h4>
            <ul className="seedance-rules-list">
              <li>{md('rRef')}</li>
              <li>{tx('seedanceRules.rAuto')}</li>
              <li>{tx('seedanceRules.rVoice')}</li>
            </ul>

            {/* 以下示例行是脚本里真实要写的中文语法，不随界面语言翻译 */}
            <h4>{tx('seedanceRules.hCue')}</h4>
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
              <li>{md('kEmpty', { visual: VISUAL_PREFIX })}</li>
              <li>{md('kDialogue', { dialogue: DIALOGUE_PREFIX })}</li>
              <li>{md('kNarration', { narration: DRAMA_NARRATION_PREFIX })}</li>
              <li>{md('kIntro')}</li>
              <li>{md('kBgm')}</li>
            </ul>

            <h4>{tx('seedanceRules.hCamera')}</h4>
            <ul className="seedance-rules-list">
              <li>{md('cam1')}</li>
              <li>{tx('seedanceRules.cam2')}</li>
              <li>{tx('seedanceRules.cam3')}</li>
            </ul>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div className="seedance-rules-section">
            <h4>{tx('seedanceRules.hCheck')}</h4>
            <ul className="seedance-rules-list">
              <li>{tx('seedanceRules.u1')}</li>
              <li>{tx('seedanceRules.u2')}</li>
              <li>{tx('seedanceRules.u3')}</li>
            </ul>

            <h4>{tx('seedanceRules.hQueue')}</h4>
            <ul className="seedance-rules-list">
              <li>{tx('seedanceRules.q1')}</li>
              <li>{tx('seedanceRules.q2')}</li>
              <li>{tx('seedanceRules.q3')}</li>
            </ul>

            <h4>{tx('seedanceRules.hLink')}</h4>
            <ul className="seedance-rules-list">
              <li>{md('l1')}</li>
              <li>{md('l2')}</li>
              <li>{tx('seedanceRules.l3')}</li>
            </ul>

            <h4>{tx('seedanceRules.hAudio')}</h4>
            <ul className="seedance-rules-list">
              <li>{tx('seedanceRules.a1')}</li>
              <li>{tx('seedanceRules.a2')}</li>
            </ul>

            <h4>{tx('seedanceRules.hReplan')}</h4>
            <p className="seedance-rules-note">{tx('seedanceRules.replanNote')}</p>

          </div>
        ) : null}
      </div>
    </Modal>
  )
}
