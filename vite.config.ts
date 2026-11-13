import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'

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
        // No GM APIs: the script must run in the page context to reach X's React internals (ADR-0002).
        grant: 'none',
      },
      build: { fileName: 'xnote.user.js' },
    }),
  ],
})
