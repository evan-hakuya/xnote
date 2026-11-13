import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quotedPost } from './overlay.ts'

const fakeQuote = (...props: object[]) => {
  let fiber: object | null = null
  for (const memoizedProps of props.reverse()) fiber = { memoizedProps, return: fiber }
  return { '__reactFiber$abc': fiber }
}

test('reads the nearest quoted post', () => {
  const inner = { permalink: '/user_1/status/123', extended_entities: { media: [{ type: 'photo' }] } }
  const outer = { permalink: '/other/status/456' }
  assert.deepEqual(quotedPost(fakeQuote({}, { tweet: inner }, { tweet: outer })), {
    permalink: '/user_1/status/123',
    photo: true,
  })
  assert.deepEqual(quotedPost(fakeQuote({ tweet: outer })), { permalink: '/other/status/456', photo: false })
})

test('rejects missing or unexpected data', () => {
  assert.equal(quotedPost({}), null)
  assert.equal(quotedPost(fakeQuote({ tweet: { permalink: 'https://evil.example/status/1' } })), null)
  assert.equal(quotedPost(fakeQuote({ tweet: {} })), null)
})
