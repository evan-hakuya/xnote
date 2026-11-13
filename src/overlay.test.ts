import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postOf, routerOf } from './overlay.ts'

const fakeQuote = (...props: object[]) => {
  let fiber: object | null = null
  for (const memoizedProps of props.reverse()) fiber = { memoizedProps, return: fiber }
  return { '__reactFiber$abc': fiber }
}

test('reads the nearest post and its viewer address', () => {
  const media = (url: string) => ({ extended_entities: { media: [{ expanded_url: url }] } })
  const inner = { permalink: '/user_1/status/123', ...media('/user_1/status/123/video/1') }
  const outer = { permalink: '/other/status/456' }
  assert.deepEqual(postOf(fakeQuote({}, { tweet: inner }, { tweet: outer })), {
    permalink: '/user_1/status/123',
    viewer: '/user_1/status/123/video/1',
  })
  assert.deepEqual(postOf(fakeQuote({ tweet: outer })), { permalink: '/other/status/456', viewer: null })
})

test('rejects missing or unexpected data', () => {
  assert.equal(postOf({}), null)
  assert.equal(postOf(fakeQuote({ tweet: { permalink: 'https://evil.example/status/1' } })), null)
  assert.equal(postOf(fakeQuote({ tweet: {} })), null)
  // A viewer address must belong to the post itself.
  const foreign = { permalink: '/a/status/1', extended_entities: { media: [{ expanded_url: 'https://evil.example/a/status/1/photo/1' }] } }
  assert.equal(postOf(fakeQuote({ tweet: foreign }))?.viewer, null)
})

test('finds the router only when it can push', () => {
  const history = { push() {} }
  assert.equal(routerOf(fakeQuote({}, { history })), history)
  assert.equal(routerOf(fakeQuote({ history: {} })), null)
})
