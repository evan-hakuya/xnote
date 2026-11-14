import { installHoverPlay } from './hoverplay.ts'
import { installPanel } from './panel.ts'
import { installMasonry } from './masonry.ts'
import { installOverlay } from './overlay.ts'
import { createStore } from './settings.ts'

const store = createStore(localStorage)

// Every xnote style rule is scoped under this class, so the master switch restores the original X.
store.subscribe((values) => document.documentElement.classList.toggle('xnote-on', values.enabled))

const masonry = installMasonry(store)
installOverlay(store)
installHoverPlay(store)
installPanel(store, () => (masonry.isBroken() ? 'masonryBroken' : null))
