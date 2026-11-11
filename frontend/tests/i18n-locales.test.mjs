import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLocale } from '../src/i18n/detect.ts'
import { tr } from '../src/i18n/translate.ts'
import { points } from '../src/lib/points.ts'
import { DRAMA_CAMERA_LEXICON, filterDramaCameraLexicon } from '../src/lib/dramaCameraLexicon.ts'
import { getImageStyleLabel } from '../src/lib/dramaImageStyles.ts'

// 三语切换后 tr()、积分单位与读取时翻译的 getter 都跟随当前语言；测试结束恢复中文
test('tr() 与积分单位按当前语言输出', () => {
  try {
    applyLocale('en', false)
    assert.equal(tr('uiCommon.aiShots'), 'AI shots')
    assert.match(points(1000), /^1,000 Points$/)
    assert.equal(tr('uiCommon.creditedAmount', { amount: 'X' }), 'Credited X')
    applyLocale('vi', false)
    assert.equal(tr('uiCommon.aiShots'), 'AI chia phân cảnh')
    assert.match(points(1000), /điểm$/)
    applyLocale('zh', false)
    assert.equal(tr('uiCommon.aiShots'), 'AI 分镜')
    assert.match(points(1000), /积分$/)
  } finally {
    applyLocale('zh', false)
  }
})

test('缺失键返回路径，插值保留模板字符串语义', () => {
  assert.equal(tr('uiCommon.__missing__'), 'uiCommon.__missing__')
  assert.equal(tr('uiCommon.assetN', { id: null }), '资产 null')
})

test('画风名与景别词库在读取时翻译，插入脚本的前缀保持中文语法', () => {
  try {
    applyLocale('en', false)
    assert.equal(getImageStyleLabel('wuxia-realistic-photo'), 'Realistic wuxia photography')
    const closeup = DRAMA_CAMERA_LEXICON.find((item) => item.id === 'closeup')
    assert.equal(closeup?.label, 'Close-up')
    assert.equal(closeup?.insert, '特写：')
    assert.ok(filterDramaCameraLexicon(DRAMA_CAMERA_LEXICON, 'close-up').some((item) => item.id === 'closeup'))
    applyLocale('vi', false)
    assert.equal(getImageStyleLabel('wuxia-realistic-photo'), 'Nhiếp ảnh võ hiệp giang hồ tả thực')
  } finally {
    applyLocale('zh', false)
  }
})
