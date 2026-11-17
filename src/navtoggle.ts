import { BIRD_COMPOSE } from './classic-assets.ts'
import { t } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import type { Store } from './settings.ts'

// Two chevrons, drawn on X's 24 × 24 grid; mirrored when the navigation is narrow.
const CHEVRONS = 'M18.41 7.41 17 6l-6 6 6 6 1.41-1.41L13.83 12zM12.41 7.41 11 6l-6 6 6 6 1.41-1.41L6.83 12z'
const FEATHER = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${BIRD_COMPOSE}"/></svg>`)}")`

// X draws a narrow navigation itself in a small window and on some pages, such as Chat: icons
// only, a round Post button with the feather, the avatar without the name. These rules give the
// full navigation that look, measured from X's: a 68px column, a 52px Post button.
const CSS = `
#xnote-nav-toggle {
  position: absolute; top: 8px; right: 4px; z-index: 1; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%;
  display: grid; place-items: center; background: transparent; color: inherit; cursor: pointer; opacity: 0.6;
}
#xnote-nav-toggle:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
#xnote-nav-toggle[hidden] { display: none; }
#xnote-nav-toggle svg { width: 20px; height: 20px; fill: currentColor; }
/* The narrow column has no room beside the logo: the button gets a row of its own above it. */
html.xnote-nav-narrow #xnote-nav-toggle { top: 4px; right: 16px; }
html.xnote-nav-narrow header[role="banner"] h1 { margin-top: 44px !important; }
html.xnote-nav-narrow #xnote-nav-toggle svg { transform: scaleX(-1); }
/* X animates the column's width. Its box snaps to the new width while the column, aligned to its
   right, grows or shrinks from the other side, so the navigation jumps left and back; and the
   masonry would measure a column half way. */
html.xnote-on header[role="banner"] > div { transition: none !important; }
/* X centres the navigation and the content together. The navigation keeps its place, and the
   content takes the room it gave up (--xnote-nav-left is X's margin, set from script). */
html.xnote-nav-narrow:not(.xnote-wide) header[role="banner"] {
  flex-grow: 0 !important; width: calc(var(--xnote-nav-left, 0px) + 68px) !important;
}
/* The column, X's fixed layer in it, and the column on screen in that layer. */
html.xnote-nav-narrow header[role="banner"] > div,
html.xnote-nav-narrow header[role="banner"] > div > div,
html.xnote-nav-narrow header[role="banner"] > div > div > div { width: 68px !important; }
html.xnote-nav-narrow header[role="banner"] > div > div > div > div { align-items: center !important; }
html.xnote-nav-narrow header[role="banner"] nav { width: 52px !important; align-items: center; }
html.xnote-nav-narrow header[role="banner"] nav [dir] { display: none !important; }
html.xnote-nav-narrow [data-testid="SideNav_NewTweet_Button"] { width: 52px !important; min-width: 0 !important; height: 52px !important; padding: 0 !important; }
html.xnote-nav-narrow [data-testid="SideNav_NewTweet_Button"] [dir] > * { display: none; }
html.xnote-nav-narrow [data-testid="SideNav_NewTweet_Button"] [dir]::before {
  content: ""; display: block; width: 24px; height: 24px; background: currentColor; -webkit-mask: ${FEATHER} center / contain no-repeat; mask: ${FEATHER} center / contain no-repeat;
}
html.xnote-nav-narrow [data-testid="SideNav_AccountSwitcher_Button"] { width: auto !important; }
html.xnote-nav-narrow [data-testid="SideNav_AccountSwitcher_Button"] > div:not(:first-child) { display: none; }
`

/** A button at the top right of the navigation that switches it between icons and full items. */
export function installNavToggle(store: Store) {
  addStyle(CSS)
  const root = document.documentElement
  const button = document.createElement('button')
  button.id = 'xnote-nav-toggle'
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CHEVRONS}"/></svg>`
  button.addEventListener('click', () => store.set('navNarrow', !store.get().navNarrow))

  const sync = () => {
    const values = store.get()
    const narrow = values.enabled && values.navNarrow
    root.classList.toggle('xnote-nav-narrow', narrow)
    // X's layout is 1265px at most (navigation 275, content 990), centred in the window. Measured.
    const left = `${Math.max(0, (root.clientWidth - 1265) / 2)}px`
    if (root.style.getPropertyValue('--xnote-nav-left') !== left) root.style.setProperty('--xnote-nav-left', left)
    button.setAttribute('aria-label', t(narrow ? 'expandNav' : 'collapseNav'))
    button.title = button.getAttribute('aria-label')!
    // The column on screen: the child of X's fixed layer, which holds the logo, the items and the
    // account button. It is positioned, so the button sits in its top right corner.
    let column = document.querySelector('header[role="banner"] nav')
    while (column?.parentElement && getComputedStyle(column.parentElement).position !== 'fixed') column = column.parentElement
    if (!column?.parentElement) return
    if (button.parentElement !== column) column.prepend(button)
    // Where X draws the narrow navigation itself its items have no labels: nothing to switch.
    button.hidden = !values.enabled || (!narrow && !column.querySelector('nav a [dir]'))
  }
  onPageChange(sync)
  store.subscribe(sync)
}
