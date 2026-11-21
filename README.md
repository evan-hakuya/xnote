# xnote

A userscript that turns the x.com timeline into a masonry feed with RedNote-style popups, and brings back classic Twitter.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [xnote.user.js](https://github.com/evan-hakuya/xnote/releases/latest/download/xnote.user.js) and click Install.

Tampermonkey checks for updates on its own. Settings are under **xnote** in the X navigation, or in the Tampermonkey menu.

## Release

```sh
pnpm version patch   # or minor; updates package.json, commits, and tags vX.Y.Z
git push --follow-tags
```

The tag starts `.github/workflows/release.yml`: it tests, builds, and attaches `xnote.user.js` and `xnote.meta.js` to a GitHub release.
