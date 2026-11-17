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
  position: absolute; top: 8px; right: 4px; z-index: 1; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%;
  display: grid; place-items: center; background: transparent; color: inherit; cursor: pointer; opacity: 0.6;
}
#xnote-nav-toggle:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
#xnote-nav-toggle[hidden] { display: none; }
#xnote-nav-toggle svg { width: 18px; height: 18px; fill: currentColor; }
/* The narrow column has little room beside the logo: a smaller button in its corner, clear of the bird. */
html.xnote-nav-narrow #xnote-nav-toggle { top: 4px; right: 0; width: 20px; height: 20px; }
html.xnote-nav-narrow #xnote-nav-toggle svg { width: 14px; height: 14px; }
html.xnote-nav-narrow #xnote-nav-toggle svg { transform: scaleX(-1); }
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
