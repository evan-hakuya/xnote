import { installPanel } from './panel.ts'
import { installMasonry } from './masonry.ts'
import { createStore } from './settings.ts'

const store = createStore(localStorage)

// Every xnote style rule is scoped under this class, so the master switch restores the original X.
store.subscribe((values) => document.documentElement.classList.toggle('xnote-on', values.enabled))

const masonry = installMasonry(store)
installPanel(store, () => (masonry.isBroken() ? 'masonryBroken' : null))
