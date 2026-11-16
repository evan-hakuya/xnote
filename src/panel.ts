import { t, type MessageKey } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import type { ResumeSwitch } from './resume.ts'
import type { Settings, Store } from './settings.ts'

type Cache = { count(toggle: ResumeSwitch): number; clear(toggle: ResumeSwitch): void }
const RESUME: ResumeSwitch[] = ['resumeForYou', 'resumeFollowing', 'resumeLists']
// The lines that show what a cache holds, filled in each time the window opens.
const refreshers: (() => void)[] = []

const ENTRY_ID = 'xnote-entry'
const MORE_BUTTON = 'header[role="banner"] nav [data-testid="AppTabBar_More_Menu"]'
const ICON =
  'M3 6h9v2H3V6zm13 0h5v2h-5V6zM3 16h3v2H3v-2zm7 0h11v2H10v-2zM12 4h2v6h-2V4zM6 14h2v6H6v-6z'
const CLOSE_ICON = 'M10.59 12 4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z'

type KeysOf<T> = { [K in keyof Settings]: Settings[K] extends T ? K : never }[keyof Settings]

// The settings by what they change on X: a category on the left, its sections on the right.
type Section = { title?: MessageKey; keys: Exclude<keyof Settings, 'enabled'>[] }
const categories: { title: MessageKey; sections: Section[] }[] = [
  {
    title: 'catLayout',
    sections: [
      { title: 'subMasonry', keys: ['masonryHome', 'masonryProfile', 'masonrySearch'] },
      { title: 'subSize', keys: ['wideLayout', 'cardMinWidth', 'cardGap'] },
    ],
  },
  {
    title: 'catView',
    sections: [
      { title: 'subPopup', keys: ['detailOverlay'] },
      { title: 'subMedia', keys: ['hoverPlay', 'mediaGrid'] },
      { title: 'subResume', keys: ['resumeForYou', 'resumeFollowing', 'resumeLists'] },
    ],
  },
  {
    title: 'catTimeline',
    sections: [
      { title: 'subEntries', keys: ['hideRetweets', 'hideSuggested', 'hidePrompts', 'hideMorePosts'] },
      { title: 'subQuotes', keys: ['hideUnavailableQuotes', 'mutedQuotes'] },
    ],
  },
  {
    title: 'catPost',
    sections: [
      { title: 'subActions', keys: ['hideReplyButton', 'hideRetweetButton', 'hideLikeButton', 'hideViews', 'hideBookmarkButton', 'hideShareButton'] },
      { title: 'subPostMenu', keys: ['hideViewActivity'] },
    ],
  },
  {
    title: 'catNav',
    sections: [
      {
        title: 'subNavItems',
        keys: ['hidePremiumNav', 'hideConnectNav', 'hideCreatorStudioNav', 'hideBusinessNav', 'hideAdsNav', 'hideJobsNav', 'hideMoneyNav'],
      },
      { title: 'subPageParts', keys: ['hideSidebarContent', 'hideExplore', 'hideChatDrawer'] },
    ],
  },
  { title: 'catPromo', sections: [{ keys: ['hideGrok', 'hideUpsells'] }] },
  {
    title: 'catLook',
    sections: [
      { title: 'subClassic', keys: ['birdLogo', 'monochromeFollow', 'premiumCheck'] },
      { title: 'subText', keys: ['navNormalFont', 'menuNormalFont', 'twemoji'] },
    ],
  },
  { title: 'catOther', sections: [{ title: 'subFeatures', keys: ['bypassAge', 'disableNfl'] }] },
]
const limits: Record<KeysOf<number>, [number, number]> = { cardMinWidth: [160, 800], cardGap: [0, 48] }
// A line of explanation below the name of a switch.
const hints: Partial<Record<KeysOf<boolean>, MessageKey>> = {
  enabled: 'enabledHint',
  birdLogo: 'classicHint',
  mediaGrid: 'reloadHint',
  twemoji: 'reloadHint',
}

