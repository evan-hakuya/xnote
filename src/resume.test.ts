import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addAnswer, answerFrom, commit, fromFirst, timelineOf } from './resume.ts'

const cursor = (type: 'Top' | 'Bottom', value: string) => ({
  entryId: `cursor-${type.toLowerCase()}-${value}`,
  content: { cursorType: type, value },
})
const post = (id: string) => ({ entryId: `tweet-${id}`, sortIndex: id })
const answer = (...entries: object[]) => ({
  data: { home: { home_timeline_urt: { instructions: [{ type: 'TimelineAddEntries', entries }] } } },
})
const ids = (text: string | null) =>
  JSON.parse(text!).data.home.home_timeline_urt.instructions[0].entries.map((entry: any) => entry.entryId)

test('names the home timeline of a request', () => {
  assert.deepEqual(timelineOf('HomeTimeline', { requestContext: 'launch' }), { key: 'forYou', toggle: 'resumeForYou' })
  assert.deepEqual(timelineOf('HomeTimeline', { tag: '19' }), { key: 'list:19', toggle: 'resumeLists' })
  assert.deepEqual(timelineOf('HomeLatestTimeline', {}), { key: 'following', toggle: 'resumeFollowing' })
  assert.equal(timelineOf('UserTweets', {}), null)
})

test('keeps the posts that X loaded and answers with them, newest cursors first and last', () => {
  const saved = fromFirst(answer(cursor('Top', 't1'), post('9'), post('8'), cursor('Bottom', 'b1')), 0)
  // A later page, by the bottom cursor.
  assert.ok(addAnswer(saved, 'b1', answer(cursor('Top', 'x'), post('8'), post('7'), cursor('Bottom', 'b2')), 1))
  // An answer for a cursor the copy does not know is not part of it.
  assert.equal(addAnswer(saved, 'other', answer(post('1')), 2), false)
  assert.deepEqual(ids(answerFrom(saved)), ['cursor-top-t1', 'tweet-9', 'tweet-8', 'tweet-7', 'cursor-bottom-b2'])

  // Newer posts, by the top cursor, wait behind X's pill until the user opens it.
  assert.ok(addAnswer(saved, 't1', answer(cursor('Top', 't2'), post('11'), post('10')), 3))
  assert.equal(ids(answerFrom(saved))[0], 'cursor-top-t1')
  assert.ok(commit(saved, 4))
  assert.deepEqual(ids(answerFrom(saved)).slice(0, 3), ['cursor-top-t2', 'tweet-11', 'tweet-10'])
  assert.equal(commit(saved, 5), false)
})
