import { t } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import { feedKind } from './route.ts'
import type { Store } from './settings.ts'

type Resume = { keepsHere(): boolean; clearHere(): Promise<unknown> }

// Arrow up and a circular arrow, drawn on X's 24 × 24 grid.
const UP = 'M12 3.59l7.457 7.45-1.414 1.42L13 7.41V21h-2V7.41l-5.043 5.05-1.414-1.42L12 3.59z'
const REFRESH =
  'M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.86-2.55 7.75-6h-2.08c-.82 2.33-3.04 4-5.67 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35C16.2 4.9 14.21 4 12 4z'
// X's search icon.
const SEARCH =
  'M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z'
const SIDEBAR = '[data-testid="sidebarColumn"]'

// X's own floating buttons (the chat drawer): 55px, frosted page colour. Measured; round, not X's 16px corners.
// The tooltip is X's: black at 80%, white 11px text. The dock sits above the chat drawer; tweaks.ts
// moves it down when that drawer is hidden.
const CSS = `
#xnote-dock { position: fixed; right: 20px; bottom: 79px; z-index: 1; display: flex; flex-direction: column; gap: 12px; }
#xnote-dock[hidden], #xnote-dock button[hidden], html.xnote-sheet #xnote-dock { display: none; }
#xnote-dock button {
  position: relative; width: 55px; height: 55px; display: grid; place-items: center; padding: 0; cursor: pointer;
  border-radius: 50%; border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background: var(--xnote-dock-bg); color: inherit; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: rgba(101, 119, 134, 0.2) 0 0 15px, rgba(101, 119, 134, 0.15) 0 0 3px 1px;
  transition: background-color 0.2s, color 0.2s;
}
#xnote-dock button:hover { color: var(--xnote-accent); background: color-mix(in srgb, var(--xnote-accent) 10%, var(--xnote-dock-bg)); }
#xnote-dock svg { width: 24px; height: 24px; fill: currentColor; }
#xnote-dock button:hover::after {
  content: attr(aria-label); position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%);
  padding: 4px 8px; border-radius: 16px; background: rgba(0, 0, 0, 0.8); color: #fff;
  font: 11px/12px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; white-space: nowrap; pointer-events: none;
}
/* Search: X's own search box of the sidebar, with its recent searches and suggestions, shown in the
   middle of the window. The sidebar becomes the dimmed backdrop; the rest of it stays invisible.
   The class twice outweighs the masonry, which hides the sidebar. */
html.xnote-spotlight.xnote-spotlight ${SIDEBAR} {
  display: flex !important; position: fixed !important; inset: 0 !important; width: auto !important; max-width: none !important;
  height: auto !important; margin: 0 !important; padding: 0 !important; z-index: 1000 !important; background: rgba(0, 0, 0, 0.4);
}
html.xnote-spotlight.xnote-spotlight ${SIDEBAR} > * { visibility: hidden; }
html.xnote-spotlight.xnote-spotlight ${SIDEBAR} form[role="search"] {
  visibility: visible; position: fixed !important; top: 15vh; left: 50%; width: min(600px, 90vw); transform: translateX(-50%);
}
/* The box and X's panel of recent searches below it are one card: the box keeps its round top,
   the panel continues it with the same round bottom, a line between them. The panel's scroll bar
   squares its corners, so it is clipped to that shape. */
html.xnote-spotlight ${SIDEBAR} form[role="search"]:has([id^="typeaheadDropdown"]) div:has(> div > div > [data-testid="SearchBox_Search_Input_label"]) {
  border-radius: 22px 22px 0 0 !important; box-shadow: none !important; border-color: transparent !important;
}
html.xnote-spotlight ${SIDEBAR} form[role="search"] div:has(> [id^="typeaheadDropdown"]) {
  margin-top: 0; border-radius: 0 0 22px 22px; clip-path: inset(0 round 0 0 22px 22px);
  border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}
/* X puts the navigation one layer above the main column, which holds the sidebar: lift the main
   column so that the backdrop covers the navigation too. */
html.xnote-spotlight main[role="main"] { z-index: 4 !important; }
/* The buttons are under the backdrop as well: the same dimming, and a click on them closes it. */
html.xnote-spotlight #xnote-dock { filter: brightness(0.6); pointer-events: none; }
`

/** Back to top and refresh, at the bottom right of the timelines. */
export function installDock(store: Store, resume: Resume) {
  addStyle(CSS)
  const dock = document.createElement('div')
  dock.id = 'xnote-dock'
  const button = (icon: string, label: string, run: () => void) => {
    const element = document.createElement('button')
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>`
    element.setAttribute('aria-label', label)
    element.addEventListener('click', run)
    dock.append(element)
    return element
  }
  const root = document.documentElement
  let searchPath = ''
  const closeSearch = () => {
    if (!root.classList.contains('xnote-spotlight')) return
    root.classList.remove('xnote-spotlight')
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const search = button(SEARCH, t('search'), () => {
    if (root.classList.contains('xnote-spotlight')) return closeSearch()
    const input = document.querySelector<HTMLInputElement>(`${SIDEBAR} [data-testid="SearchBox_Search_Input"]`)
    // X shows no sidebar in a narrow window: its Explore page has the search box then.
    if (!input) return document.querySelector<HTMLElement>('header[role="banner"] a[href="/explore"]')?.click()
    searchPath = location.pathname + location.search
    root.classList.add('xnote-spotlight')
    input.focus()
  })
  // A click anywhere but the box closes it; X's dropdown is inside the form too. The search button
  // closes it itself.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest(`${SIDEBAR} form[role="search"]`) && !search.contains(target)) closeSearch()
  }, true)
  document.addEventListener('keydown', (event) => event.key === 'Escape' && closeSearch(), true)
  // Only the page moves: X asks for newer posts at the top as it always does, and shows its pill.
  const top = button(UP, t('backToTop'), () => scrollTo(0, 0))
  // shortcut: a reload of the page, X has no public way to load a timeline again; find X's own
  // refresh of a timeline if the reload feels slow.
  const refresh = button(REFRESH, t('refresh'), async () => {
    if (resume.keepsHere()) await resume.clearHere()
    location.reload()
  })
  refresh.addEventListener('mouseenter', () => refresh.setAttribute('aria-label', t(resume.keepsHere() ? 'clearAndRefresh' : 'refresh')))

  const sync = () => {
    if (!document.body) return
    if (!dock.isConnected) document.body.append(dock)
    // A search or a picked suggestion opens another page.
    if (location.pathname + location.search !== searchPath) closeSearch()
    const kind = feedKind(location.pathname)
    const values = store.get()
    search.hidden = !values.dockSearch
    top.hidden = !values.dockTop
    refresh.hidden = !values.dockRefresh
    dock.hidden = !values.enabled || kind === null || kind === 'keep' || (search.hidden && top.hidden && refresh.hidden)
    if (dock.hidden) return
    // X's theme: the page colour of <body>, the accent of its Post button.
    const body = getComputedStyle(document.body)
    dock.style.color = body.color
    dock.style.setProperty('--xnote-dock-bg', `color-mix(in srgb, ${body.backgroundColor} 85%, transparent)`)
    const accent = document.querySelector('[data-testid="SideNav_NewTweet_Button"]')
    if (accent) dock.style.setProperty('--xnote-accent', getComputedStyle(accent).backgroundColor)
  }
  onPageChange(sync)
  store.subscribe(sync)
}
