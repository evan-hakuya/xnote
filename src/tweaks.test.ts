import assert from 'node:assert/strict'
import { test } from 'node:test'
import { featureSwitches } from './tweaks.ts'

const rootWith = (contextProviderProps: object) => ({
  '__reactProps$abc': { children: { props: { children: { props: { contextProviderProps } } } } },
})

test('finds the feature switches and rejects anything else', () => {
  const switches = { isTrue: () => true }
  assert.equal(featureSwitches(rootWith({ featureSwitches: switches })), switches)
  assert.equal(featureSwitches(rootWith({ featureSwitches: {} })), null)
  assert.equal(featureSwitches(rootWith({})), null)
  assert.equal(featureSwitches({}), null)
  assert.equal(featureSwitches(null), null)
})
