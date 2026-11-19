import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parkCard, restoreSlots } from './virtual-card.ts'

test('unmounts the post inside its measured slot and restores current content', () => {
  const cell = { isConnected: true, __reactFiber$x: { stateNode: {} } }
  const owner = {
    props: { item: { id: 'a' } },
    content: 'old',
    getElement: () => cell,
    render() { return { props: { children: { props: { testID: 'cellInnerDiv', children: this.content } } } } },
    forceUpdate(done?: () => void) { done?.() },
  }
  cell.__reactFiber$x.stateNode = owner
  const parked = parkCard(cell as unknown as HTMLElement)!
  assert.equal(owner.render().props.children.props.children, null)
  owner.content = 'new'
  owner.props.item.id = 'b'
  assert.equal(parked.sameItem(), false)
  assert.equal(owner.render().props.children.props.children, 'new')
  owner.props.item.id = 'a'
  parked.resume()
  assert.equal(owner.render().props.children.props.children, 'new')
  assert.equal(parkCard({} as HTMLElement), undefined)
})

test('returning offscreen cells skip their first post render and wake with current content', () => {
  let renders = 0
  const near = { id: 'near', render: () => 'visible' }
  const far = { id: 'far', render: () => ++renders }
  const original = () => [near, far].map(item => ({ item }))
  const list = { _getFinalRenderedItems: original }
  const slot = { key: 'home|far', height: 320, top: 4400, column: 2 }
  const returning = restoreSlots(list, new Map([['far', slot]]))!
  const [first, second] = list._getFinalRenderedItems()
  assert.equal(first!.item, near)
  assert.equal(second!.item.render(), null)
  assert.equal(renders, 0)
  const cell = { isConnected: true, __reactFiber$x: { stateNode: {} } }
  cell.__reactFiber$x.stateNode = { props: { item: second!.item }, render() {}, getElement: () => cell, forceUpdate() {} }
  const claimed = returning.claim(cell as unknown as HTMLElement)!
  assert.equal(claimed.slot, slot)
  claimed.card.resume()
  assert.equal(second!.item.render(), 1)
  assert.equal(list._getFinalRenderedItems()[1]!.item, far)
  returning.stop()
  assert.equal(list._getFinalRenderedItems, original)
})
