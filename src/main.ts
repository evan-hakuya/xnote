import { installFilters } from './filters.ts'
import { installHoverPlay } from './hoverplay.ts'
import { installPanel } from './panel.ts'
import { installMasonry } from './masonry.ts'
import { installOverlay } from './overlay.ts'
import { installResume } from './resume.ts'
import { createStore } from './settings.ts'
import { installTweaks } from './tweaks.ts'

const store = createStore(localStorage)
// First: X's first timeline request can come as soon as its code runs.
installResume(store)

// Every xnote style rule is scoped under this class, so the master switch restores the original X.
store.subscribe((values) => document.documentElement.classList.toggle('xnote-on', values.enabled))

const masonry = installMasonry(store)
installOverlay(store)
installHoverPlay(store)
installTweaks(store)
installFilters(store)
installPanel(store, () => (masonry.isBroken() ? 'masonryBroken' : null))
