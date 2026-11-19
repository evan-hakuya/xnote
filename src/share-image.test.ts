import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileName, largePhoto } from './share-image.ts'

test('names the image after the post', () => {
  assert.equal(fileName('/tw93/status/123'), 'tw93-123.png')
})

test('asks for the large photo unless a size is set', () => {
  assert.equal(largePhoto('https://pbs.twimg.com/media/a.jpg'), 'https://pbs.twimg.com/media/a.jpg?name=large')
  assert.equal(largePhoto('https://pbs.twimg.com/media/a?format=jpg&name=small'), 'https://pbs.twimg.com/media/a?format=jpg&name=small')
})
