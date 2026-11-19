import assert from 'node:assert/strict'
import { test } from 'node:test'
import { columnsFor, mergeReadingOrder, placeCards, readingOrder } from './layout.ts'

const card = (height: number) => ({ height, full: false })

test('keeps X controls in native order while retaining the reading order of cards', () => {
  const full = (id: string) => id === 'newEntriesItem' || id === '$footer'
  assert.deepEqual(
    mergeReadingOrder(['newEntriesItem', 'a', 'b', 'c', 'd', '$footer'], ['c', 'd', 'a', 'b'], full),
    ['newEntriesItem', 'c', 'd', 'a', 'b', '$footer'],
  )
  assert.deepEqual(mergeReadingOrder(['newEntriesItem', 'new', 'a', 'b', '$footer'], [], full), ['newEntriesItem', 'new', 'a', 'b', '$footer'])
})

test('pagination appends new cards rather than inserting them before reordered older cards', () => {
  assert.deepEqual(
    mergeReadingOrder(['a', 'b', 'new', 'c', 'd'], ['c', 'd', 'a', 'b'], () => false),
    ['c', 'd', 'a', 'b', 'new'],
  )
})

test('a newly rendered thread continuation stays beside its already placed parent', () => {
  assert.deepEqual(
    mergeReadingOrder(['a', 'a-child', 'b', 'c'], ['c', 'a', 'b'], () => false, (id) => id === 'a-child'),
    ['c', 'a', 'a-child', 'b'],
  )
})

test('spatial reflow does not move a full-width control into the cards', () => {
  const order = readingOrder([
    { top: 8900, bottom: 8950, left: 0, full: true },
    { top: 0, bottom: 200, left: 0 },
    { top: 300, bottom: 500, left: 400 },
    { top: 2000, bottom: 2050, left: 0, full: true },
  ], 54, 600)
  assert.deepEqual(order.map(({ index }) => index), [0, 1, 2, 3])
})

test('reflows the visible posts together instead of inserting offscreen timeline neighbours', () => {
  // Timeline order differs from visual order after cards have kept their columns.
  const bounds = [
    { top: -300, bottom: -100, left: 0 },
    { top: 700, bottom: 900, left: 0 },
    { top: 100, bottom: 300, left: 400 },
    { top: -100, bottom: 100, left: 0 },
    { top: 300, bottom: 500, left: 400 },
  ]
  const order = readingOrder(bounds, 54, 600)
  assert.deepEqual(order.map(({ index }) => index), [0, 3, 2, 4, 1])
  const placed = placeCards(order.map(({ band }, i) => ({ ...card(200), start: band === 1 && i > 0 && order[i - 1]!.band !== 1 })), 2, 4, 12)
  const visible = order.flatMap(({ index, band }, i) => band === 1 ? [{ index, top: placed[i]!.row * 4 }] : [])
  const scroll = visible[0]!.top - 54
  assert.ok(visible.every(({ top }) => top - scroll >= 54 && top - scroll < 600))
  assert.ok(placed[4]!.row >= placed[3]!.row)
})

test('keeps a thread together when only its continuation is visible', () => {
  const order = readingOrder([
    { top: -400, bottom: -100, left: 0 },
    { top: -100, bottom: 200, left: 0, joined: true },
    { top: -300, bottom: -50, left: 400 },
  ], 54, 600)
  assert.deepEqual(order, [{ index: 2, band: 0 }, { index: 0, band: 1 }, { index: 1, band: 1 }])
})

test('clearing reading-band alignment at the top removes leading and middle gaps', () => {
  const items = [card(700), card(100), { ...card(200), start: true }, card(100), card(100)]
  const aligned = placeCards(items, 2, 4, 12)
  assert.ok([1, 2].some((column) => Math.min(...aligned.filter((item) => item.column === column).map((item) => item.row)) > 1))
  const placed = placeCards(items.map((item) => ({ ...item, start: false })), 2, 4, 12)
  for (const column of [1, 2]) {
    const lane = placed.filter((item) => item.column === column).sort((a, b) => a.row - b.row)
    assert.equal(lane[0]!.row, 1)
    for (let i = 1; i < lane.length; i++) assert.equal(lane[i]!.row, lane[i - 1]!.row + lane[i - 1]!.span)
  }
})

