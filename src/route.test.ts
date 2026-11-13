import assert from 'node:assert/strict'
import { test } from 'node:test'
import { feedKind } from './route.ts'

test('recognises feed pages', () => {
  assert.equal(feedKind('/home'), 'home')
  assert.equal(feedKind('/search'), 'search')
  assert.equal(feedKind('/hashtag/xnote'), 'search')
  assert.equal(feedKind('/evan_hakuya'), 'profile')
  assert.equal(feedKind('/evan_hakuya/with_replies'), 'profile')
})

test('leaves other pages alone', () => {
  for (const path of ['/', '/explore', '/notifications', '/i/bookmarks', '/settings/account',
    '/evan_hakuya/media', '/evan_hakuya/status/123', '/i/web/status/123', '/evan_hakuya/followers']) {
    assert.equal(feedKind(path), null, path)
  }
})

test('keeps the current state on layer routes', () => {
  for (const path of ['/evan_hakuya/status/123/photo/1', '/i/web/status/123/video/1', '/compose/post',
    '/evan_hakuya/photo', '/i/keyboard_shortcuts']) {
    assert.equal(feedKind(path), 'keep', path)
  }
})
