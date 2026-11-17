/**
 * The React fibers from a DOM node up to the root. X's page data hangs on their props. This
 * is X's private structure: check everything read from it, and have a path that works without.
 */
export function fibers(element: object) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'))
  const chain: any[] = []
  for (let fiber = key ? (element as any)[key] : null; fiber && chain.length < 300; fiber = fiber.return) chain.push(fiber)
  return chain
}

/** X's floating new-post pill and the inline control are the same timeline action. */
export function isNewPostsControl(target: Element | null) {
  if (target?.closest('[data-testid="pillLabel"]')) return true
  const cell = target?.closest('[data-testid="cellInnerDiv"]')
  return !!cell && !cell.querySelector('article') && fibers(cell).some((fiber) => fiber.memoizedProps?.item?.id === 'newEntriesItem')
}