test('after clearing reading-band alignment a height change leaves the other column in place', () => {
  const items = [
    { ...card(700), column: 1 }, { ...card(100), column: 2 },
    { ...card(200), column: 1 }, { ...card(100), column: 2 },
  ]
  const before = placeCards(items, 2, 4, 12)
  const after = placeCards(items.map((item, i) => i === 0 ? { ...item, height: 704 } : item), 2, 4, 12)
  for (const index of [1, 3]) assert.deepEqual(after[index], before[index])
})

test('reading-band alignment preserves thread order and full-width separators', () => {
  const items = [card(300), { ...card(100), joined: true }, { height: 20, full: true }, card(100), card(300), { ...card(200), start: true }]
  const placed = placeCards(items, 2, 4, 12)
  assert.equal(placed[0]!.column, placed[1]!.column)
  assert.equal(placed[0]!.row + placed[0]!.span, placed[1]!.row)
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!, b = placed[j]!
      if (!a.column || !b.column || a.column === b.column) {
        assert.ok(a.row + a.span <= b.row || b.row + b.span <= a.row)
      }
    }
  }
})

test('fits as many columns as the minimum card width allows', () => {
  assert.equal(columnsFor(1130, 280, 12), 3)
  assert.equal(columnsFor(1130, 400, 12), 2)
  assert.equal(columnsFor(572, 280, 12), 2)
  assert.equal(columnsFor(200, 280, 12), 1)
})

test('puts each card in the shortest column', () => {
  // unit 10, gap 10: spans are 3, 2, 2, 2
  assert.deepEqual(placeCards([card(20), card(10), card(10), card(10)], 2, 10, 10), [
    { column: 1, row: 1, span: 3 },
    { column: 2, row: 1, span: 2 },
    { column: 2, row: 3, span: 2 },
    { column: 1, row: 4, span: 2 },
  ])
})

test('a full-width item starts below every column and resets them', () => {
  assert.deepEqual(placeCards([card(30), card(10), { height: 10, full: true }, card(10)], 2, 10, 0), [
    { column: 1, row: 1, span: 3 },
    { column: 2, row: 1, span: 1 },
    { column: 0, row: 4, span: 1 },
    { column: 1, row: 5, span: 1 },
  ])
})

test('a card keeps the column it had, unless that column is gone', () => {
  const kept = { height: 10, full: false, column: 2 }
  assert.deepEqual(placeCards([card(10), kept, card(10)], 2, 10, 0), [
    { column: 1, row: 1, span: 1 },
    { column: 2, row: 1, span: 1 },
    { column: 1, row: 2, span: 1 },
  ])
  // Column 2 is taller now, and the kept card still goes there.
  assert.deepEqual(placeCards([{ height: 50, full: false, column: 2 }, kept], 2, 10, 0)[1], { column: 2, row: 6, span: 1 })
  assert.equal(placeCards([{ height: 10, full: false, column: 3 }], 2, 10, 0)[0]!.column, 1)
})

test('an empty item takes one row and zero columns falls back to one', () => {
  assert.deepEqual(placeCards([card(0), card(4)], 0, 4, 12), [
    { column: 1, row: 1, span: 1 },
    { column: 1, row: 2, span: 4 },
  ])
})

test('the next post of a thread goes below the post before it, with no gap', () => {
  const joined = { height: 10, full: false, joined: true, column: 1 }
  // unit 10, gap 10. Column 2 is the shortest and the joined card has a pin for column 1.
  assert.deepEqual(placeCards([card(30), card(10), joined, card(10)], 2, 10, 10), [
    { column: 1, row: 1, span: 4 },
    { column: 2, row: 1, span: 1 },
    { column: 2, row: 2, span: 2 },
    { column: 2, row: 4, span: 2 },
  ])
  // Nothing to join after a full-width item.
  assert.equal(placeCards([{ height: 10, full: true }, { ...joined, column: undefined }], 2, 10, 0)[1]!.column, 1)
})
