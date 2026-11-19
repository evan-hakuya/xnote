import { domToBlob } from 'modern-screenshot'
import { t, type MessageKey } from './i18n.ts'
import { entityMedia } from './media-preview.ts'
import { addStyle, onPageChange } from './page.ts'
import { fibers } from './react.ts'
import type { Store } from './settings.ts'

// "Share as image": a post's ··· menu opens a window with a copy of the post on the left and its
// options on the right. The copy is X's own DOM; modern-screenshot turns it into a PNG.

const WIDTH = 600 // X's single column: the image is this wide, at twice the resolution
const PICTURE =
  'M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z'
const PLAY = 'M21 12L4 2v20l17-10z'
const CLOSE = 'M10.59 12 4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z'
const ACTIONS = '[role="group"]:has([data-testid="like"], [data-testid="unlike"])'
const MEDIA = '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]'
const QUOTE = 'div[role="link"]'

type Toggle = 'shareReply' | 'shareRetweet' | 'shareLike' | 'shareViews' | 'shareBookmark' | 'shareShare'
// The same selectors as the hide switches in tweaks.ts.
const BUTTONS: [Toggle, string][] = [
  ['shareReply', '> div:has(> [data-testid="reply"])'],
  ['shareRetweet', '> div:has(> :is([data-testid="retweet"], [data-testid="unretweet"]))'],
  ['shareLike', '> div:has(> :is([data-testid="like"], [data-testid="unlike"]))'],
  ['shareViews', '> div:has(> a[href$="/analytics"])'],
  ['shareBookmark', '> div:has(> :is([data-testid="bookmark"], [data-testid="removeBookmark"]))'],
  ['shareShare', '> div:last-child:not(:has([data-testid]))'],
]

const CSS = `
html:has(> body > dialog.xnote-share[open]) { overflow: hidden !important; }
.xnote-share { box-sizing: border-box; width: min(1280px, 92vw); height: 88vh; max-width: none; max-height: none; padding: 0; border: 0;
  border-radius: 16px; overflow: hidden; background: var(--xnote-share-bg); color: var(--xnote-share-fg); }
.xnote-share::backdrop { background: rgb(0 0 0 / 0.55); }
.xnote-share[open] { display: grid; grid-template-columns: minmax(0, 1fr) 350px; }
.xnote-share-left { display: flex; overflow: auto; padding: 24px; background: color-mix(in srgb, currentColor 5%, transparent); }
.xnote-share-stage { flex: none; margin: auto; }
.xnote-share-scaler { transform-origin: 0 0; }
.xnote-share-shot { box-sizing: border-box; width: ${WIDTH + 48}px; padding: 24px; background: var(--xnote-share-bg); color: var(--xnote-share-fg); pointer-events: none; }
.xnote-share-card { overflow: hidden; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 16px; background: var(--xnote-share-bg); }
.xnote-share-shot [data-testid="caret"], .xnote-share-shot button:has(path[d^="M12.745 20.54l10.97-8.19"]) { visibility: hidden; }
${BUTTONS.map(([key, part]) => `.xnote-share-shot.no-${key} ${ACTIONS} ${part}`).join(',\n')} { display: none !important; }
.xnote-share-grid { display: grid; gap: 2px; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 16px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); margin-top: 12px; }
.xnote-share-grid[data-n="2"] { grid-template-columns: 1fr 1fr; }
.xnote-share-grid[data-n="3"] { grid-template: 1fr 1fr / 1fr 1fr; }
.xnote-share-grid[data-n="3"] > :first-child { grid-row: span 2; }
.xnote-share-grid[data-n="4"] { grid-template: 1fr 1fr / 1fr 1fr; }
.xnote-share-grid[data-n="many"] { grid-template-columns: repeat(3, 1fr); aspect-ratio: auto; }
.xnote-share-grid[data-n="many"] > * { aspect-ratio: 1; }
.xnote-share-all { display: flex; gap: 2px; margin-top: 12px; overflow: hidden; border-radius: 16px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); }
.xnote-share-all.column { flex-direction: column; }
.xnote-share-all.column > * { flex: none !important; }
.xnote-share-tile { position: relative; min-width: 0; min-height: 0; }
.xnote-share-grid img, .xnote-share-all img, .xnote-share-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.xnote-share-cover { position: absolute; inset: 0; z-index: 1; background: #000; }
.xnote-share-play { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; transform: translate(-50%, -50%); display: grid; place-items: center;
  border: 4px solid #fff; border-radius: 50%; background: rgb(29 155 240); box-sizing: border-box; }
.xnote-share-play svg { width: 26px; height: 26px; fill: #fff; margin-left: 3px; }
.xnote-share-badge { position: absolute; left: 12px; bottom: 12px; padding: 0 4px; border-radius: 4px; background: rgb(0 0 0 / 0.77); color: #fff; font: 700 13px/20px TwitterChirp, sans-serif; }
.xnote-share-side { display: flex; flex-direction: column; gap: 16px; overflow: auto; padding: 16px 20px; font: 15px/20px TwitterChirp, -apple-system, sans-serif; }
.xnote-share-side header { display: flex; align-items: center; justify-content: space-between; font-size: 20px; font-weight: 800; line-height: 24px; }
.xnote-share-side h3 { margin: 0 0 4px; font-size: 15px; font-weight: 700; }
.xnote-share-side label { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; cursor: pointer; }
.xnote-share-side label:has(:disabled) { opacity: 0.5; cursor: default; }
.xnote-share-side input { accent-color: var(--xnote-share-accent); }
.xnote-share-side input[type="range"] { flex: 1; }
.xnote-share-side input[type="number"] { width: 64px; font: inherit; color: inherit; background: transparent; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 4px; padding: 2px 4px; }
.xnote-share-side small { opacity: 0.7; }
.xnote-share-side footer { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
.xnote-share-side button { font: 700 15px/20px TwitterChirp, sans-serif; border-radius: 9999px; padding: 10px 16px; cursor: pointer; }
.xnote-share-side footer button { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; }
.xnote-share-side footer button:first-child { border-color: transparent; background: var(--xnote-share-accent); color: #fff; }
.xnote-share-side header button { width: 36px; height: 36px; padding: 0; border: 0; display: grid; place-items: center; background: transparent; color: inherit; }
.xnote-share-side header button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.xnote-share-side header svg { width: 20px; height: 20px; fill: currentColor; }
.xnote-share-side output { min-height: 20px; opacity: 0.8; }
`

