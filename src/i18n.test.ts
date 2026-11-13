import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickLang } from './i18n.ts'

test('maps X interface languages to xnote languages', () => {
  assert.equal(pickLang('zh'), 'zh-Hans')
  assert.equal(pickLang('zh-CN'), 'zh-Hans')
  assert.equal(pickLang('zh-Hant'), 'zh-Hant')
  assert.equal(pickLang('zh-TW'), 'zh-Hant')
  assert.equal(pickLang('en'), 'en')
  assert.equal(pickLang('ja'), 'en')
  assert.equal(pickLang(''), 'en')
})
