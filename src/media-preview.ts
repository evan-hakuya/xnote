import { t } from './i18n.ts'
import { addStyle } from './page.ts'
import { fibers } from './react.ts'
import type { Store } from './settings.ts'

const MEDIA = '[data-testid="videoPlayer"], [data-testid="tweetPhoto"], a[href*="/photo/"]'
const GROUP = 'article, div[role="link"]:has([data-testid="User-Name"])'
const CSS = `
html:has(> body > dialog.xnote-media-preview[open]) { overflow:hidden !important; scrollbar-gutter:auto !important; }
.xnote-media-preview { position:fixed; inset:0; box-sizing:border-box; max-width:none; max-height:none; margin:auto; padding:0; border:0; color:white; }
.xnote-media-preview[open] { --counter-height:48px; display:grid; grid-template-rows:minmax(0, 1fr) var(--counter-height); }
.xnote-media-preview > img, .xnote-media-preview > video { grid-row:1; width:100%; height:100%; object-fit:contain; }
.xnote-media-preview button { position:absolute; grid-row:1; align-self:center; display:grid; place-items:center; width:36px; height:36px; padding:0; border:0; border-radius:50%; background:rgb(0 0 0 / 75%); color:white; cursor:pointer; }
.xnote-media-preview button svg { display:block; width:20px; height:20px; fill:currentColor; }
.xnote-media-preview button:hover { background:rgb(48 48 48 / 90%); }
.xnote-media-preview .close { top:12px; left:12px; }
.xnote-media-preview :is(.prev, .next) { top:calc((100% - var(--counter-height)) / 2); transform:translateY(-50%); }
.xnote-media-preview .prev { left:12px; }
.xnote-media-preview .next { right:12px; }
.xnote-media-preview output { grid-row:2; place-self:center; font:14px/1.4 sans-serif; }
`

type Media = { kind: 'photo' | 'video'; url: string; alt: string; poster?: string; loop?: boolean }
type Entity = { type?: string; media_url_https?: string; ext_alt_text?: string; video_info?: { variants?: { content_type?: string; url?: string; bitrate?: number }[] } }

// X has already supplied these media URLs with the post. Never reuse a blob URL:
// the inline player owns its MediaSource and cannot share it with a second player.
export function entityMedia(entity: Entity): Media | undefined {
  const poster = entity?.media_url_https
  if (typeof poster !== 'string' || !poster.startsWith('https://')) return
  if (entity.type === 'photo') return { kind: 'photo', url: poster, alt: entity.ext_alt_text ?? '' }
  const variants = entity.video_info?.variants
  if (!Array.isArray(variants)) return
  const best = variants.filter(v => v?.content_type === 'video/mp4' && typeof v.url === 'string' && v.url.startsWith('https://'))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
  if (best?.url) return { kind: 'video', url: best.url, alt: '', poster, loop: entity.type === 'animated_gif' }
}

export function mediaTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element) || !target.closest('main article') || target.closest('#xnote-backdrop')) return null
  const hit = target.closest(MEDIA)
  if (!hit) return null
  return hit.closest('[data-testid="videoPlayer"]') ?? hit.querySelector('[data-testid="videoPlayer"]') ??
    hit.closest('a[href*="/photo/"]') ?? hit
}

