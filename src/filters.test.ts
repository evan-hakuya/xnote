import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classicWords, kindsOf } from './filters.ts'

test('names what a timeline entry is', () => {
  assert.deepEqual(kindsOf('tweet-123', {}, false), { kinds: [], quoted: undefined })
  assert.deepEqual(kindsOf('tweet-123', { retweeted_status: {} }, false).kinds, ['retweet'])
  assert.deepEqual(kindsOf('who-to-follow-1-user-2', undefined, false).kinds, ['suggest'])
  assert.deepEqual(kindsOf('messageprompt-1', undefined, false).kinds, ['prompt'])
  assert.deepEqual(kindsOf('tweetdetailrelatedtweets-1-tweet-2', {}, false).kinds, ['more'])
  assert.deepEqual(kindsOf('tweet-1', {}, true).kinds, ['tombstone'])
  assert.equal(kindsOf('tweet-1', { quoted_status: { user: { screen_name: 'KKong_1p' } } }, false).quoted, 'kkong_1p')
  assert.equal(kindsOf('tweet-1', { quoted_status: { user: { screen_name: 42 } } }, false).quoted, undefined)
})

test('puts the old words back', () => {
  assert.equal(classicWords('发帖', 'zh-Hans'), '发推')
  assert.equal(classicWords('显示 35 帖子', 'zh-Hans'), '显示 35 推文')
  assert.equal(classicWords('转帖', 'zh-Hans'), '转推')
  assert.equal(classicWords('Show 35 posts', 'en'), 'Show 35 Tweets')
  assert.equal(classicWords('Repost', 'en'), 'Retweet')
  assert.equal(classicWords('Postal code', 'en'), 'Postal code')
  assert.equal(classicWords('引用', 'zh-Hans'), '引用推文')
  assert.equal(classicWords('引用了这条', 'zh-Hans'), '引用了这条')
  assert.equal(classicWords('帖子活动', 'zh-Hans'), '推文互动')
  assert.equal(classicWords('Post your reply', 'en'), 'Tweet your reply')
  assert.equal(classicWords('Live on X', 'en'), 'Live on Twitter')
})
