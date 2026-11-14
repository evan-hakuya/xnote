export const defaults = {
  enabled: true,
  masonryHome: true,
  masonryProfile: true,
  masonrySearch: true,
  detailOverlay: true,
  hoverPlay: false,
  cardMinWidth: 280,
  cardGap: 12,
  // General switches. The defaults are the values the owner had in Control Panel for Twitter.
  hideGrok: true,
  hidePremiumNav: true,
  hideConnectNav: true,
  hideCreatorStudioNav: true,
  hideBusinessNav: true,
  hideAdsNav: true,
  hideJobsNav: true,
  hideMoneyNav: true,
  hideChatDrawer: true,
  hideViews: true,
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