function gallery(hit: Element) {
  const group = hit.closest(GROUP)
  if (!group) return
  const tiles = [...new Set([...group.querySelectorAll(MEDIA)].filter(e => e.closest(GROUP) === group).map(mediaTarget))]
    .filter((e): e is Element => !!e)
  const tileIndex = tiles.indexOf(hit)
  if (tileIndex < 0) return
  const link = hit.closest('a[href]')?.getAttribute('href')
  const number = link?.match(/\/(?:photo|video)\/(\d+)(?:[?#]|$)/)?.[1]
  const tweet = fibers(hit).map(f => f.memoizedProps?.tweet).find(t => t?.permalink)
  const entities = Array.isArray(tweet?.extended_entities?.media) ? tweet.extended_entities.media as Entity[] : undefined
  const index = number ? Number(number) - 1 : tileIndex
  if (entities?.[index]) {
    const items = entities.map(entityMedia)
    const selected = items[index]
    if (selected) {
      const media = items.filter((m): m is Media => !!m)
      return { media, index: media.indexOf(selected) }
    }
  }
  const media: Media[] = []
  let selected = -1
  for (const tile of tiles) {
    const video = tile.querySelector('video')
    const img = tile.querySelector('img')
    const src = video ? video.currentSrc : img?.currentSrc || img?.src
    if (!src?.startsWith('https://')) continue
    if (tile === hit) selected = media.length
    media.push({ kind: video ? 'video' : 'photo', url: src, alt: img?.alt ?? '' })
  }
  if (selected >= 0) return { media, index: selected }
}

export function installMediaPreview(store: Store) {
  addStyle(CSS)
  let dialog: HTMLDialogElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Element | null = null
  let pendingVideo: HTMLVideoElement | null = null
  let dismissed: WeakRef<Element> | undefined
  const cancel = () => { clearTimeout(timer); pending = null; pendingVideo = null }
  const open = (hit: Element) => {
    cancel()
    const data = gallery(hit)
    if (dialog || !data) return false
    const { media } = data
    let index = data.index
    const box = document.createElement('dialog')
    box.className = 'xnote-media-preview'
    box.setAttribute('aria-label', t('mediaPreview'))
    const button = (name: 'close' | 'previousMedia' | 'nextMedia', path: string, cls: string, action: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'; b.className = cls
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
      b.setAttribute('aria-label', t(name))
      b.onclick = action
      box.append(b)
    }
    let content: HTMLImageElement | HTMLVideoElement | undefined
    const release = () => {
      if (content instanceof HTMLVideoElement) {
        content.pause(); content.removeAttribute('src'); content.load()
      }
      content?.remove()
    }
    const counter = document.createElement('output')
    const show = (step: number) => {
      release()
      index = (index + step + media.length) % media.length
      const item = media[index]!
      content = document.createElement(item.kind === 'video' ? 'video' : 'img')
      if (content instanceof HTMLVideoElement) {
        content.controls = true; content.playsInline = true; content.muted = true
        content.loop = !!item.loop
        if (item.poster) content.poster = item.poster
      } else {
        content.alt = item.alt
      }
      content.src = item.url
      box.prepend(content)
      if (content instanceof HTMLVideoElement) void content.play().catch(() => {})
      counter.textContent = `${index + 1} / ${media.length}`
    }
    button('close', 'M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z', 'close', () => box.close())
    box.append(counter)
    if (media.length > 1) {
      button('previousMedia', 'M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z', 'prev', () => show(-1))
      button('nextMedia', 'M12.957 4.54L20.414 12l-7.457 7.46-1.414-1.42L16.586 13H3v-2h13.586l-5.043-5.04 1.414-1.42z', 'next', () => show(1))
    }
    box.onclick = e => {
      if (e.target !== box) return
      const r = box.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) box.close()
    }
    box.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); box.close() }
      else if (media.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); show(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    box.onwheel = e => e.preventDefault()
    box.onclose = () => { dismissed = new WeakRef(hit); release(); box.remove(); dialog = undefined }
    dialog = box
    hit.closest('article')?.querySelectorAll('video').forEach(v => v.pause())
    document.body.append(box)
    box.showModal()
    show(0)
    return true
  }
  const modifiedClick = (e: MouseEvent) => {
    const s = store.get()
    if (!s.enabled || !s.mediaCtrlPreview || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || (e.type === 'click' && e.button !== 0)) return
    const hit = mediaTarget(e.target)
    if (hit && open(hit)) { e.preventDefault(); e.stopImmediatePropagation() }
  }
  addEventListener('click', modifiedClick, true)
  addEventListener('contextmenu', modifiedClick, true) // macOS may report Ctrl + click as a context menu.
  addEventListener('pointerover', e => {
    const s = store.get()
    if (!s.enabled || !s.mediaHoverPreview || dialog || e.pointerType !== 'mouse') return
    const hit = mediaTarget(e.target)
    if (hit === pending && hit) return
    cancel()
    if (hit && dismissed?.deref() === hit) return
    dismissed = undefined
    if (!hit) return
    pending = hit
    const video = hit.querySelector('video')
    if (video && gallery(hit)) {
      pendingVideo = video
      video.pause()
    }
    timer = setTimeout(() => {
      if (hit.isConnected && hit.matches(':hover') && document.visibilityState === 'visible') open(hit)
      else cancel()
    }, Math.max(100, Math.min(5000, s.mediaHoverDelay)))
  }, true)
  addEventListener('pointerout', e => { if (pending && mediaTarget(e.relatedTarget) !== pending) cancel() }, true)
  for (const type of ['scroll', 'pointerdown', 'blur']) addEventListener(type, cancel, true)
  addEventListener('popstate', () => { cancel(); dialog?.close() })
  store.subscribe(s => { cancel(); if (!s.enabled || (!s.mediaHoverPreview && !s.mediaCtrlPreview)) dialog?.close() })
  return {
    isOpen: () => !!dialog,
    waitingForVideo: (video: HTMLMediaElement) => video === pendingVideo,
  }
}
