import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'

// Tampermonkey checks the small meta file and downloads the script from the latest GitHub release.
const RELEASE = 'https://github.com/evan-hakuya/xnote/releases/latest/download'

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'xnote',
        namespace: 'https://github.com/evan-hakuya/xnote',
        description: 'Adjust the features and layout of x.com',
        license: 'MIT',
        match: ['https://x.com/*', 'https://twitter.com/*'],
        'run-at': 'document-start',
        // The script must run in the page context to reach X's React internals (ADR-0002). A grant
        // makes the manager wrap the script; "raw" keeps it in the page all the same.
        grant: ['GM_registerMenuCommand'],
        sandbox: 'raw',
        homepageURL: 'https://github.com/evan-hakuya/xnote',
        supportURL: 'https://github.com/evan-hakuya/xnote/issues',
        updateURL: `${RELEASE}/xnote.meta.js`,
        downloadURL: `${RELEASE}/xnote.user.js`,
      },
      build: { fileName: 'xnote.user.js', metaFileName: true },
    }),
  ],
})
