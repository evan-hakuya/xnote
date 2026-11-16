import { onPageChange } from './page.ts'
import { fibers } from './react.ts'
import type { Settings, Store } from './settings.ts'

/**
 * Refresh keeps the timeline: xnote keeps a copy of what X loaded for a home timeline. After a
 * page load X asks for that timeline anew as usual, but gets the copy in place of the answer
 * (ADR-0003). The posts of the answer wait: when X asks for newer posts from the copy's top
 * cursor, as it does by itself, they join X's answer, so X shows them behind its own
 * "Show 28 posts" line.
 */

type Switch = 'resumeForYou' | 'resumeFollowing' | 'resumeLists'
type Entry = { entryId: string; sortIndex?: string; content?: any }
/** The copy of one timeline. `shell` is X's first answer, whose entries are replaced on reuse. */
export type Saved = {
  shell: any
  entries: Entry[]
  top?: Entry | undefined
  bottom?: Entry | undefined
  pending?: { entries: Entry[]; top?: Entry | undefined } | undefined // newer posts behind X's pill
  savedAt: number
  scroll: number
  anchor?: { id: string; offset: number } | undefined // the post at the top of the window, and where
}

export const MAX_AGE = 12 * 60 * 60 * 1000
// Every post of the copy is on the page after a refresh, and the masonry keeps them all there:
// the page gets slow with a few hundred. After a refresh only the posts around the one the user
// was at come back; the ones far above were seen, the ones far below never were.
const MAX_ENTRIES = 200
const KEEP_ABOVE = 20
const KEEP_BELOW = 60

/** Which home timeline a request of X is for: For you, Following, or a pinned list. */
export function timelineOf(op: string, variables: any): { key: string; toggle: Switch } | null {
  if (op === 'HomeLatestTimeline') return { key: 'following', toggle: 'resumeFollowing' }
  if (op !== 'HomeTimeline') return null
  return variables?.tag ? { key: `list:${variables.tag}`, toggle: 'resumeLists' } : { key: 'forYou', toggle: 'resumeForYou' }
}

/** The instructions of an answer: X nests them under the name of the timeline. */
export function instructionsOf(json: any, depth = 0): any[] | null {
  if (!json || typeof json !== 'object' || depth > 8) return null
  if (Array.isArray(json.instructions)) return json.instructions
  for (const value of Object.values(json)) {
    const found = instructionsOf(value, depth + 1)
    if (found) return found
  }
  return null
}

function parts(json: any) {
  const entries: Entry[] = []
  let top: Entry | undefined
  let bottom: Entry | undefined
  for (const instruction of instructionsOf(json) ?? []) {
    const list: Entry[] = instruction.entries ?? (instruction.entry ? [instruction.entry] : [])
    for (const entry of list) {
      const type = entry?.content?.cursorType
      if (type === 'Top') top = entry
      else if (type === 'Bottom') bottom = entry
      else if (instruction.type === 'TimelineAddEntries' && typeof entry?.entryId === 'string') entries.push(entry)
    }
  }
  return { entries, top, bottom }
}

const cursorOf = (entry?: Entry) => entry?.content?.value as string | undefined

/** How many posts a copy holds: a conversation counts each of its posts. */
export function postsIn(saved: Saved) {
  return saved.entries.reduce((sum, entry) => {
    if (entry.entryId.startsWith('tweet-')) return sum + 1
    if (entry.entryId.startsWith('home-conversation-')) return sum + (entry.content?.items?.length ?? 0)
    return sum
  }, 0)
}
const without = (entries: Entry[], known: Entry[]) => {
  const ids = new Set(known.map((entry) => entry.entryId))
  return entries.filter((entry) => !ids.has(entry.entryId))
}

export function fromFirst(json: any, now: number): Saved {
  return { shell: json, ...parts(json), savedAt: now, scroll: 0 }
}

/** Adds an answer of X to the copy, by the cursor X asked with. Returns whether the copy changed. */
export function addAnswer(saved: Saved, cursor: string | undefined, json: any, now: number) {
  const { entries, top, bottom } = parts(json)
  if (cursor && cursor === cursorOf(saved.bottom)) {
    if (saved.entries.length < MAX_ENTRIES) saved.entries.push(...without(entries, saved.entries))
    saved.bottom = bottom ?? saved.bottom
  } else if (cursor && cursor === cursorOf(saved.top)) {
    // Every post of the answer, also one the copy has: X moves such a post to the top.
    saved.pending = { entries, top }
  } else if (cursor && saved.pending && cursor === cursorOf(saved.pending.top)) {
    // X asks again from its last answer, as when the user comes back to the top: its pill then
    // counts the posts of both answers, and one click shows them all.
    saved.pending = { entries: [...entries, ...without(saved.pending.entries, entries)], top: top ?? saved.pending.top }
  } else return false
  saved.savedAt = now
  return true
}

