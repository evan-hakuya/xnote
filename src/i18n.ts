const messages = {
  en: {
    settings: 'xnote settings',
    close: 'Close',
    hideSide: 'Hide',
    showSide: 'Show',
    enabled: 'Enable xnote',
    enabledHint: 'Turn off to restore the original X.',
    masonryHome: 'Masonry on Home',
    masonryProfile: 'Masonry on profiles',
    masonrySearch: 'Masonry on search',
    detailOverlay: 'Open posts in a popup',
    hoverPlay: 'Play videos under the pointer only',
    cardMinWidth: 'Minimum card width (px)',
    cardGap: 'Card gap (px)',
    masonryBroken: 'Masonry is off: X changed its internals. xnote needs an update.',
  },
  'zh-Hans': {
    settings: 'xnote 设置',
    close: '关闭',
    hideSide: '隐藏',
    showSide: '显示',
    enabled: '启用 xnote',
    enabledHint: '关闭后 X 完全恢复原样。',
    masonryHome: '首页瀑布流',
    masonryProfile: '个人主页瀑布流',
    masonrySearch: '搜索页瀑布流',
    detailOverlay: '详情浮层',
    hoverPlay: '鼠标悬停时才播放视频',
    cardMinWidth: '卡片最小宽度（像素）',
    cardGap: '卡片间距（像素）',
    masonryBroken: '瀑布流已停用：X 的内部实现变了，xnote 需要更新。',
  },
  'zh-Hant': {
    settings: 'xnote 設定',
    close: '關閉',
    hideSide: '隱藏',
    showSide: '顯示',
    enabled: '啟用 xnote',
    enabledHint: '關閉後 X 完全恢復原樣。',
    masonryHome: '首頁瀑布流',
    masonryProfile: '個人檔案瀑布流',
    masonrySearch: '搜尋頁瀑布流',
    detailOverlay: '詳情浮層',
    hoverPlay: '滑鼠懸停時才播放影片',
    cardMinWidth: '卡片最小寬度（像素）',
    cardGap: '卡片間距（像素）',
    masonryBroken: '瀑布流已停用：X 的內部實作變了，xnote 需要更新。',
  },
}

export type Lang = keyof typeof messages
export type MessageKey = keyof (typeof messages)['en']

export function pickLang(lang: string): Lang {
  const tag = lang.toLowerCase()
  if (/^zh-(hant|tw|hk|mo)/.test(tag)) return 'zh-Hant'
  if (tag.startsWith('zh')) return 'zh-Hans'
  return 'en'
}

/** Follows the language of the X interface. */
export const t = (key: MessageKey) => messages[pickLang(document.documentElement.lang)][key]
