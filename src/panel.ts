import { t, type MessageKey } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import type { ResumeSwitch } from './resume.ts'
import type { Settings, Store } from './settings.ts'

type Cache = { count(toggle: ResumeSwitch): number; clear(toggle: ResumeSwitch): void }
// Given by the userscript manager when the script header grants it.
declare const GM_registerMenuCommand: ((name: string, run: () => void) => unknown) | undefined
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
      { title: 'subWidth', keys: ['wideLayout', 'navNarrow'] },
      { title: 'subSize', keys: ['cardMinWidth', 'cardGap'] },
    ],
  },
  {
    title: 'catTimeline',
    sections: [
      { title: 'subResume', keys: ['resumeForYou', 'resumeFollowing', 'resumeLists'] },
      { title: 'subEntries', keys: ['hideRetweets', 'hideSuggested', 'hidePrompts', 'hideMorePosts', 'hideUnavailableQuotes', 'mutedQuotes'] },
      { title: 'subCardContent', keys: ['hideThreadReplies', 'hideQuotes'] },
    ],
  },
  {
    title: 'catPost',
    sections: [
      { title: 'subPopup', keys: ['detailOverlay', 'sheetCollapse'] },
      { title: 'subActions', keys: ['hideReplyButton', 'hideRetweetButton', 'hideLikeButton', 'hideViews', 'hideBookmarkButton', 'hideShareButton'] },
      { title: 'subPostMenu', keys: ['hideViewActivity', 'shareImage'] },
    ],
  },
  {
    title: 'catMedia',
    sections: [
      { title: 'subMedia', keys: ['mediaGrid'] },
      { title: 'subMediaZoom', keys: ['mediaCtrlPreview', 'mediaHoverPreview'] },
      { title: 'subHoverPlay', keys: ['hoverPlay'] },
    ],
  },
  {
    title: 'catNav',
    sections: [
      // In the order X shows them; the xnote entry comes after "More".
      {
        title: 'subNavMain',
        keys: ['hideExploreNav', 'hideNotificationsNav', 'hideConnectNav', 'hideMessagesNav', 'hideCallsNav', 'hideHistoryNav', 'hidePremiumNav', 'hideProfileNav', 'hideXnoteNav'],
      },
      // Jobs and Money were not on the page to look at; they close the menu.
      {
        title: 'subNavMore',
        keys: ['hideListsNav', 'hideCommunitiesNav', 'hideCreatorStudioNav', 'hideBusinessNav', 'hideAdsNav', 'hideSpacesNav', 'hideJobsNav', 'hideMoneyNav'],
      },
      { title: 'subPageParts', keys: ['hideSidebarContent', 'hideExplore', 'hideChatDrawer'] },
      { title: 'subDock', keys: ['dockSearch', 'dockTop', 'dockRefresh'] },
    ],
  },
  { title: 'catPromo', sections: [{ keys: ['hideGrok', 'hideUpsells'] }] },
  {
    title: 'catLook',
    sections: [
      { title: 'subClassic', keys: ['birdLogo', 'premiumCheck'] },
      { title: 'subButtons', keys: ['monochromeFollow'] },
      { title: 'subText', keys: ['navNormalFont', 'menuNormalFont', 'twemoji'] },
    ],
  },
  { title: 'catOther', sections: [{ title: 'subFeatures', keys: ['bypassAge', 'disableNfl'] }] },
  { title: 'catBackup', sections: [] }, // filled by backup()
]
const limits: Record<KeysOf<number>, [number, number]> = { cardMinWidth: [160, 800], cardGap: [0, 48], hoverPlay: [0, 5000], mediaHoverPreview: [0, 5000] }
// A line of explanation below the name of a setting.
const hints: Partial<Record<keyof Settings, MessageKey>> = {
  enabled: 'enabledHint',
  birdLogo: 'classicHint',
  mediaGrid: 'reloadHint',
  twemoji: 'reloadHint',
  hideThreadReplies: 'shareSameHint',
  hideQuotes: 'shareSameHint',
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
#xnote-panel textarea { box-sizing: border-box; width: 100%; height: 160px; margin-top: 8px; padding: 8px; resize: vertical;
  border: 1px solid rgb(128 128 128 / 0.3); border-radius: 8px; background: transparent; color: inherit; font: 12px/16px ui-monospace, Menlo, monospace; }
