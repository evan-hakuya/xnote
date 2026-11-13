const listeners: (() => void)[] = []
let queued = false

/** Runs every page listener on the next frame. Many calls in one frame run them once. */
export function queuePageCheck() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    for (const listener of listeners) listener()
  })
}

/** Calls `listener` after X changes the page. X is a single-page app, so this is the only signal. */
export function onPageChange(listener: () => void) {
  if (!listeners.length) new MutationObserver(queuePageCheck).observe(document, { childList: true, subtree: true })
  listeners.push(listener)
}

export function addStyle(css: string) {
  // <head> may not exist yet at document-start.
  document.documentElement.append(Object.assign(document.createElement('style'), { textContent: css }))
}
