import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findInternals, installMasonry } from './masonry.ts'
import { queuePageCheck } from './page.ts'
import { createStore } from './settings.ts'
import { isNewPostsControl } from './react.ts'

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

test('recognises both new-post controls without relying on translated text or a count', () => {
  const floating = { closest: () => ({ textContent: '已发布' }) } as unknown as Element
  assert.equal(isNewPostsControl(floating), true)
  const cell = {
    querySelector: () => null,
    '__reactFiber$test': { memoizedProps: { item: { id: 'newEntriesItem' } }, return: null },
  }
  const target = { closest: (selector: string) => selector.includes('cellInnerDiv') ? cell : null } as unknown as Element
  assert.equal(isNewPostsControl(target), true)
  cell.__reactFiber$test.memoizedProps.item.id = '$footer'
  assert.equal(isNewPostsControl(target), false)
})

test('opening new posts does not restore the old post after X rebuilds the timeline', () => {
  const frames: (() => void)[] = []
  const events = new Map<string, (() => void)[]>()
  const clicks: ((event: { target: unknown }) => void)[] = []
  const classes = () => {
    const names = new Set<string>()
    return {
      contains: (name: string) => names.has(name),
      add: (name: string) => void names.add(name),
      remove: (...values: string[]) => values.forEach((name) => names.delete(name)),
      toggle: (name: string, on: boolean) => on ? names.add(name) : names.delete(name),
    }
  }
  class Cell {
    classList = classes()
    style: Record<string, any> = { setProperty() {} }
    offsetHeight = 200
    isConnected = true
    previousElementSibling: Cell | null = null
    readonly id: string
    constructor(id: string) { this.id = id }
    querySelector(selector: string): unknown {
      if (selector === 'article') return {}
      if (selector === 'time') return { closest: () => ({ getAttribute: () => `/user/status/${this.id}` }) }
      return null
    }
    closest(selector: string) { return this.id === 'pill' && selector.includes('pillLabel') ? this : null }
    getBoundingClientRect() {
      const top = (Number.parseInt(this.style.gridArea ?? '1') - 1) * 4 - (globalThis as any).scrollY
      return { top, bottom: top + this.offsetHeight, left: 0 }
    }
  }
  const makeGrid = () => {
    const children = Array.from({ length: 20 }, (_, i) => new Cell(String(i)))
    children.forEach((cell, i) => cell.previousElementSibling = children[i - 1] ?? null)
    return Object.assign(fakeContainer({ _getRenderCandidates() {}, _update() {}, props: { cacheKey: 'home' } }, { onNearEnd() {} }), {
      children, isConnected: true, clientWidth: 1000, style: {}, classList: classes(),
    })
  }
  let grid = makeGrid()
  class Observer { observe() {} unobserve() {} disconnect() {} }
  const globals: Record<string, unknown> = {
    Element: Cell, MutationObserver: Observer, ResizeObserver: Observer, IntersectionObserver: Observer,
    location: { pathname: '/home' }, innerHeight: 300, scrollY: 0,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    addEventListener: (name: string, callback: () => void) => events.set(name, [...events.get(name) ?? [], callback]),
    scrollTo: (_x: number, y: number) => (globalThis as any).scrollY = y,
    scrollBy: (_x: number, y: number) => (globalThis as any).scrollY += y,
    document: {
      documentElement: { append() {}, classList: classes(), style: { setProperty() {} }, scrollHeight: 10000 },
      createElement: () => ({}),
      querySelector: () => ({ parentElement: grid }),
      addEventListener: (name: string, callback: (event: { target: unknown }) => void) => { if (name === 'click') clicks.push(callback) },
    },
  }
  const descriptors = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const flush = () => {
    let count = 0
    while (frames.length) {
      assert.ok(++count < 30, 'layout must settle')
      frames.shift()!()
    }
  }
  try {
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    installMasonry(createStore({ getItem: () => '{"wideLayout":true}', setItem() {} }))
    flush()
    ;(globalThis as any).scrollY = 400
    for (const callback of events.get('scroll') ?? []) callback()
    for (const callback of clicks) callback({ target: new Cell('pill') })
    ;(globalThis as any).scrollY = 0 // X scrolls up before rebuilding its timeline.
    // The DOM can be rebuilt before the browser delivers that scroll event.
    grid.isConnected = false
    grid = makeGrid()
    queuePageCheck()
    flush()
    assert.equal((globalThis as any).scrollY, 0)
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
