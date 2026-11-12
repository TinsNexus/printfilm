import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLocale } from '../src/i18n/detect.ts'
import { modelPriceSuffix, withPriceLabels } from '../src/lib/mediaModelPriceLabel.ts'

// 价格后缀取已开放分辨率的最低～最高价（元→积分），无价目不加后缀
test('模型 label 接上积分单价区间', () => {
  try {
    applyLocale('zh', false)
    assert.equal(modelPriceSuffix({ prices: { '1K': '0.7665', '4K': '1.3140' }, available_resolutions: ['1K', '4K'], billing_unit: 'image' }), '76.65–131.4 积分/张')
    assert.equal(modelPriceSuffix({ prices: { '720p': '0.5000' }, billing_unit: 'second' }), '50 积分/秒')
    assert.equal(modelPriceSuffix({ prices: {}, billing_unit: 'image' }), '')
    // 未开放的分辨率不计入区间
    assert.equal(modelPriceSuffix({ prices: { '1K': '0.1000', '2K': '0.2000' }, available_resolutions: ['1K'] }), '10 积分/张')
    const cat = withPriceLabels({ image_models: [{ id: 'a', label: 'A', prices: { '1K': '0.1000' }, available_resolutions: ['1K'] }, { id: 'b', label: 'B' }], video_models: [], defaults: {} })
    assert.equal(cat.image_models[0].label, 'A · 10 积分/张')
    assert.equal(cat.image_models[0].name, 'A')
    assert.equal(cat.image_models[1].label, 'B')
    // 重复装饰不叠加后缀
    assert.equal(withPriceLabels(cat).image_models[0].label, 'A · 10 积分/张')
    applyLocale('vi', false)
    assert.equal(modelPriceSuffix({ prices: { '1K': '0.1000' } }), '10 điểm/ảnh')
  } finally {
    applyLocale('zh', false)
  }
})
