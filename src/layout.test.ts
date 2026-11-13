import assert from 'node:assert/strict'
import { test } from 'node:test'
import { columnsFor, placeCards } from './layout.ts'

const card = (height: number) => ({ height, full: false })

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

test('an empty item takes one row and zero columns falls back to one', () => {
  assert.deepEqual(placeCards([card(0), card(4)], 0, 4, 12), [
    { column: 1, row: 1, span: 1 },
    { column: 1, row: 2, span: 4 },
  ])
})
