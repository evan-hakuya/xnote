import { t } from './i18n.ts'
import { addStyle, onPageChange } from './page.ts'
import { feedKind } from './route.ts'
import type { Store } from './settings.ts'

type Resume = { keepsHere(): boolean; clearHere(): Promise<unknown> }

// Arrow up and a circular arrow, drawn on X's 24 × 24 grid.
const UP = 'M12 3.59l7.457 7.45-1.414 1.42L13 7.41V21h-2V7.41l-5.043 5.05-1.414-1.42L12 3.59z'
const REFRESH =
  'M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.86-2.55 7.75-6h-2.08c-.82 2.33-3.04 4-5.67 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35C16.2 4.9 14.21 4 12 4z'

// X's own floating buttons (the chat drawer): 55px, 16px corners, frosted page colour. Measured.
// The tooltip is X's: black at 80%, white 11px text. The dock sits above the chat drawer; tweaks.ts
// moves it down when that drawer is hidden.
const CSS = `
#xnote-dock { position: fixed; right: 20px; bottom: 79px; z-index: 1; display: flex; flex-direction: column; gap: 12px; }
#xnote-dock[hidden], html.xnote-sheet #xnote-dock { display: none; }
#xnote-dock button {
  position: relative; width: 55px; height: 55px; display: grid; place-items: center; padding: 0; cursor: pointer;
  border-radius: 16px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
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
  // Only the page moves: X asks for newer posts at the top as it always does, and shows its pill.
  button(UP, t('backToTop'), () => scrollTo(0, 0))
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
    const kind = feedKind(location.pathname)
    dock.hidden = !store.get().enabled || kind === null || kind === 'keep'
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