/** The user opened X's pill: the newer posts are on the page now. */
export function commit(saved: Saved, now: number) {
  if (!saved.pending) return false
  saved.entries = [...saved.pending.entries, ...without(saved.entries, saved.pending.entries)]
  saved.top = saved.pending.top ?? saved.top
  saved.pending = undefined
  saved.savedAt = now
  return true
}

/** Keeps the posts around `id`, the post the user is at. Without it, the first posts. */
export function trimAround(saved: Saved, id: string | undefined) {
  const at = saved.entries.findIndex((entry) => entry.entryId === `tweet-${id}` || JSON.stringify(entry.content ?? '').includes(`"${id}"`))
  const start = Math.max(0, at - KEEP_ABOVE)
  saved.entries = saved.entries.slice(start, Math.max(0, at) + KEEP_BELOW + 1)
}

/** The ids of the posts in an entry: a conversation has several. */
export const postIdsOf = (entry: Entry) =>
  [entry.entryId, ...(entry.content?.items ?? []).map((item: any) => item?.entryId)].flatMap((name) =>
    [...String(name).matchAll(/tweet-(\d+)/g)].map((match) => match[1]!),
  )

/** The copy as it is written: the posts after the last one the user saw are left out. */
export function seenOnly(saved: Saved, seen: Set<string>): Saved {
  let last = saved.entries.length - 1
  while (last >= 0 && !postIdsOf(saved.entries[last]!).some((id) => seen.has(id))) last--
  return last < 0 ? saved : { ...saved, entries: saved.entries.slice(0, last + 1) }
}

/** X's first answer again, with every post of the copy and the newest cursors. */
export function answerFrom(saved: Saved) {
  const json = structuredClone(saved.shell)
  const instructions = instructionsOf(json)
  if (!instructions) return null
  const entries = [saved.top, ...saved.entries, saved.bottom].filter(Boolean)
  const kept = instructions.filter((instruction) => !['TimelineAddEntries', 'TimelineShowAlert'].includes(instruction.type))
  instructions.splice(0, instructions.length, { type: 'TimelineAddEntries', entries }, ...kept)
  return JSON.stringify(json)
}

/** X's answer with newer posts, with `extra` posts added in front of its own. */
export function withNewer(json: any, extra: Entry[]) {
  const instructions = instructionsOf(json)
  if (!instructions) return json
  let add = instructions.find((instruction) => instruction.type === 'TimelineAddEntries')
  if (!add) instructions.push((add = { type: 'TimelineAddEntries', entries: [] }))
  add.entries.unshift(...without(extra, add.entries))
  return json
}

/** The posts of X's first answer that the copy does not have yet. */
export function newIn(saved: Saved, json: any) {
  return without(parts(json).entries, saved.entries)
}

