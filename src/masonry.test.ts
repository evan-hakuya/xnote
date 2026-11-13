import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findInternals } from './masonry.ts'

// A stand-in for a DOM node with a React fiber chain: node -> scroller -> list owner.
function fakeContainer(scroller: object, ownerProps: object) {
  const owner = { stateNode: null, memoizedProps: ownerProps, return: null }
  const middle = { stateNode: scroller, memoizedProps: {}, return: owner }
  return { '__reactFiber$abc': { stateNode: null, memoizedProps: {}, return: middle } }
}

test('finds the scroller and the paging callback', () => {
  const scroller = { _getRenderCandidates() {} }
  const onNearEnd = () => {}
  assert.deepEqual(findInternals(fakeContainer(scroller, { onNearEnd })), { scroller, nearEnd: onNearEnd })
})

test('reports missing internals so that masonry falls back', () => {
  assert.equal(findInternals({}), null)
  assert.equal(findInternals(fakeContainer({}, { onNearEnd() {} })), null)
  assert.equal(findInternals(fakeContainer({ _getRenderCandidates() {} }, {})), null)
})
