export const defaults = {
  enabled: true,
  masonryHome: true,
  masonryProfile: true,
  masonrySearch: true,
  hideThreadReplies: false,
  detailOverlay: true,
  sheetToReplies: true, // the popup of a text or article post opens its right side at the replies
  hoverPlay: 0,
  mediaCtrlPreview: false,
  mediaHoverPreview: 0,
  dockSearch: true,
  dockTop: true,
  dockRefresh: true,
  navNarrow: false, // also switched by a button at the top right of the navigation
  resumeForYou: false,
  resumeFollowing: false,
  resumeLists: false,
  cardMinWidth: 380, // the action bar of nearly every post fits at this width without dropping a count
  cardGap: 12,
  wideLayout: false,
  // General switches. The defaults are the values the owner had in Control Panel for Twitter,
  // except the navigation items: those stay visible until the user hides them.
  hideGrok: false,
  hidePremiumNav: false,
  hideConnectNav: false,
  hideCreatorStudioNav: false,
  hideBusinessNav: false,
  hideAdsNav: false,
  hideJobsNav: false,
  hideMoneyNav: false,
  hideExploreNav: false,
  hideNotificationsNav: false,
  hideMessagesNav: false,
  hideCallsNav: false,
  hideHistoryNav: false,
  hideProfileNav: false,
  hideListsNav: false,
  hideCommunitiesNav: false,
  hideSpacesNav: false,
  hideXnoteNav: false, // only takes effect when the userscript manager's menu has the entry
  hideChatDrawer: true,
  hideViews: true,
  hideReplyButton: false,
  hideRetweetButton: false,
  hideLikeButton: false,
  hideBookmarkButton: false,
  hideShareButton: false,
  hideViewActivity: true,
  shareImage: true, // "Share as image" in a post's ··· menu
  // The choices of the share window, remembered between uses; they are not in the settings window.
  shareReply: true,
  shareRetweet: true,
  shareLike: true,
  shareViews: true,
  shareBookmark: false,
  shareShare: false,
  shareGrid: '', // '', 'on' or 'off': '' follows mediaGrid
  shareAllImages: false,
  shareAllColumn: false, // all images in a column instead of a row
  shareHideReplies: '', // '', 'on' or 'off': '' follows hideThreadReplies
  shareHideQuote: '', // '', 'on' or 'off': '' follows hideQuotes
  hideUpsells: true,
  hideSidebarContent: true,
  birdLogo: true,
  mediaGrid: true,
  navNormalFont: true,
  menuNormalFont: true,
  monochromeFollow: true,
  twemoji: true,
  premiumCheck: true,
  bypassAge: true,
  disableNfl: true,
  hideExplore: true,
  hideRetweets: true,
  hideSuggested: true,
  hidePrompts: true,
  hideMorePosts: true,
  hideUnavailableQuotes: true,
  hideQuotes: false, // the quoted post inside a post; the post itself stays
  mutedQuotes: 'KKong_1p', // account names, separated by spaces or commas
}

export type Settings = typeof defaults
export type Store = ReturnType<typeof createStore>

const KEY = 'xnote:settings'

/** The settings in `stored`, with defaults for the rest; and how many of them it held. */
function pick(stored: any) {
  const values: Record<string, unknown> = { ...defaults }
  let found = 0
  for (const [key, fallback] of Object.entries(defaults)) {
    if (typeof stored?.[key] !== typeof fallback) continue
    values[key] = stored[key]
    found++
  }
  return { values: values as Settings, found }
}

function read(storage: Pick<Storage, 'getItem'>): Settings {
  try {
    return pick(JSON.parse(storage.getItem(KEY) ?? '{}')).values
  } catch {
    return { ...defaults } // corrupt stored data
  }
}

// shortcut: localStorage is lost when the user clears site data, move to GM storage if that hurts
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const values = read(storage)
  const listeners = new Set<(values: Settings) => void>()
  const save = () => {
    storage.setItem(KEY, JSON.stringify(values))
    for (const listener of listeners) listener(values)
  }
  return {
    get: () => values,
    set<K extends keyof Settings>(key: K, value: Settings[K]) {
      values[key] = value
      save()
    },
    /** Replaces every setting with exported ones; throws, changing nothing, unless the text holds some. Returns how many it held. */
    load(text: string) {
      const parsed = JSON.parse(text)
      const { values: next, found } = pick(parsed)
      if (!found || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not xnote settings')
      Object.assign(values, next)
      save()
      return found
    },
    /** Calls the listener now and after every change. */
    subscribe(listener: (values: Settings) => void) {
      listeners.add(listener)
      listener(values)
    },
  }
}