// IndexedDB, because a copy of a timeline is far larger than localStorage allows.
const DB = 'xnote'
const STORE = 'timelines'
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function installResume(store: Store) {
  const account = /twid=u%3D(\d+)/.exec(document.cookie)?.[1] ?? ''
  const copies = new Map<string, Saved>()
  const db = database()
  // Only this account's copies that have not expired are loaded.
  void db
    .then(
      (base) =>
        new Promise<void>((resolve) => {
          const request = base.transaction(STORE).objectStore(STORE).openCursor()
          request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return resolve()
            const [owner, key] = String(cursor.key).split('|')
            if (owner === account && Date.now() - (cursor.value as Saved).savedAt < MAX_AGE) copies.set(key!, cursor.value)
            cursor.continue()
          }
          request.onerror = () => resolve()
        }),
    )
    .catch(() => undefined)

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // The posts the user saw: at least half of one, or 40% of the window for a tall one, once the
  // page stopped moving. The copy keeps all posts in memory, so posts that load below and are
  // seen later still count; only what is written leaves the unseen ones out.
  const seen = new Set<string>()
  const save = (key: string) => {
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      const saved = copies.get(key)
      void db.then((base) => {
        const objects = base.transaction(STORE, 'readwrite').objectStore(STORE)
        if (saved) objects.put(seenOnly(saved, seen), `${account}|${key}`)
      }).catch(() => undefined)
    }, 500))
  }
  const keysOf = (toggle: Switch) => [...copies.keys()].filter((key) => timelineToggle(key) === toggle)
  const on = (toggle: Switch) => store.get().enabled && store.get()[toggle as keyof Settings] === true

  // The timeline on screen, from the last request X made for one; unknown right after a tab switch.
  let active: string | null = null
  let restore: { top: number; anchor?: Saved['anchor']; until: number } | undefined
  let placed = false // X has shown a copy since the page loaded
  // The link of a post, by its id: the time of a post links to the post.
  // Hidden posts measure as 0 × 0 at the top, and posts that the masonry has not placed yet (it
  // keeps them unseen) sit at the top of the grid while X rebuilds the feed: never use those.
  // A far-off card of the masonry skips drawing its content but keeps its place: it counts.
  const shown = (element: Element) =>
    element.getBoundingClientRect().height > 0 &&
    (element.closest('.xnote-far') !== null || element.checkVisibility({ visibilityProperty: true }))
  const postLink = (id: string) => [...document.querySelectorAll(`main article a[href$="/status/${id}"]:has(time)`)].find(shown)
  // Back to the post that was at the top of the window. The page grows and shrinks for a long
  // time while images load and X builds the feed again, so keep the post there until the user
  // moves the page; a minute at most.
  const keepPlace = () => {
    if (!restore) return
    if (location.pathname !== '/home' || Date.now() > restore.until) return void (restore = undefined)
    const link = restore.anchor && postLink(restore.anchor.id)
    const top = link ? scrollY + link.getBoundingClientRect().top - restore.anchor!.offset : restore.top
    if (document.documentElement.scrollHeight - innerHeight >= top && Math.abs(scrollY - top) > 2) scrollTo(0, top)
    requestAnimationFrame(keepPlace)
  }

  // X asks for newer posts by itself only when the user comes back to the top, or on a timer that
  // waits until its first answer is old. After the copy is on the page, run X's own poll once, so
  // that its "Show 28 posts" line appears right away (ADR-0001: X makes the request).
  let askNewer = false
  onPageChange(() => {
    if (!askNewer || location.pathname !== '/home') return
    const cell = document.querySelector('[data-testid="primaryColumn"] section [data-testid="cellInnerDiv"]')
    if (!cell?.parentElement) return
    const timeline = fibers(cell.parentElement).map((fiber) => fiber.stateNode).find((node) => typeof node?._foregroundPollAction === 'function')
    askNewer = false
    if (timeline) setTimeout(() => timeline._foregroundPollAction(), 1000)
  })
  for (const type of ['wheel', 'keydown', 'pointerdown', 'touchstart']) addEventListener(type, () => void (restore = undefined), { passive: true })

  // The posts of X's first answer after a page load, by timeline, until X asks for newer posts.
  const waiting = new Map<string, Entry[]>()
  const fresh = (key: string) => {
    const saved = copies.get(key)
    return saved && Date.now() - saved.savedAt < MAX_AGE ? saved : undefined
  }

  type Request = XMLHttpRequest & { xnoteUrl?: string; xnoteKept?: boolean }
  const proto = XMLHttpRequest.prototype
  const open = proto.open
  const send = proto.send
  proto.open = function (this: Request, ...args: any[]) {
    this.xnoteUrl = String(args[1])
    return (open as any).apply(this, args)
  }
  proto.send = function (this: Request, body?: any) {
    const url = this.xnoteUrl ?? ''
    const op = /\/graphql\/[^/]+\/(\w+)/.exec(url)?.[1]
    let variables: any
    try {
      variables = typeof body === 'string' && body ? JSON.parse(body).variables : JSON.parse(new URL(url, location.href).searchParams.get('variables') ?? 'null')
    } catch {
      variables = null
    }
    const timeline = op ? timelineOf(op, variables) : null
    if (!timeline || !on(timeline.toggle)) return send.call(this, body)
    const { key } = timeline
    active = key
    const first = variables?.requestContext === 'launch'
    const cursor = typeof variables?.cursor === 'string' ? variables.cursor : undefined

    if (first && fresh(key)) {
      // X gets the copy; the posts of its own answer wait for its next request for newer posts.
      rewrite(this, (json) => {
        const saved = fresh(key)
        if (!saved) return null
        this.xnoteKept = true
        waiting.set(key, newIn(saved, json))
        saved.pending = undefined
        // X asks again each time the user comes back to Home from another page; its poll for newer
        // posts is needed once only.
        if (!placed) askNewer = placed = true
        if (saved.scroll > 0) {
          trimAround(saved, saved.anchor?.id)
          restore = { top: saved.scroll, anchor: saved.anchor, until: Date.now() + 60000 }
          requestAnimationFrame(keepPlace)
        }
        // The written copy held only posts the user saw.
        for (const entry of saved.entries) for (const id of postIdsOf(entry)) seen.add(id)
        return answerFrom(saved)
      })
    } else if (cursor && waiting.get(key)?.length && cursor === cursorOf(copies.get(key)?.top)) {
      rewrite(this, (json) => {
        const extra = waiting.get(key) ?? []
        waiting.delete(key)
        return JSON.stringify(withNewer(json, extra))
      })
    }

    this.addEventListener('load', () => {
      if (this.xnoteKept || this.status !== 200) return
      let json: any
      try {
        json = JSON.parse(this.responseText)
      } catch {
        return
      }
      const saved = copies.get(key)
      if (first) copies.set(key, fromFirst(json, Date.now()))
      else if (!saved || !addAnswer(saved, cursor, json, Date.now())) return
      save(key)
    })
    return send.call(this, body)
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    // A tab without a new request shows a timeline that X kept in memory: which one is unknown.
    if (target?.closest('[data-testid="primaryColumn"] [role="tab"]')) active = null
    // X's pill and its "Show 28 posts" line put the newer posts on the page.
    const pill = target?.closest('[data-testid="pillLabel"], [data-testid="cellInnerDiv"]:not(:has(article)) [role="button"]')
    if (!pill || !/\d/.test(pill.textContent ?? '') || !active) return
    const saved = copies.get(active)
    if (saved && commit(saved, Date.now())) save(active)
  }, true)

  // Where the user is, once the page has stopped moving.
  let still: ReturnType<typeof setTimeout> | undefined
  const place = () => {
    if (restore || !active || location.pathname !== '/home') return
    const saved = copies.get(active)
    if (saved) {
      saved.scroll = scrollY
      // The highest post that starts inside the window.
      let best: { id: string; offset: number } | undefined
      for (const link of document.querySelectorAll('main article a[href*="/status/"]:has(time)')) {
        if (link.closest('article article, div[role="link"]') || !shown(link)) continue // a quoted or hidden post
        const offset = link.getBoundingClientRect().top
        const id = link.getAttribute('href')?.split('/').pop()
        const box = link.closest('article')?.getBoundingClientRect()
        if (id && box && Math.min(box.bottom, innerHeight) - Math.max(box.top, 0) >= Math.min(box.height / 2, innerHeight * 0.4)) seen.add(id)
        if (id && offset >= 0 && offset < innerHeight && (!best || offset < best.offset)) best = { id, offset }
      }
      saved.anchor = best
      if (best && saved.entries.length > MAX_ENTRIES / 2) trimAround(saved, best.id)
      save(active)
    }
  }
  addEventListener('scroll', () => {
    clearTimeout(still)
    still = setTimeout(place, 300)
  }, { passive: true })

  return {
    /** The posts kept for one switch; the pinned lists together. */
    count: (toggle: Switch) => keysOf(toggle).reduce((sum, key) => sum + postsIn(copies.get(key)!), 0),
    clear(toggle: Switch) {
      for (const key of keysOf(toggle)) {
        clearTimeout(timers.get(key))
        copies.delete(key)
        void db.then((base) => base.transaction(STORE, 'readwrite').objectStore(STORE).delete(`${account}|${key}`)).catch(() => undefined)
      }
    },
  }
}