/** `/user/status/123` → `user-123.png` */
export function fileName(permalink: string) {
  const [, user, , id] = permalink.split('/')
  return `${user}-${id}.png`
}

/** The largest size X serves of a photo. */
export function largePhoto(url: string) {
  return url.includes('?') ? url : `${url}?name=large`
}

type Entity = Parameters<typeof entityMedia>[0] & {
  video_info?: { duration_millis?: number }
  original_info?: { width?: number; height?: number }
}
const tweetOf = (article: Element) => fibers(article).map((fiber) => fiber.memoizedProps?.tweet).find((tweet) => typeof tweet?.permalink === 'string')

// The part of the post that holds its own media: below it, beside it, its row of buttons.
// A quoted post can share that part, so stop below it.
function mediaBlock(article: Element) {
  const first = [...article.querySelectorAll(MEDIA)].find((media) => !media.closest(QUOTE))
  let block: HTMLElement | null = null
  for (let node = first ?? null; node && node !== article; node = node.parentElement) {
    if (node.querySelector(QUOTE)) return block
    block = node as HTMLElement
    const parent = node.parentElement
    if (parent && [...parent.children].some((child) => child !== node && child.querySelector(ACTIONS))) return block
  }
  return null
}

const svg = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
function image(src: string) {
  const img = document.createElement('img')
  img.crossOrigin = 'anonymous' // read again from the CDN for the export, which needs it readable
  img.src = src
  return img
}
// X's video cover: the picture, a play button, and the length or "GIF" at the bottom left.
function cover(src: string, badge: string, className: string) {
  const box = document.createElement('div')
  box.className = className
  box.append(image(src))
  if (badge !== 'GIF') box.insertAdjacentHTML('beforeend', `<div class="xnote-share-play">${svg(PLAY)}</div>`)
  if (badge) box.insertAdjacentHTML('beforeend', `<div class="xnote-share-badge">${badge}</div>`)
  return box
}
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const badgeOf = (entity: Entity) =>
  entity.type === 'animated_gif' ? 'GIF' : entity.video_info?.duration_millis ? clock(entity.video_info.duration_millis) : ''

