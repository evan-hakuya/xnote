import type { Settings, Store } from './settings.ts'

/**
 * Refresh keeps the timeline: xnote keeps a copy of what X loaded for a home timeline and, when
 * X asks for that timeline anew after a page load, answers from the copy (ADR-0003). X then asks
 * for newer posts from the copy's top cursor by itself, and shows them behind its own
 * "Show 28 posts" pill.
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
const MAX_ENTRIES = 500

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
    saved.pending = { entries: without(entries, saved.entries), top }
  } else return false
  saved.savedAt = now
  return true
}

/** The user opened X's pill: the newer posts are on the page now. */
export function commit(saved: Saved, now: number) {
  if (!saved.pending) return false
  saved.entries.unshift(...saved.pending.entries)
  saved.top = saved.pending.top ?? saved.top
  saved.pending = undefined
  saved.savedAt = now
  return true
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
  const loaded = db
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
  const save = (key: string) => {
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      const saved = copies.get(key)
      void db.then((base) => {
        const objects = base.transaction(STORE, 'readwrite').objectStore(STORE)
        if (saved) objects.put(saved, `${account}|${key}`)
      }).catch(() => undefined)
    }, 500))
  }
  const keysOf = (toggle: Switch) => [...copies.keys()].filter((key) => timelineToggle(key) === toggle)
  const on = (toggle: Switch) => store.get().enabled && store.get()[toggle as keyof Settings] === true

  // The timeline on screen, from the last request X made for one; unknown right after a tab switch.
  let active: string | null = null
  let restore: { top: number; anchor?: Saved['anchor']; until: number } | undefined
  // The link of a post, by its id: the time of a post links to the post.
  const postLink = (id: string) => document.querySelector(`main article a[href$="/status/${id}"]:has(time)`)
  // Back to the post that was at the top of the window. The page grows and shrinks while X and the
  // masonry lay the posts out, so keep it there for a few seconds, until the user moves the page.
  const keepPlace = () => {
    if (!restore) return
    if (location.pathname !== '/home' || Date.now() > restore.until) return void (restore = undefined)
    const link = restore.anchor && postLink(restore.anchor.id)
    const top = link ? scrollY + link.getBoundingClientRect().top - restore.anchor!.offset : restore.top
    if (document.documentElement.scrollHeight - innerHeight >= top && Math.abs(scrollY - top) > 2) scrollTo(0, top)
    requestAnimationFrame(keepPlace)
  }
  for (const type of ['wheel', 'keydown', 'pointerdown', 'touchstart']) addEventListener(type, () => void (restore = undefined), { passive: true })

  type Request = XMLHttpRequest & { xnoteUrl?: string; xnoteServed?: boolean }
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

    this.addEventListener('load', () => {
      if (this.xnoteServed || this.status !== 200) return
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

    if (!first) return send.call(this, body)
    void loaded.then(() => {
      const saved = copies.get(key)
      const text = saved && Date.now() - saved.savedAt < MAX_AGE ? answerFrom(saved) : null
      if (!saved || !text) return send.call(this, body)
      saved.pending = undefined // X asks for the newer posts again and shows them behind its pill
      serve(this, text, url)
      if (saved.scroll > 0) {
        restore = { top: saved.scroll, anchor: saved.anchor, until: Date.now() + 10000 }
        requestAnimationFrame(keepPlace)
      }
    })
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
        if (link.closest('article article, div[role="link"]')) continue // a quoted post
        const offset = link.getBoundingClientRect().top
        const id = link.getAttribute('href')?.split('/').pop()
        if (id && offset >= 0 && offset < innerHeight && (!best || offset < best.offset)) best = { id, offset }
      }
      saved.anchor = best
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

/** Completes a request of X without the network, as if the server had sent `text`. */
function serve(xhr: XMLHttpRequest & { xnoteServed?: boolean }, text: string, url: string) {
  const fixed = (name: string, value: unknown) => Object.defineProperty(xhr, name, { configurable: true, get: () => value })
  xhr.xnoteServed = true
  fixed('readyState', 4)
  fixed('status', 200)
  fixed('statusText', 'OK')
  fixed('responseURL', new URL(url, location.href).href)
  fixed('responseText', text)
  fixed('response', xhr.responseType === 'json' ? JSON.parse(text) : text)
  xhr.getResponseHeader = (name) => (name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null)
  xhr.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n'
  setTimeout(() => {
    for (const type of ['readystatechange', 'load', 'loadend']) xhr.dispatchEvent(new ProgressEvent(type))
  })
}
