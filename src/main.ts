import { installPanel } from './panel.ts'
import { createStore } from './settings.ts'

const store = createStore(localStorage)

// Every xnote style rule is scoped under this class, so the master switch restores the original X.
store.subscribe((values) => document.documentElement.classList.toggle('xnote-on', values.enabled))

installPanel(store)
