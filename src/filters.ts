import { BIRD_ICON, BIRD_ICON_UNREAD } from './classic-assets.ts'
import { pickLang, type Lang } from './i18n.ts'
import { onPageChange } from './page.ts'
import { fibers } from './react.ts'
import type { Store } from './settings.ts'

/**
 * What a timeline entry is, for the switches that hide entries. `entryId` is X's own id of the
 * entry, such as "who-to-follow-123", and `tweet` is X's data of the post, if it is one.
 */
export function kindsOf(entryId: string, tweet: any, unavailableQuote: boolean) {
  const kinds: string[] = []
  if (/who-to-(follow|subscribe)|community-to-join|suggest/i.test(entryId)) kinds.push('suggest')
  if (/messageprompt|inlineprompt|relevanceprompt/i.test(entryId)) kinds.push('prompt')
  if (/tweetdetailrelatedtweets/i.test(entryId)) kinds.push('more')
  if (tweet?.retweeted_status) kinds.push('retweet')
  if (unavailableQuote) kinds.push('tombstone')
  const quoted = tweet?.quoted_status?.user?.screen_name
  return { kinds, quoted: typeof quoted === 'string' ? quoted.toLowerCase() : undefined }
}

// The words X changed when it stopped being Twitter, by interface language.
const WORDS: Record<Lang, [RegExp, string][]> = {
  'zh-Hans': [[/发帖/g, '发推'], [/转帖/g, '转推'], [/帖子/g, '推文']],
  'zh-Hant': [[/貼文/g, '推文'], [/轉發/g, '轉推']],
  en: [
    [/\bReposts\b/g, 'Retweets'], [/\bRepost\b/g, 'Retweet'], [/\breposted\b/g, 'Retweeted'],
    [/\bPosts\b/g, 'Tweets'], [/\bPost\b/g, 'Tweet'], [/\bposts\b/g, 'Tweets'], [/\bpost\b/g, 'Tweet'],
  ],
}

export function classicWords(text: string, lang: Lang) {
  return WORDS[lang].reduce((result, [from, to]) => result.replace(from, to), text)
}

// Where X's own wording is. Never the text of posts, names or anything else a person wrote:
// a heading can be a person's name, so a heading only counts when it is one of the words alone.
const TITLE = '[data-testid="primaryColumn"] h2[role="heading"]'
const WORDING = [
  '[data-testid="SideNav_NewTweet_Button"]',
  '[data-testid="tweetButtonInline"]',
  '[data-testid="tweetButton"]',
  TITLE,
  `${TITLE} + div`,
  '[data-testid="primaryColumn"] [role="tablist"] [role="tab"]',
  '[data-testid="pillLabel"]',
  '[data-testid="cellInnerDiv"]:not(:has(article)) [role="button"]',
  '#layers [role="menuitem"]',
].join(',')

export function installFilters(store: Store) {
  let xIcon: string | undefined // X's own favicon, to put back when the classic style goes off

  onPageChange(() => {
    const values = store.get()
    const classic = values.enabled && values.birdLogo

    // X shows unread notifications as "(3)" in the title and as a dot on the favicon.
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (icon) {
      if (!icon.href.startsWith('data:')) xIcon = icon.href
      const wanted = classic ? (/^\(\d/.test(document.title) ? BIRD_ICON_UNREAD : BIRD_ICON) : xIcon
      if (wanted && icon.href !== wanted) icon.href = wanted
    }
    if (!values.enabled) return

    // Mark each entry once with what it is. The style rules in tweaks.ts hide by these marks.
    for (const cell of document.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]:not([data-xnote])')) {
      const entryId = fibers(cell).map((fiber) => fiber.memoizedProps?.item?.data?.entryId).find((id) => typeof id === 'string')
      if (!entryId) continue
      const article = cell.querySelector('article')
      if (!article && cell.childElementCount === 0) continue // X has not filled the cell yet
      const tweet = article ? fibers(article).map((fiber) => fiber.memoizedProps?.tweet).find(Boolean) : undefined
      // X shows a quoted post from a blocked or muted account as an article inside the article.
      const { kinds, quoted } = kindsOf(entryId, tweet, article?.querySelector('article') != null)
      cell.dataset.xnote = kinds.join(' ')
      if (quoted) cell.dataset.xnoteQuote = quoted
    }

    if (!classic) return
    if (/(^| \/ )X$/.test(document.title)) document.title = document.title.replace(/X$/, 'Twitter')
    const lang = pickLang(document.documentElement.lang)
    for (const element of document.querySelectorAll(WORDING)) {
      const whole = element.textContent?.trim() ?? ''
      if (element.matches(TITLE) && !WORDS[lang].some(([from]) => whole.replace(from, '') === '')) continue
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = classicWords(node.nodeValue ?? '', lang)
        if (text !== node.nodeValue) node.nodeValue = text
      }
    }
  })
}