export type ResumeSwitch = Switch
const timelineToggle = (key: string): Switch =>
  key === 'forYou' ? 'resumeForYou' : key === 'following' ? 'resumeFollowing' : 'resumeLists'

/**
 * Changes what X reads of a request's answer, once the answer is complete. `change` gets the
 * answer and returns the text X reads instead, or null to leave the answer as it is.
 */
function rewrite(xhr: XMLHttpRequest, change: (json: any) => string | null) {
  // The browser's own getters: the last ones on the prototype chain. Other extensions put their
  // own getters in front, and those read the instance again, which would come back here.
  const native = (name: string) => {
    let found: (() => any) | undefined
    for (let proto = Object.getPrototypeOf(xhr); proto; proto = Object.getPrototypeOf(proto)) {
      found = Object.getOwnPropertyDescriptor(proto, name)?.get ?? found
    }
    return found
  }
  const [text, response, state, status] = ['responseText', 'response', 'readyState', 'status'].map(native)
  if (!text || !response || !state || !status) return // leave X's answer as it is
  let result: string | null | undefined
  const changed = () => {
    if (result !== undefined) return result
    if (state.call(xhr) !== 4 || status.call(xhr) !== 200) return null
    try {
      result = change(JSON.parse(text.call(xhr)))
    } catch {
      result = null
    }
    return result
  }
  Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => changed() ?? text.call(xhr) })
  Object.defineProperty(xhr, 'response', {
    configurable: true,
    get: () => {
      const value = changed()
      if (value === null) return response.call(xhr)
      return xhr.responseType === 'json' ? JSON.parse(value) : value
    },
  })
}
