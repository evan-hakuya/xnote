import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installGallerySwipe } from './gallery-swipe.ts'

test('post navigation follows settled scroll only and keyboard navigation realigns the track', t => {
  class Observer { observe() {} disconnect() {} }
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: Observer })
  t.after(() => { Reflect.deleteProperty(globalThis, 'MutationObserver') })
  const location = { pathname: '/user/status/123/photo/2' }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: location })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous)
    else Reflect.deleteProperty(globalThis, 'location')
  })
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 600, scrollLeft: 0, classList: { add() {}, remove() {} },
  })
  const list = { parentElement: viewport, children: Array(4), isConnected: true }
  const turns: string[] = []
  const carousel = { querySelector: (s: string) => ({ click: () => turns.push(s) }) }
  const swipe = installGallerySwipe(list as unknown as HTMLElement, carousel as unknown as HTMLElement)
  assert.equal(viewport.scrollLeft, 600)
  viewport.scrollLeft = 930
  viewport.dispatchEvent(new Event('scroll'))
  swipe.sync()
  assert.equal(viewport.scrollLeft, 930)
  assert.deepEqual(turns, [])
  viewport.scrollLeft = 1200
  viewport.dispatchEvent(new Event('scrollend'))
  assert.match(turns[0]!, /NavRight/)
  location.pathname = '/user/status/123/photo/3'
  swipe.sync()
  location.pathname = '/user/status/123/photo/2'
  swipe.sync()
  assert.equal(viewport.scrollLeft, 600)
  swipe.stop()
  viewport.dispatchEvent(new Event('scrollend'))
  assert.equal(turns.length, 1)
})
