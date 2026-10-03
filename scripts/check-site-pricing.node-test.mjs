import assert from 'node:assert/strict'
import test from 'node:test'
import { findPriceMentions, pageText } from './check-site-pricing.mjs'

const rules = (text) => findPriceMentions(text).map((mention) => mention.rule)

test('red: a currency symbol next to a number is a price', () => {
  for (const text of ['每张 ¥99 起', 'Only $5 per clip', '售价￥ 20', 'costs 100￥', '€3 a month', 'about £12']) {
    assert.ok(rules(text).includes('currency-next-to-number'), text)
  }
})

test('red: a number followed by 元 / 美元 / 积分 / credits is a price', () => {
  for (const text of ['99 元起', '9.9 美元', '一次 100 积分', '10 credits per run', '1 credit', '5元每次']) {
    assert.ok(rules(text).includes('number-with-price-unit'), text)
  }
})

test('red: per-unit billing wording is a price even without a number', () => {
  for (const text of ['按秒计费', '按次收费', '每张计费', '每次付费', 'The model is billed per second of video', 'charged per image', 'priced per generation', 'per image billing applies', 'per second pricing']) {
    assert.ok(rules(text).includes('billed-per-unit'), text)
  }
})

test('green: sentences that only talk about price-tag text drawn inside an image are not prices', () => {
  const sentences = [
    '价格、招牌、标语这类要出现在图里的文字，Meta 说这版渲染准确度更高。',
    '带清楚文字的海报、价签、招牌类素材。',
    '价格、标语这些要出现的文字，具体数字和文案直接写出来，别让模型自己编。',
    '海报上方留白写「秋季新品 · 全场 8 折」，字体简洁清晰可读。',
    'for baked-in text like prices, signage or taglines, Meta says rendering accuracy is stronger in this version.',
    'Posters, price tags or signage-style assets that need legible in-image text.',
    'Leave space at the top for the headline "Autumn Arrivals - 20% Off", clean and legible type.',
  ]
  for (const sentence of sentences) assert.deepEqual(findPriceMentions(sentence), [], sentence)
})

test('green: timing, counts and idioms that happen to contain unit-like words are not prices', () => {
  const sentences = [
    'As fast as 4 seconds per image: latency is dramatically reduced.',
    '时长按秒数字符串传：范围是 4–12 秒，不填默认 5 秒。',
    '时间轴可以按秒分段写，官方文档认这种写法。',
    '写一两个词效果会打折扣。',
    '多图合成时给每张图一个角色。',
    '每张参考图对应哪个元素要写清楚：最多 7 张参考图或参考视频。',
    '最多 5 个元素，3 元素也行，10 元数据字段，2 元宇宙场景。',
    'a 3 creditable reference and 2 credited authors',
  ]
  for (const sentence of sentences) assert.deepEqual(findPriceMentions(sentence), [], sentence)
})

test('a verbatim prompt block may contain a price the image model should draw; the same text in prose may not', () => {
  const promptBlock = '<main><pre class="prompt-text" id="p1">Launch poster, Price: &quot;$280&quot; Primary CTA</pre></main>'
  assert.deepEqual(findPriceMentions(pageText(promptBlock)), [])
  const prose = '<main><p>Launch poster, Price: $280 Primary CTA</p></main>'
  assert.ok(findPriceMentions(pageText(prose)).length >= 1)
})

test('titles and meta descriptions are scanned too, scripts and JSON-LD are not', () => {
  const html = '<html><head><title>Kling 3.0 from $9 a month</title><meta name="description" content="99 元起" /><script type="application/ld+json">{"price":"$5"}</script></head><body><p>ok</p><script>var cost = "$5"</script></body></html>'
  const found = findPriceMentions(pageText(html)).map((mention) => mention.match)
  assert.ok(found.includes('$9'), JSON.stringify(found))
  assert.ok(found.includes('99 元'), JSON.stringify(found))
  assert.ok(!found.includes('$5'), 'code and JSON-LD are not page text')
})