/** The frames of one video, read from X's CDN. */
function frames(url: string) {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  video.src = url
  const ready = new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error('video')), { once: true })
  })
  let queue = Promise.resolve('')
  return {
    ready,
    duration: () => video.duration,
    at(seconds: number) {
      queue = queue.catch(() => '').then(async () => {
        await ready
        const target = Math.max(0, Math.min(seconds, video.duration - 0.05))
        if (Math.abs(video.currentTime - target) > 0.01) {
          const seeked = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }))
          video.currentTime = target
          await seeked
        }
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        return canvas.toDataURL('image/jpeg', 0.92)
      })
      return queue
    },
    dispose() {
      video.removeAttribute('src')
      video.load()
    },
  }
}

function open(store: Store, source: HTMLElement) {
  // In the masonry a thread is one card of several cells; share the posts of that card.
  const thread: HTMLElement[] = []
  const joined = (node: Element | null) => node?.classList.contains('xnote-joined') || node?.classList.contains('xnote-reply-hidden')
  let cell: Element | null = source.closest('.xnote-grid > *')
  while (cell && joined(cell) && cell.previousElementSibling) cell = cell.previousElementSibling
  for (let first = true; cell && (first || joined(cell)); cell = cell.nextElementSibling, first = false) {
    const post = cell.querySelector('article')
    if (post) thread.push(post)
  }
  if (!thread.includes(source)) thread.splice(0, thread.length, source)

  const tweet = tweetOf(source)
  const entities: Entity[] = Array.isArray(tweet?.extended_entities?.media) ? tweet.extended_entities.media : []
  const several = entities.length > 1
  const videoEntity = entities.length === 1 && entities[0]!.type !== 'photo' ? entities[0]! : null
  const videoUrl = videoEntity ? entityMedia(videoEntity)?.url : undefined
  const film = videoEntity?.type === 'video' && videoUrl ? frames(videoUrl) : null
  let seconds = 0
  let still = videoEntity?.media_url_https ? largePhoto(videoEntity.media_url_https) : ''

  const body = getComputedStyle(document.body)
  const accent = document.querySelector('[data-testid="SideNav_NewTweet_Button"]')
  const dialog = document.createElement('dialog')
  dialog.className = 'xnote-share'
  dialog.setAttribute('aria-label', t('shareAsImage'))
  dialog.style.setProperty('--xnote-share-bg', body.backgroundColor)
  dialog.style.setProperty('--xnote-share-fg', body.color)
  dialog.style.setProperty('--xnote-share-accent', accent ? getComputedStyle(accent).backgroundColor : 'rgb(29 155 240)')

  const left = document.createElement('div')
  left.className = 'xnote-share-left'
  const stage = document.createElement('div')
  stage.className = 'xnote-share-stage'
  const scaler = document.createElement('div')
  scaler.className = 'xnote-share-scaler'
  const shot = document.createElement('div')
  const card = document.createElement('div')
  card.className = 'xnote-share-card'
  shot.append(card)
  scaler.append(shot)
  stage.append(scaler)
  left.append(stage)

  // The preview shrinks to fit the window; the image keeps its full size.
  const fit = () => {
    const width = shot.offsetWidth
    const height = shot.offsetHeight
    const room = left.getBoundingClientRect()
    const scale = Math.max(0.25, Math.min(1, (room.width - 48) / width, (room.height - 48) / height))
    scaler.style.transform = `scale(${scale})`
    stage.style.width = `${width * scale}px`
    stage.style.height = `${height * scale}px`
  }
  new ResizeObserver(fit).observe(shot)

  const render = () => {
    const values = store.get()
    const grid = values.shareGrid ? values.shareGrid === 'on' : values.mediaGrid
    const hideReplies = values.shareHideReplies ? values.shareHideReplies === 'on' : values.hideThreadReplies
    shot.className = ['xnote-share-shot', ...BUTTONS.filter(([key]) => !values[key]).map(([key]) => `no-${key}`)].join(' ')
    const posts = hideReplies ? thread.slice(0, 1) : thread
    const copies = posts.map((post) => (post === source ? sourceCopy(values, grid) : (post.cloneNode(true) as HTMLElement)))
    // X's line from the first post's avatar down to its reply.
    if (posts.length < thread.length) copies[0]!.querySelector('[data-testid="Tweet-User-Avatar"] + div')?.remove()
    card.replaceChildren(...copies)
    fit()
  }
  const sourceCopy = (values: ReturnType<Store['get']>, grid: boolean) => {
    const copy = source.cloneNode(true) as HTMLElement
    const block = mediaBlock(copy)
    if (block && several && (values.shareAllImages || grid)) {
      // shortcut: with the grid off the copy keeps what X drew, a carousel or X's own grid; draw a carousel if that matters
      const all = values.shareAllImages
      const box = document.createElement('div')
      box.className = all ? `xnote-share-all${values.shareAllColumn ? ' column' : ''}` : 'xnote-share-grid'
      box.dataset.n = entities.length > 4 ? 'many' : String(entities.length)
      for (const entity of entities) {
        const src = entity.media_url_https ? largePhoto(entity.media_url_https) : ''
        const tile = entity.type === 'photo' ? Object.assign(document.createElement('div'), { className: 'xnote-share-tile' }) : cover(src, badgeOf(entity), 'xnote-share-tile')
        if (entity.type === 'photo') tile.append(image(src))
        if (all) {
          // In a row at a shared height each item grows by its width-to-height ratio; a column ignores the growth.
          const { width, height } = entity.original_info ?? {}
          const ratio = width && height ? width / height : 16 / 9
          tile.style.aspectRatio = String(ratio)
          tile.style.flex = `${ratio} 1 0`
        }
        box.append(tile)
      }
      block.replaceWith(box)
    }
    const player = [...copy.querySelectorAll<HTMLElement>('[data-testid="videoPlayer"]')].find((node) => !node.closest(QUOTE))
    if (player && videoEntity && still) {
      if (getComputedStyle(source.querySelector('[data-testid="videoPlayer"]')!).position === 'static') player.style.position = 'relative'
      player.append(cover(still, badgeOf(videoEntity), 'xnote-share-cover'))
    }
    return copy
  }

  // The options.
  const side = document.createElement('div')
  side.className = 'xnote-share-side'
  const header = document.createElement('header')
  header.textContent = t('shareAsImage')
  const close = document.createElement('button')
  close.innerHTML = svg(CLOSE)
  close.setAttribute('aria-label', t('close'))
  close.onclick = () => dialog.close()
  header.append(close)
  side.append(header)
  const section = (title: MessageKey) => {
    const box = document.createElement('section')
    box.append(Object.assign(document.createElement('h3'), { textContent: t(title) }))
    side.append(box)
    return box
  }
  const check = (parent: HTMLElement, label: MessageKey, checked: () => boolean, change: (on: boolean) => void, disabled = () => false) => {
    const row = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    const sync = () => { input.checked = checked(); input.disabled = disabled() }
    input.onchange = () => { change(input.checked); refresh(); render() }
    row.append(t(label), input)
    parent.append(row)
    syncs.push(sync)
  }
  const syncs: (() => void)[] = []
  const refresh = () => syncs.forEach((sync) => sync())

  const actions = section('shareActions')
  for (const [key] of BUTTONS) check(actions, key, () => store.get()[key], (on) => store.set(key, on))
  if (several) {
    const media = section('shareMedia')
    const values = () => store.get()
    check(media, 'shareGrid', () => (values().shareGrid ? values().shareGrid === 'on' : values().mediaGrid), (on) => store.set('shareGrid', on ? 'on' : 'off'), () => values().shareAllImages)
    check(media, 'shareAllImages', () => values().shareAllImages, (on) => store.set('shareAllImages', on))
    check(media, 'shareAllColumn', () => values().shareAllColumn, (on) => store.set('shareAllColumn', on), () => !values().shareAllImages)
  }
  if (thread.length > 1) {
    const box = section('shareThread')
    const values = () => store.get()
    check(box, 'shareHideReplies', () => (values().shareHideReplies ? values().shareHideReplies === 'on' : values().hideThreadReplies), (on) => store.set('shareHideReplies', on ? 'on' : 'off'))
  }
  if (videoEntity?.type === 'video') {
    const box = section('shareVideo')
    const row = document.createElement('label')
    const range = Object.assign(document.createElement('input'), { type: 'range', min: '0', step: '0.1', value: '0', disabled: true })
    const number = Object.assign(document.createElement('input'), { type: 'number', min: '0', step: '0.1', value: '0', disabled: true })
    row.append(range, number)
    box.append(row)
    const note = document.createElement('small')
    box.append(note)
    const seek = (value: number) => {
      if (!film || !Number.isFinite(value)) return
      seconds = Math.max(0, Math.min(value, film.duration()))
      range.value = number.value = String(Math.round(seconds * 10) / 10)
      const wanted = seconds
      void film.at(seconds).then((frame) => { if (frame && wanted === seconds) { still = frame; render() } })
    }
    range.oninput = () => seek(range.valueAsNumber)
    number.oninput = () => seek(number.valueAsNumber)
    if (film) {
      film.ready.then(() => {
        range.max = number.max = String(Math.floor(film.duration() * 10) / 10)
        range.disabled = number.disabled = false
        seek(0)
      }, () => (note.textContent = t('shareNoVideo')))
    } else note.textContent = t('shareNoVideo')
  }

  // Copy and download.
  const footer = document.createElement('footer')
  const status = document.createElement('output')
  const make = () =>
    domToBlob(shot, {
      width: shot.offsetWidth,
      height: shot.offsetHeight,
      scale: 2,
      backgroundColor: body.backgroundColor,
      // Read X's media again with CORS: the page's own copies were loaded without it (ADR-0001).
      fetch: { requestInit: { cache: 'reload' } },
    })
  const fail = (error: unknown) => {
    console.warn('[xnote] share as image', error)
    status.textContent = t('shareFailed')
  }
  const copyButton = Object.assign(document.createElement('button'), { textContent: t('copyImage') })
  copyButton.onclick = () => {
    status.textContent = ''
    navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })]).then(() => (status.textContent = t('copied')), fail)
  }
  const downloadButton = Object.assign(document.createElement('button'), { textContent: t('downloadImage') })
  downloadButton.onclick = () => {
    status.textContent = ''
    make().then((blob) => {
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName(tweet?.permalink ?? '/x/status/post') })
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    }, fail)
  }
  footer.append(copyButton, downloadButton, status)
  side.append(footer)

  dialog.append(left, side)
  // Escape closes this window only, not the post popup below it.
  dialog.addEventListener('keydown', (event) => event.key === 'Escape' && event.stopPropagation())
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close())
  dialog.addEventListener('close', () => { film?.dispose(); dialog.remove() })
  document.body.append(dialog)
  refresh()
  render()
  dialog.showModal()
  fit()
}