#xnote-panel .xnote-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
#xnote-panel .xnote-actions button { padding: 6px 16px; border: 1px solid rgb(128 128 128 / 0.4); border-radius: 9999px; font-weight: 700; }
#xnote-panel .xnote-actions button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
#xnote-panel .xnote-actions output { font-size: 13px; opacity: 0.7; }
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
  const hint = hints[key]
  if (hint) text.append(el('small', t(hint)))
  if (typeof value === 'boolean') {
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
    input.addEventListener('change', () => store.set(key as KeysOf<boolean>, input.checked))
  } else if (typeof value === 'number') {
    const [min, max] = limits[key as KeysOf<number>]
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    if (key === 'hoverPlay' || key === 'mediaHoverPreview') {
      text.append(el('small', t('millisecondsHint')))
    }
    // Out-of-range and empty input is ignored until it becomes valid.
    input.addEventListener('input', () => input.validity.valid && input.value && store.set(key as KeysOf<number>, input.valueAsNumber))
  } else {
    text.append(el('small', t('namesHint')))
    input.type = 'text'
    input.addEventListener('input', () => store.set(key as KeysOf<string>, input.value))
  }
  // Follow changes from elsewhere, such as an import; not while the user types in this field.
  store.subscribe((values) => {
    if (document.activeElement === input) return
    const next = values[key]
    if (typeof next === 'boolean') input.checked = next
    else if (typeof next === 'number') input.valueAsNumber = next
    else input.value = next
  })
  label.append(text, input)
  return label
}

/** Export the settings as JSON to copy or download; import them from pasted text or a file. */
function backup(store: Store) {
  const actions = (...nodes: Node[]) => {
    const box = el('div')
    box.className = 'xnote-actions'
    box.append(...nodes)
    return box
  }
  const button = (key: MessageKey, run: () => void) => {
    const node = el('button', t(key))
    node.type = 'button'
    node.addEventListener('click', run)
    return node
  }

  const exported = el('textarea')
  exported.readOnly = true
  store.subscribe((values) => (exported.value = JSON.stringify(values, null, 2)))
  const exportStatus = el('output')
  const copy = button('copyText', () => {
    navigator.clipboard.writeText(exported.value).then(
      () => (exportStatus.textContent = t('copied')),
      () => exported.select(), // no clipboard access: leave it selected to copy by hand
    )
  })
  const download = button('downloadFile', () => {
    const link = el('a')
    link.href = URL.createObjectURL(new Blob([exported.value], { type: 'application/json' }))
    link.download = 'xnote-settings.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10000)
  })

  const pasted = el('textarea')
  pasted.spellcheck = false
  const file = el('input')
  file.type = 'file'
  file.accept = '.json,application/json,text/plain'
  file.hidden = true
  file.addEventListener('change', () => {
    void file.files?.[0]?.text().then((text) => (pasted.value = text))
    file.value = '' // the same file can be chosen again
  })
  const importStatus = el('output')
  const load = button('importSettings', () => {
    try {
      importStatus.textContent = t('imported').replace('{n}', String(store.load(pasted.value)))
      pasted.value = ''
    } catch {
      importStatus.textContent = t('importFailed')
    }
  })

  return [
    el('h3', t('subExport')),
    exported,
    actions(copy, download, exportStatus),
    el('h3', t('subImport')),
    el('small', t('importHint')),
    pasted,
    actions(button('chooseFile', () => file.click()), load, file, importStatus),
  ]
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
    if (title === 'catBackup') page.append(...backup(store))
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

  // The manager's menu opens the window too. Its entry is what lets the navigation's entry hide.
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t('settings'), open)
    document.documentElement.classList.add('xnote-menu')
  }
}
