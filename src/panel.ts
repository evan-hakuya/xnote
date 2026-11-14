import { t, type MessageKey } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import type { Settings, Store } from './settings.ts'

const ENTRY_ID = 'xnote-entry'
const MORE_BUTTON = 'header[role="banner"] nav [data-testid="AppTabBar_More_Menu"]'
const ICON =
  'M3 6h9v2H3V6zm13 0h5v2h-5V6zM3 16h3v2H3v-2zm7 0h11v2H10v-2zM12 4h2v6h-2V4zM6 14h2v6H6v-6z'

type KeysOf<T> = { [K in keyof Settings]: Settings[K] extends T ? K : never }[keyof Settings]

type Group = {
  title: MessageKey
  switches: KeysOf<boolean>[]
  numbers?: { key: KeysOf<number>; min: number; max: number }[]
  texts?: KeysOf<string>[]
}
const groups: Group[] = [
  {
    title: 'groupFeed',
    switches: ['enabled', 'masonryHome', 'masonryProfile', 'masonrySearch', 'detailOverlay', 'hoverPlay'],
    numbers: [
      { key: 'cardMinWidth', min: 160, max: 800 },
      { key: 'cardGap', min: 0, max: 48 },
    ],
  },
  {
    title: 'groupFilter',
    switches: ['hideRetweets', 'hideSuggested', 'hidePrompts', 'hideMorePosts', 'hideUnavailableQuotes'],
    texts: ['mutedQuotes'],
  },
  {
    title: 'groupNav',
    switches: ['hideGrok', 'hidePremiumNav', 'hideConnectNav', 'hideCreatorStudioNav', 'hideBusinessNav', 'hideAdsNav', 'hideJobsNav', 'hideMoneyNav'],
  },
  {
    title: 'groupPage',
    switches: ['hideChatDrawer', 'hideViews', 'hideViewActivity', 'hideUpsells', 'hideSidebarContent', 'hideExplore'],
  },
  {
    title: 'groupStyle',
    switches: ['birdLogo', 'premiumCheck', 'mediaGrid', 'navNormalFont', 'menuNormalFont', 'monochromeFollow', 'twemoji', 'bypassAge', 'disableNfl'],
  },
]
// A line of explanation below the name of a switch.
const hints: Partial<Record<KeysOf<boolean>, MessageKey>> = {
  enabled: 'enabledHint',
  birdLogo: 'classicHint',
  mediaGrid: 'reloadHint',
  twemoji: 'reloadHint',
}

const CSS = `
#xnote-panel {
  width: min(420px, calc(100vw - 32px));
  padding: 16px 20px 20px;
  border: 1px solid rgb(128 128 128 / 0.3);
  border-radius: 16px;
  font: 15px/20px TwitterChirp, -apple-system, system-ui, sans-serif;
}
#xnote-panel::backdrop { background: rgb(0 0 0 / 0.4); }
#xnote-panel header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
#xnote-panel h2 { margin: 0; font-size: 20px; line-height: 24px; }
#xnote-panel h3 { margin: 16px 0 4px; font-size: 13px; line-height: 16px; opacity: 0.6; }
#xnote-panel button { border: 0; background: none; color: inherit; font-size: 24px; line-height: 1; cursor: pointer; }
#xnote-panel label { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; cursor: pointer; }
#xnote-panel small { display: block; opacity: 0.6; font-size: 13px; }
#xnote-panel input { flex: none; font: inherit; accent-color: rgb(29, 155, 240); }
#xnote-panel input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
#xnote-panel input[type="number"] { width: 80px; }
#xnote-panel input[type="text"] { width: 180px; }
#xnote-panel [role="status"] { margin: 0 0 8px; color: rgb(244, 33, 46); }
`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function createPanel(store: Store, notice: HTMLElement) {
  document.head.append(el('style', CSS))

  const dialog = el('dialog')
  dialog.id = 'xnote-panel'
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close())

  const header = el('header')
  const close = el('button', '×')
  close.setAttribute('aria-label', t('close'))
  close.addEventListener('click', () => dialog.close())
  header.append(el('h2', t('settings')), close)
  dialog.append(header, notice)

  for (const group of groups) {
    dialog.append(el('h3', t(group.title)))

    for (const key of group.switches) {
      const row = el('label')
      const text = el('span', t(key))
      const hint = hints[key]
      if (hint) text.append(el('small', t(hint)))
      const input = el('input')
      input.type = 'checkbox'
      input.setAttribute('role', 'switch')
      input.checked = store.get()[key]
      input.addEventListener('change', () => store.set(key, input.checked))
      row.append(text, input)
      dialog.append(row)
    }

    for (const { key, min, max } of group.numbers ?? []) {
      const row = el('label')
      const input = el('input')
      input.type = 'number'
      input.min = String(min)
      input.max = String(max)
      input.valueAsNumber = store.get()[key]
      // Out-of-range and empty input is ignored until it becomes valid.
      input.addEventListener('input', () => input.validity.valid && input.value && store.set(key, input.valueAsNumber))
      row.append(el('span', t(key)), input)
      dialog.append(row)
    }

    for (const key of group.texts ?? []) {
      const row = el('label')
      const input = el('input')
      input.type = 'text'
      input.value = store.get()[key]
      input.addEventListener('input', () => store.set(key, input.value))
      const text = el('span', t(key))
      text.append(el('small', t('namesHint')))
      row.append(text, input)
      dialog.append(row)
    }
  }

  document.body.append(dialog)
  return dialog
}

export function installPanel(store: Store, getNotice: () => MessageKey | null) {
  let dialog: HTMLDialogElement | undefined
  // X gives its navigation items a pill of 10% text colour under the pointer, from script. The
  // entry is a copy without that script; the pill's shape and transition come with the copy.
  addStyle('#xnote-entry:hover > div { background-color: color-mix(in srgb, currentColor 10%, transparent); }')
  const notice = el('p')
  notice.setAttribute('role', 'status')

  const open = () => {
    dialog ??= createPanel(store, notice)
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
