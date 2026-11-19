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

test('loading and delayed reflows keep the current post in place, while new posts reset it', () => {
  const frames: (() => void)[] = []
  const events = new Map<string, (() => void)[]>()
  const clicks: ((event: { target: unknown }) => void)[] = []
  const style = () => ({
    setProperty(this: Record<string, any>, name: string, value: string) { this[name] = value },
    removeProperty(this: Record<string, any>, name: string) { delete this[name] },
  })
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
    style: Record<string, any> = style()
    offsetHeight = 200
    isConnected = true
    previousElementSibling: Cell | null = null
    readonly id: string
    constructor(id: string) { this.id = id }
    querySelector(selector: string): unknown {
      if (selector === 'article') return this.id === '$footer' ? null : {}
      if (selector === 'time' && this.id !== '$footer') return { closest: () => ({ getAttribute: () => `/user/status/${this.id}` }) }
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
    children.push(new Cell('$footer'))
    children.forEach((cell, i) => cell.previousElementSibling = children[i - 1] ?? null)
    return Object.assign(fakeContainer({ _getRenderCandidates() {}, _update() {}, props: { cacheKey: 'home' } }, { onNearEnd() {} }), {
      children, isConnected: true, clientWidth: 1000, style: style() as Record<string, any>, classList: classes(),
      getBoundingClientRect() {
        const rows = Math.max(...children.map((cell) => {
          const parts = String(cell.style.gridArea ?? '1 / 1 / span 1').split('/')
          return Number.parseInt(parts[0]!) - 1 + (Number.parseInt(parts[2]?.replace('span', '') ?? '1') || 1)
        }))
        return { top: -(globalThis as any).scrollY, height: Math.max(rows * 4, Number.parseFloat(this.style['--xnote-loading-height'] ?? '0')) + 24 }
      },
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
      documentElement: { append() {}, classList: classes(), style: { setProperty() {} }, get scrollHeight() { return grid.getBoundingClientRect().height } },
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
      // The browser clamps scrolling when layout shortens the document.
      ;(globalThis as any).scrollY = Math.min((globalThis as any).scrollY, Math.max(0, grid.getBoundingClientRect().height - 300))
    }
  }
  try {
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    const store = createStore({ getItem: () => '{"wideLayout":true}', setItem() {} })
    const masonry = installMasonry(store)
    flush()
    const oldHeight = grid.getBoundingClientRect().height
    const bottom = oldHeight - 300
    ;(globalThis as any).scrollY = bottom
    for (const callback of events.get('scroll') ?? []) callback()
    grid.children.at(-1)!.offsetHeight = 0 // X removes the loading footer before appending posts.
    store.set('hideGrok', false)
    flush()
    assert.equal((globalThis as any).scrollY, bottom, 'loading must not clamp the viewport upward')
    assert.equal(grid.getBoundingClientRect().height, oldHeight)
    ;(globalThis as any).scrollY = 0
    for (const callback of events.get('scroll') ?? []) callback()
    flush()
    assert.ok(grid.getBoundingClientRect().height < oldHeight, 'the reserved space must disappear when leaving the bottom')
    grid.children[19]!.offsetHeight += 200
    store.set('hideGrok', false)
    flush()
    ;(globalThis as any).scrollY = grid.getBoundingClientRect().height - 300
    for (const callback of events.get('scroll') ?? []) callback()
    const lastInShortColumn = grid.children[18]!
    const bottomPostTop = lastInShortColumn.getBoundingClientRect().top
    grid.children[0]!.offsetHeight += 80
    store.set('hideGrok', false)
    flush()
    assert.equal(lastInShortColumn.getBoundingClientRect().top, bottomPostTop, 'bottom anchoring must reserve room when the shorter column grows')
    ;(globalThis as any).scrollY = 400
    for (const callback of events.get('scroll') ?? []) callback()
    const current = grid.children[4]!
    const currentTop = current.getBoundingClientRect().top
    for (const index of [0, 1]) grid.children[index]!.offsetHeight += 400
    store.set('hideGrok', false)
    flush()
    assert.equal(current.getBoundingClientRect().top, currentTop, 'an ordinary reflow must keep the current post on screen')
    for (const index of [2, 3]) grid.children[index]!.offsetHeight += 160
    store.set('hideGrok', false)
    flush()
    assert.equal(current.getBoundingClientRect().top, currentTop, 'a second delayed reflow must keep the same place')
    ;(globalThis as any).scrollY += 100
    for (const callback of events.get('scroll') ?? []) callback()
    const scrolledTop = current.getBoundingClientRect().top
    for (const index of [0, 1]) grid.children[index]!.offsetHeight += 80
    store.set('hideGrok', false)
    flush()
    assert.equal(current.getBoundingClientRect().top, scrolledTop, 'compensation must respect the latest user scroll')
    const lateInNativeOrder = new Cell('late-in-native-order')
    grid.children.splice(1, 0, lateInNativeOrder)
    grid.children.forEach((cell, i) => cell.previousElementSibling = grid.children[i - 1] ?? null)
    store.set('hideGrok', false)
    flush()
    assert.ok(Number.parseInt(lateInNativeOrder.style.gridArea) > 1, 'late cards must not disrupt reading while scrolled down')
    ;(globalThis as any).scrollY = 0
    for (const callback of events.get('scroll') ?? []) callback()
    flush() // No DOM mutation: scrolling to the top alone must restore native top order.
    assert.deepEqual(lateInNativeOrder.style.gridArea.split('/').slice(0, 2).map(Number), [1, 2])
    ;(globalThis as any).scrollY = 400
    for (const callback of events.get('scroll') ?? []) callback()
    for (const callback of clicks) callback({ target: new Cell('pill') })
    ;(globalThis as any).scrollY = 0
    for (const callback of events.get('scroll') ?? []) callback()
    store.set('hideGrok', false)
    flush() // The old posts render again before X delivers the new posts.
    const newFirst = new Cell('new-first')
    grid.children.unshift(newFirst)
    grid.children.forEach((cell, i) => cell.previousElementSibling = grid.children[i - 1] ?? null)
    store.set('hideGrok', false)
    flush()
    assert.deepEqual(newFirst.style.gridArea.split('/').slice(0, 2).map(Number), [1, 1], 'delayed new posts must render at the visual top, not merely lead the DOM')
    const newSecond = new Cell('new-second')
    grid.children.splice(1, 0, newSecond)
    grid.children.forEach((cell, i) => cell.previousElementSibling = grid.children[i - 1] ?? null)
    store.set('hideGrok', false)
    flush()
    assert.deepEqual(newSecond.style.gridArea.split('/').slice(0, 2).map(Number), [1, 2], 'a later wave must keep native top order even when the first post is unchanged')
    grid.clientWidth = 1400
    store.set('cardMinWidth', 380)
    flush()
    assert.equal((globalThis as any).scrollY, 0, 'resizing at the top must stay at the top')
    for (let i = 0; i < 3; i++) assert.deepEqual(grid.children[i]!.style.gridArea.split('/').slice(0, 2).map(Number), [1, i + 1])
    ;(globalThis as any).scrollY = 0 // X scrolls up before rebuilding its timeline.
    // The DOM can be rebuilt before the browser delivers that scroll event.
    grid.isConnected = false
    grid = makeGrid()
    queuePageCheck()
    flush()
    assert.equal((globalThis as any).scrollY, 0)
    ;(globalThis as any).scrollY = 400
    for (const callback of events.get('scroll') ?? []) callback()
    const anchor = grid.children[4]!.getBoundingClientRect().top
    grid.isConnected = false
    grid = makeGrid()
    for (const cell of grid.children.slice(0, 2)) cell.offsetHeight += 200
    ;(globalThis as any).scrollY = 0
    assert.equal(masonry.isReadingPositionReady(400), false, 'keep the backdrop while the feed is detached')
    queuePageCheck()
    flush()
    assert.equal(grid.children[4]!.getBoundingClientRect().top, anchor)
    assert.notEqual((globalThis as any).scrollY, 400)
    assert.equal(masonry.isReadingPositionReady(400), true, 'reveal immediately when the same post is back in place')
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
