export const defaults = {
  enabled: true,
  masonryHome: true,
  masonryProfile: true,
  masonrySearch: true,
  detailOverlay: true,
  hoverPlay: false,
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
  mutedQuotes: 'KKong_1p', // account names, separated by spaces or commas
}

export type Settings = typeof defaults
export type Store = ReturnType<typeof createStore>

const KEY = 'xnote:settings'

function read(storage: Pick<Storage, 'getItem'>): Settings {
  const values: Record<string, unknown> = { ...defaults }
  try {
    const stored = JSON.parse(storage.getItem(KEY) ?? '{}')
    for (const [key, fallback] of Object.entries(defaults)) {
      if (typeof stored?.[key] === typeof fallback) values[key] = stored[key]
    }
  } catch {
    // Corrupt stored data: keep the defaults.
  }
  return values as Settings
}

// shortcut: localStorage is lost when the user clears site data, move to GM storage if that hurts
export function createStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const values = read(storage)
  const listeners = new Set<(values: Settings) => void>()
  return {
    get: () => values,
    set<K extends keyof Settings>(key: K, value: Settings[K]) {
      values[key] = value
      storage.setItem(KEY, JSON.stringify(values))
      for (const listener of listeners) listener(values)
    },
    /** Calls the listener now and after every change. */
    subscribe(listener: (values: Settings) => void) {
      listeners.add(listener)
      listener(values)
    },
  }
}
