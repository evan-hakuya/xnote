import { onPageChange } from './page.ts'
import type { Settings, Store } from './settings.ts'

// The general switches. Selectors and feature names follow Control Panel for Twitter
// (MIT, Jonny Buchanan), rewritten to work without the page marks that its script adds.
const NAV = 'header[role="banner"] nav'
const MENU = '[role="menu"]'
const hide = (...selectors: string[]) => `${selectors.join(',\n')} { display: none !important; }`
const navItem = (link: string) => hide(`${NAV} ${link}`, `${MENU} ${link}`)

const X_LOGO =
  'M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z'
const BIRD_LOGO =
  'M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z'

type Switch = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

// X writes "color-scheme" on <html>, so CanvasText and Canvas are the theme's text and page
// colours without knowing which theme is on.
const FOLLOW = '[role="button"][data-testid$="-follow"]'
const FOLLOWING = '[role="button"][data-testid$="-unfollow"]:not(:hover)'

const rules: Partial<Record<Switch, string>> = {
  hideGrok: hide(
    `${NAV} a[href$="/i/grok"]`,
    `${MENU} a[href="/i/grok"]`,
    'div[data-testid="GrokDrawer"]',
    'button[aria-label^="Grok "]', // "Grok actions" on a post, in every language
    'button[data-testid="grokImgGen"]',
    '[data-testid="tweet"] [data-testid^="followups_"]',
    '[data-testid="tweet"] [data-testid^="followups_"] + nav',
    '[data-testid="tweet"] a[href="/i/grok"]',
  ),
  hidePremiumNav: navItem('a[href^="/i/premium_sign_up"]'),
  hideConnectNav: navItem('a:is([href$="/i/connect_people"], [href$="/i/follow_people"])'),
  hideCreatorStudioNav: navItem('a[href$="/creators/studio"]'),
  hideBusinessNav: navItem('a:is([href^="/i/premium-business"], [href^="/i/verified-orgs-signup"])'),
  hideAdsNav: navItem('a:is([href*="ads.twitter.com"], [href*="ads.x.com"])'),
  hideJobsNav: navItem('a[href="/jobs"]'),
  hideMoneyNav: hide(
    `${NAV} a[href="/i/money"]`,
    `${MENU} a[href="/i/money"]`,
    '[data-testid="ownProfilePaymentsButton"]',
    '[data-testid="ownProfilePaymentsButtonWithBalance"]',
  ),
  // Hidden, not removed: X keeps using the drawer's node.
  hideChatDrawer: 'div:is([data-testid="DMDrawer"], [data-testid="chat-drawer-root"]) { visibility: hidden; }',
  hideViews: hide(
    '[data-testid="tweet"][tabindex="0"] [role="group"] > div:has(> a[href$="/analytics"])',
    '[aria-modal="true"] > div > div:first-of-type [role="group"] > div:has(> a[href$="/analytics"])',
  ),
  hideViewActivity: hide(`${MENU} a[href$="/quotes"]`),
  hideUpsells: hide(
    `${MENU} a[href="/i/account_analytics"]`,
    '[role="menuitem"][data-testid="highlightUpsell"]',
    '[role="menuitem"][data-testid="editWithPremium"]',
    '[data-testid="verified_profile_upsell"]',
    '[data-testid="verified_profile_visitor_upsell"]',
    '[data-testid="profileAnalyticsUpsell"]',
    '[data-testid="analytics-preview"]',
    '[aria-live="polite"][role="status"]:has(a[href^="/i/premium_sign_up"])',
    '[data-testid="sidebarColumn"] div:has(> aside[role="complementary"] a[href^="/i/premium_sign_up"])',
  ),
  // The sidebar is a list of sections and the search box is the first one.
  hideSidebarContent: hide('[data-testid="sidebarColumn"] div:has(> div:first-child form[role="search"]) > div:not(:first-child)'),
  birdLogo: `svg path[d="${X_LOGO}"] { fill: rgb(29, 155, 240); d: path("${BIRD_LOGO}"); }`,
  // The labels get the page's base font size (X writes it on <html>) and the normal weight.
  // The xnote entry is inside the navigation, so this covers it too.
  navNormalFont: `${NAV} div[dir]:not([aria-live]) span, ${NAV} span[style] > span { font-size: 1rem !important; font-weight: normal !important; }`,
  menuNormalFont: '[data-testid="Dropdown"] [role="menuitem"] [dir] { font-weight: normal; }',
  monochromeFollow: `
${FOLLOWING} { border-color: transparent !important; background-color: CanvasText !important; }
${FOLLOWING} > :is(div, span) { color: Canvas !important; }
${FOLLOW} { border-color: color-mix(in srgb, CanvasText 30%, Canvas) !important; background-color: transparent !important; }
${FOLLOW} > :is(div, span) { color: CanvasText !important; }
${FOLLOW}:hover { background-color: color-mix(in srgb, CanvasText 10%, transparent) !important; }`,
}

// X asks its feature switches before it draws. Answering "off" brings back the older design.
const flags: Record<string, Switch> = {
  rweb_media_carousel_enabled: 'mediaGrid', // several images in a grid, not in a carousel
  responsive_web_native_emojis_enabled: 'twemoji',
}

/** X's feature switches, from the props of its root React element (private, checked). */
export function featureSwitches(root: object | null | undefined) {
  const key = root ? Object.keys(root).find((name) => name.startsWith('__reactProps')) : undefined
  const switches = key ? (root as any)[key]?.children?.props?.children?.props?.contextProviderProps?.featureSwitches : null
  return typeof switches?.isTrue === 'function' ? (switches as { isTrue(flag: string): boolean; xnote?: true }) : null
}

export function installTweaks(store: Store) {
  const style = document.createElement('style')
  document.documentElement.append(style) // <head> may not exist yet at document-start
  store.subscribe((values) => {
    const on = (Object.keys(rules) as Switch[]).filter((key) => values.enabled && values[key])
    style.textContent = on.map((key) => rules[key]).join('\n')
  })

  onPageChange(() => {
    const switches = featureSwitches(document.getElementById('react-root')?.firstElementChild)
    if (!switches || switches.xnote) return
    switches.xnote = true
    const isTrue = switches.isTrue
    switches.isTrue = (flag) => {
      const key = flags[flag]
      return key && store.get().enabled && store.get()[key] ? false : isTrue.call(switches, flag)
    }
  })
}
