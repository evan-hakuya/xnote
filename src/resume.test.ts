import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addAnswer, answerFrom, commit, fromFirst, newIn, postsIn, seenOnly, timelineOf, trimAround, withNewer } from './resume.ts'

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

test('counts the posts of a copy, each post of a conversation too', () => {
  const conversation = { entryId: 'home-conversation-1', content: { items: [{}, {}, {}] } }
  const saved = fromFirst(answer(post('1'), conversation, { entryId: 'who-to-follow-2' }), 0)
  assert.equal(postsIn(saved), 4)
})

test('keeps the posts around the one the user is at', () => {
  const posts = () => fromFirst(answer(...Array.from({ length: 200 }, (_, i) => post(String(i)))), 0)
  const saved = posts()
  trimAround(saved, '70')
  assert.equal(saved.entries[0]!.entryId, 'tweet-50')
  assert.equal(saved.entries.at(-1)!.entryId, 'tweet-130')
  const top = posts()
  trimAround(top, '5')
  assert.equal(top.entries[0]!.entryId, 'tweet-0')
  const lost = posts()
  trimAround(lost, 'gone') // the post is not in the copy: its first posts
  assert.equal(lost.entries.length, 61)
})

test('the written copy ends at the last post the user saw', () => {
  const saved = fromFirst(answer(post('1'), post('2'), { entryId: 'home-conversation-9', content: { items: [{ entryId: 'home-conversation-9-tweet-3' }] } }, post('4'), post('5')), 0)
  const written = seenOnly(saved, new Set(['1', '3']))
  assert.deepEqual(written.entries.map((entry) => entry.entryId), ['tweet-1', 'tweet-2', 'home-conversation-9'])
  assert.equal(saved.entries.length, 5) // the copy in memory keeps the posts that may be seen later
  assert.equal(seenOnly(saved, new Set()), saved) // nothing seen yet: all of it
})

test('the posts of a fresh answer join X\'s next answer with newer posts', () => {
  const saved = fromFirst(answer(cursor('Top', 't1'), post('9'), cursor('Bottom', 'b1')), 0)
  const waiting = newIn(saved, answer(cursor('Top', 'f'), post('20'), post('9'), cursor('Bottom', 'fb')))
  assert.deepEqual(waiting.map((entry) => entry.entryId), ['tweet-20'])
  const newer = withNewer(answer(cursor('Top', 't2'), post('21'), post('20')), waiting)
  assert.deepEqual(ids(JSON.stringify(newer)), ['cursor-top-t2', 'tweet-21', 'tweet-20'])
  // Without posts of its own, X's answer gets an instruction for them.
  const empty = { data: { home: { home_timeline_urt: { instructions: [{ type: 'TimelineShowAlert' }] } } } }
  const added = withNewer(empty, waiting).data.home.home_timeline_urt.instructions[1]
  assert.deepEqual(added.entries.map((entry: any) => entry.entryId), ['tweet-20'])
})
