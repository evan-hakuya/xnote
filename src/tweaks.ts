import { BIRD_COMPOSE, X_COMPOSE, X_LOGO_ALT } from './classic-assets.ts'
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
// The Home icon, selected and not selected: X's house, and Twitter's birdhouse.
const X_HOME = [
  'M10.059 2.593c1.175-.784 2.707-.784 3.882 0l6.5 4.333C21.415 7.575 22 8.668 22 9.838V18.5c0 1.933-1.567 3.5-3.5 3.5h-4.25v-5.25c0-1.243-1.007-2.25-2.25-2.25s-2.25 1.007-2.25 2.25V22H5.5C3.567 22 2 20.433 2 18.5V9.838c0-1.17.585-2.263 1.559-2.912l6.5-4.333z',
  'M20 9.838c0-.502-.25-.97-.668-1.248l-6.5-4.333c-.504-.336-1.16-.336-1.664 0l-6.5 4.333C4.251 8.868 4 9.336 4 9.838V18.5c0 .828.672 1.5 1.5 1.5h3v-3.5c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5V20h3c.828 0 1.5-.672 1.5-1.5V9.838zm2 8.662c0 1.933-1.567 3.5-3.5 3.5h-5v-5.5c0-.829-.672-1.5-1.5-1.5s-1.5.671-1.5 1.5V22h-5C3.567 22 2 20.433 2 18.5V9.838c0-1.17.585-2.263 1.559-2.912l6.5-4.333c1.175-.784 2.707-.784 3.882 0l6.5 4.333C21.415 7.575 22 8.668 22 9.838V18.5z',
]
const BIRD_HOME = [
  'M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM12 16.5c-1.933 0-3.5-1.567-3.5-3.5s1.567-3.5 3.5-3.5 3.5 1.567 3.5 3.5-1.567 3.5-3.5 3.5z',
  'M12 9c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4zm0 6c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zm0-13.304L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM19 19.5c0 .276-.224.5-.5.5h-13c-.276 0-.5-.224-.5-.5V8.429l7-4.375 7 4.375V19.5z',
]
// The badge that Control Panel for Twitter draws for a paid blue tick.
const PAID_TICK =
  'M16.5 3H2v18h15c3.038 0 5.5-2.46 5.5-5.5 0-1.4-.524-2.68-1.385-3.65-.08-.09-.089-.22-.023-.32.574-.87.908-1.91.908-3.03C22 5.46 19.538 3 16.5 3zm-.796 5.99c.457-.05.892-.17 1.296-.35-.302.45-.684.84-1.125 1.15.004.1.006.19.006.29 0 2.94-2.269 6.32-6.421 6.32-1.274 0-2.46-.37-3.459-1 .177.02.357.03.539.03 1.057 0 2.03-.35 2.803-.95-.988-.02-1.821-.66-2.109-1.54.138.03.28.04.425.04.206 0 .405-.03.595-.08-1.033-.2-1.811-1.1-1.811-2.18v-.03c.305.17.652.27 1.023.28-.606-.4-1.004-1.08-1.004-1.85 0-.4.111-.78.305-1.11 1.113 1.34 2.775 2.22 4.652 2.32-.038-.17-.058-.33-.058-.51 0-1.23 1.01-2.22 2.256-2.22.649 0 1.235.27 1.647.7.514-.1.997-.28 1.433-.54-.168.52-.526.96-.992 1.23z'
// A timeline entry that filters.ts marked with what it is.
const marked = (kind: string) => hide(`[data-testid="cellInnerDiv"][data-xnote~="${kind}"]`)
// The buttons that post. X made them black and white; on Twitter they had the accent colour.
const POST = ':is([data-testid="SideNav_NewTweet_Button"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"])'
const BLUE = '29 155 240'

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
  // The words, the page title and the favicon of the classic style are in filters.ts.
  birdLogo: `
svg path:is([d="${X_LOGO}"], [d="${X_LOGO_ALT}"]) { fill: rgb(${BLUE}); d: path("${BIRD_LOGO}"); }
svg path[d="${X_HOME[0]}"] { d: path("${BIRD_HOME[0]}"); }
svg path[d="${X_HOME[1]}"] { d: path("${BIRD_HOME[1]}"); }
[data-testid="SideNav_NewTweet_Button"] path[d="${X_COMPOSE}"] { d: path("${BIRD_COMPOSE}"); }
[data-testid="SideNav_NewTweet_Button"] path[clip-rule="evenodd"] { display: none; }
${POST} { background-color: rgb(${BLUE}) !important; }
${POST}:hover:not(:disabled) { background-color: rgb(${BLUE} / 0.8) !important; }
${POST} > div, ${POST} > div > svg { color: #fff !important; }`,
  // A gold tick (an organisation) has a gradient; every other tick here is taken as paid.
  premiumCheck: `svg[data-testid="icon-verified"]:not(:has(linearGradient)) path { d: path("${PAID_TICK}"); }`,
  hideRetweets: marked('retweet'),
  hideSuggested: marked('suggest'),
  hidePrompts: marked('prompt'),
  hideMorePosts: marked('more'),
  hideUnavailableQuotes: marked('tombstone'),
  // The tabs and the content of Explore, which leaves the search box.
  hideExplore: hide(
    'html.xnote-explore [data-testid="primaryColumn"] > div > div:first-of-type nav',
    'html.xnote-explore [data-testid="primaryColumn"] section > h1 + div[aria-label] > div',
  ),
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
  rweb_age_assurance_flow_enabled: 'bypassAge',
  responsive_web_nfl_enabled: 'disableNfl',
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
    // Account names are letters, digits and "_", so they are safe inside a selector.
    const muted = values.enabled ? values.mutedQuotes.toLowerCase().split(/[\s,@]+/).filter((name) => /^\w+$/.test(name)) : []
    const quotes = muted.length ? hide(...muted.map((name) => `[data-testid="cellInnerDiv"][data-xnote-quote="${name}"]`)) : ''
    style.textContent = [...on.map((key) => rules[key]), quotes].join('\n')
  })

  onPageChange(() => {
    document.documentElement.classList.toggle('xnote-explore', location.pathname.startsWith('/explore'))
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