const CSS = `
#xnote-panel {
  width: min(880px, calc(100vw - 64px));
  height: min(640px, 88vh);
  padding: 0;
  border: 1px solid rgb(128 128 128 / 0.3);
  border-radius: 16px;
  font: 15px/20px TwitterChirp, -apple-system, system-ui, sans-serif;
  overflow: hidden;
}
#xnote-panel[open] { display: grid; grid-template: auto 1fr / 200px 1fr; }
#xnote-panel::backdrop { background: rgb(0 0 0 / 0.4); }
#xnote-panel header {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 16px;
  padding: 12px 16px 12px 24px; border-bottom: 1px solid rgb(128 128 128 / 0.2);
}
#xnote-panel h2 { margin: 0; font-size: 20px; line-height: 24px; }
#xnote-panel header label { margin-left: auto; padding: 0; gap: 10px; }
#xnote-panel button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
#xnote-panel .xnote-close { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border-radius: 9999px; }
#xnote-panel .xnote-close svg { width: 20px; height: 20px; fill: currentColor; }
#xnote-panel nav { padding: 8px; border-right: 1px solid rgb(128 128 128 / 0.2); overflow-y: auto; }
#xnote-panel nav button { display: block; width: 100%; padding: 10px 16px; border-radius: 9999px; text-align: left; }
#xnote-panel :is(nav button, .xnote-close):hover { background: color-mix(in srgb, currentColor 10%, transparent); }
#xnote-panel nav button[aria-current="true"] { font-weight: 700; background: color-mix(in srgb, currentColor 10%, transparent); }
#xnote-panel main { padding: 4px 24px 24px; overflow-y: auto; }
#xnote-panel h3 { margin: 20px 0 4px; font-size: 13px; line-height: 16px; font-weight: 600; opacity: 0.6; }
#xnote-panel section label { border-bottom: 1px solid rgb(128 128 128 / 0.15); }
#xnote-panel section label:last-child { border-bottom: 0; }
#xnote-panel label { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; cursor: pointer; }
#xnote-panel small { display: block; opacity: 0.6; font-size: 13px; }
#xnote-panel .xnote-cache button { margin-left: 8px; padding: 0; color: rgb(29, 155, 240); font-size: 13px; }
#xnote-panel .xnote-cache button:hover { text-decoration: underline; }
#xnote-panel .xnote-cache button:disabled { color: inherit; opacity: 0.5; text-decoration: none; cursor: default; }
#xnote-panel input { flex: none; font: inherit; accent-color: rgb(29, 155, 240); }
#xnote-panel input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
#xnote-panel input[type="number"] { width: 80px; }
#xnote-panel input[type="text"] { width: 180px; }
#xnote-panel [role="status"] { margin: 16px 0 0; color: rgb(244, 33, 46); }
`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

/** One setting as a row: a switch, a number or a text field, by the type of its value. */
function row(store: Store, key: keyof Settings, cache?: Cache) {
  const label = el('label')
  const text = el('span', t(key))
  const input = el('input')
  const value = store.get()[key]
  if (typeof value === 'boolean') {
    const hint = hints[key as KeysOf<boolean>]
    if (hint) text.append(el('small', t(hint)))
    const toggle = RESUME.find((name) => name === key)
    if (cache && toggle) {
      const line = el('small')
      line.className = 'xnote-cache'
      const count = el('span')
      const clear = el('button', t('clearCache'))
      clear.type = 'button'
      const refresh = () => {
        const posts = cache.count(toggle)
        count.textContent = t('cachedPosts').replace('{n}', String(posts))
        clear.disabled = posts === 0
      }
      clear.addEventListener('click', (event) => {
        event.preventDefault() // a click in a label would also flip its switch
        cache.clear(toggle)
        refresh()
      })
      refreshers.push(refresh)
      line.append(count, clear)
      text.append(line)
    }
    input.type = 'checkbox'
    input.setAttribute('role', 'switch')
    input.checked = value
    input.addEventListener('change', () => store.set(key as KeysOf<boolean>, input.checked))
  } else if (typeof value === 'number') {
    const [min, max] = limits[key as KeysOf<number>]
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.valueAsNumber = value
    // Out-of-range and empty input is ignored until it becomes valid.
    input.addEventListener('input', () => input.validity.valid && input.value && store.set(key as KeysOf<number>, input.valueAsNumber))
  } else {
    text.append(el('small', t('namesHint')))
    input.type = 'text'
    input.value = value
    input.addEventListener('input', () => store.set(key as KeysOf<string>, input.value))
  }
  label.append(text, input)
  return label
}

