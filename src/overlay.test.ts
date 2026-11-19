import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postOf, routerOf, snapshotOf } from './overlay.ts'

test('the backdrop clones visible grid cells only, including both viewport edges', () => {
  const copies: string[] = []
  class Box {
    parentNode?: Box
    childNodes: Box[] = []
    style: Record<string, string> = {}
    get children() { return this.childNodes }
    name: string
    top: number
    height: number
    constructor(name: string, top = 0, height = 100) {
      this.name = name
      this.top = top
      this.height = height
    }
    append(...nodes: Box[]) { for (const node of nodes) this.appendChild(node) }
    appendChild(node: Box) { this.childNodes.push(node); node.parentNode = this }
    getBoundingClientRect() { return { top: this.top, bottom: this.top + this.height, height: this.height } }
    querySelector(): Box | undefined { return this.name === 'grid' ? this : this.children.map(n => n.querySelector()).find(Boolean) }
    cloneNode(deep: boolean): Box {
      copies.push(this.name)
      const copy = new Box(this.name)
      if (deep) copy.append(...this.children.map(n => n.cloneNode(true)))
      return copy
    }
  }
  const column = new Box('column'), section = new Box('section'), grid = new Box('grid', -200, 9000)
  column.append(new Box('tabs'), section)
  section.append(grid)
  grid.append(...[-100, -50, 100, 200, 300].map(top => new Box(String(top), top)))
  const snapshot = snapshotOf(column as unknown as Element, 250) as unknown as Box
  assert.deepEqual(copies, ['column', 'tabs', 'section', 'grid', '-50', '100', '200'])
  assert.equal(snapshot.querySelector()?.style.height, '9000px')
})

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
