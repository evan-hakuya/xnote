export type FeedKind = 'home' | 'profile' | 'search'

// First path segments that are X pages, not user names.
const RESERVED = new Set([
  'home', 'explore', 'search', 'hashtag', 'notifications', 'messages', 'compose', 'settings', 'i',
  'jobs', 'communities', 'intent', 'share', 'login', 'logout', 'signup', 'account', 'tos', 'privacy',
])
const PROFILE_TABS = new Set(['with_replies', 'highlights', 'articles', 'likes'])
// Routes that X shows as a layer above the page the user came from.
const LAYER = /^\/(compose\/|intent\/|i\/keyboard_shortcuts|i\/display|[^/]+\/(photo|header_photo)$|.+\/status\/\d+\/(photo|video)\/)/

/**
 * Says which kind of feed a path shows. `'keep'` means a layer route: the page below it is
 * unknown from the path alone, so the caller must leave its current state as it is.
 */
export function feedKind(pathname: string): FeedKind | 'keep' | null {
  if (LAYER.test(pathname)) return 'keep'
  const [first, second, ...rest] = pathname.split('/').filter(Boolean)
  if (first === 'home' && !second) return 'home'
  if (first === 'search' || first === 'hashtag') return 'search'
  if (!first || RESERVED.has(first) || rest.length) return null
  return !second || PROFILE_TABS.has(second) ? 'profile' : null
}
