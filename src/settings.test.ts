import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStore, defaults } from './settings.ts'

function fakeStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set('xnote:settings', initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

test('uses defaults when nothing is stored', () => {
  assert.deepEqual(createStore(fakeStorage()).get(), defaults)
})

test('ignores corrupt data, unknown keys and wrong types', () => {
  assert.deepEqual(createStore(fakeStorage('{not json')).get(), defaults)
  assert.deepEqual(createStore(fakeStorage('null')).get(), defaults)
  assert.deepEqual(createStore(fakeStorage('{"enabled":"no","other":1}')).get(), defaults)
})

test('persists a change and notifies listeners', () => {
  const storage = fakeStorage()
  const store = createStore(storage)
  const seen: boolean[] = []
  store.subscribe((values) => seen.push(values.enabled))
  store.set('enabled', false)
  assert.deepEqual(seen, [true, false])
  assert.equal(createStore(storage).get().enabled, false)
})

test('imports exported settings and rejects anything else', () => {
  const storage = fakeStorage()
  const store = createStore(storage)
  store.set('cardGap', 20)
  const seen: number[] = []
  store.subscribe((values) => seen.push(values.cardGap))
  // Known keys of the right type are taken; a missing key goes back to its default.
  assert.equal(store.load('{"enabled":false,"cardMinWidth":300,"other":1,"cardGap":"x"}'), 2)
  assert.equal(store.get().enabled, false)
  assert.equal(store.get().cardMinWidth, 300)
  assert.equal(store.get().cardGap, defaults.cardGap)
  assert.deepEqual(seen, [20, defaults.cardGap])
  assert.equal(createStore(storage).get().cardMinWidth, 300)
  for (const bad of ['{not json', 'null', '[]', '{"other":1}']) assert.throws(() => store.load(bad))
  assert.equal(store.get().cardMinWidth, 300) // unchanged after a rejected import
})
