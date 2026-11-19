/** Let the browser scroll X's existing slides. X still owns navigation and video playback. */
export function installGallerySwipe(list: HTMLElement, carousel: HTMLElement) {
  const viewport = list.parentElement!
  const page = () => Number(location.pathname.split('/').at(-1)) - 1
  let selected = page()
  let target = selected
  let requested: number | undefined

  const align = () => { viewport.scrollLeft = selected * viewport.clientWidth }
  const advance = () => {
    if (selected === target) return
    const step = Math.sign(target - selected)
    const side = step > 0 ? 'Right' : 'Left'
    const arrow = carousel.querySelector<HTMLButtonElement>(`[data-testid="Carousel-Nav${side}"] button:not(:disabled)`)
    if (arrow) {
      requested = selected + step
      arrow.click()
    } else {
      target = selected
      align()
    }
  }
  const sync = () => {
    const next = page()
    if (next === selected || next < 0 || next >= list.children.length) return
    selected = next
    if (next === requested) {
      requested = undefined
      advance()
    } else {
      // X changed the slide through its keyboard, buttons or browser history.
      requested = undefined
      target = next
      align()
    }
  }
  const settled = () => {
    if (!viewport.clientWidth || !list.isConnected) return
    target = Math.round(viewport.scrollLeft / viewport.clientWidth)
    if (requested === undefined) advance()
  }
  viewport.classList.add('xnote-post-media-track')
  align()
  // X animates the list in place when its keyboard or arrows change the URL.
  const observer = new MutationObserver(sync)
  observer.observe(list, { attributes: true, attributeFilter: ['style'] })
  viewport.addEventListener('scrollend', settled)
  return {
    list,
    sync,
    stop() {
      observer.disconnect()
      viewport.removeEventListener('scrollend', settled)
      viewport.classList.remove('xnote-post-media-track')
      viewport.scrollLeft = 0
    },
  }
}