/** "Share as image" in the ··· menu of a post. */
export function installShareImage(store: Store) {
  addStyle(CSS)
  onPageChange(() => {
    if (!store.get().enabled || !store.get().shareImage) return
    const menu = document.querySelector('[role="menu"]')
    // The menu belongs to the post whose ··· button X marks as expanded.
    const caret = document.querySelector<HTMLElement>('article [data-testid="caret"][aria-expanded="true"]')
    const article = caret?.closest('article')
    if (!menu || !article) return
    const items = [...menu.querySelectorAll('[role="menuitem"]:not(.xnote-share-item)')]
    const last = items.at(-1)
    // X can fill the menu after the first render; keep ours at the end.
    const existing = menu.querySelector('.xnote-share-item')
    if (existing) return void (last && last.nextElementSibling !== existing && last.after(existing))
    // Some items are links; clone a plain one.
    const model = items.find((item) => item.tagName === 'DIV' && item.querySelector('svg path') && item.querySelector('span'))
    if (!model || !last) return
    const item = model.cloneNode(true) as HTMLElement
    item.classList.add('xnote-share-item')
    item.removeAttribute('data-testid')
    item.querySelector('svg')!.innerHTML = `<g><path d="${PICTURE}"/></g>`
    item.querySelector('span')!.textContent = t('shareAsImage')
    item.addEventListener('click', (event) => {
      event.stopPropagation()
      caret!.click() // X's own way to close its menu
      open(store, article)
    })
    last.after(item)
  })
}