function createPanel(store: Store, notice: HTMLElement, cache?: Cache) {
  document.head.append(el('style', CSS))

  const dialog = el('dialog')
  dialog.id = 'xnote-panel'
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close())

  // The master switch stays in sight whichever category is open.
  const header = el('header')
  // X's own close icon: the "×" character sits off centre in most fonts.
  const close = el('button')
  close.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CLOSE_ICON}"/></svg>`
  close.className = 'xnote-close'
  close.setAttribute('aria-label', t('close'))
  close.addEventListener('click', () => dialog.close())
  header.append(el('h2', t('settings')), row(store, 'enabled'), close)

  const nav = el('nav')
  const main = el('main')
  main.append(notice)
  const pages = categories.map(({ title, sections }, index) => {
    const page = el('div')
    for (const section of sections) {
      if (section.title) page.append(el('h3', t(section.title)))
      const box = el('section')
      box.append(...section.keys.map((key) => row(store, key, cache)))
      page.append(box)
    }
    const tab = el('button', t(title))
    tab.addEventListener('click', () => show(index))
    nav.append(tab)
    main.append(page)
    return { tab, page }
  })
  const show = (index: number) => {
    pages.forEach(({ tab, page }, other) => {
      tab.setAttribute('aria-current', String(other === index))
      page.hidden = other !== index
    })
    main.scrollTop = 0
  }
  show(0)

  dialog.append(header, nav, main)
  document.body.append(dialog)
  return dialog
}

export function installPanel(store: Store, getNotice: () => MessageKey | null, cache?: Cache) {
  let dialog: HTMLDialogElement | undefined
  // X gives its navigation items a pill of 10% text colour under the pointer, from script. The
  // entry is a copy without that script; the pill's shape and transition come with the copy.
  addStyle('#xnote-entry:hover > div { background-color: color-mix(in srgb, currentColor 10%, transparent); }')
  const notice = el('p')
  notice.setAttribute('role', 'status')

  const open = () => {
    dialog ??= createPanel(store, notice, cache)
    for (const refresh of refreshers) refresh()
    const message = getNotice()
    notice.hidden = !message
    notice.textContent = message ? t(message) : ''
    // Follow X's current theme: X writes its colors on <body>.
    const theme = getComputedStyle(document.body)
    dialog.style.background = theme.backgroundColor
    dialog.style.color = theme.color
    dialog.showModal()
  }

  // The entry is a clone of X's "More" button, so it gets X's own look in every theme and width.
  const hasLabel = (node: Element) => node.querySelector('[dir]') !== null
  const ensureEntry = () => {
    const more = document.querySelector(MORE_BUTTON)
    if (!more) return
    const old = document.getElementById(ENTRY_ID)
    if (old?.previousElementSibling === more && hasLabel(old) === hasLabel(more)) return
    old?.remove()

    const entry = more.cloneNode(true) as HTMLElement
    entry.id = ENTRY_ID
    for (const name of ['data-testid', 'aria-haspopup', 'aria-expanded']) entry.removeAttribute(name)
    entry.setAttribute('aria-label', t('settings'))
    entry.querySelector('path')?.setAttribute('d', ICON)
    const label = entry.querySelector('[dir] span')
    if (label) label.textContent = 'xnote'
    entry.addEventListener('click', open)
    more.after(entry)
  }

  // X re-renders its navigation, so keep the entry in place.
  onPageChange(ensureEntry)
  ensureEntry()
}
