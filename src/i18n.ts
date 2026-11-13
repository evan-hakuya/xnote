const messages = {
  en: {
    settings: 'xnote settings',
    close: 'Close',
    enabled: 'Enable xnote',
    enabledHint: 'Turn off to restore the original X.',
    masonryHome: 'Masonry on Home',
    masonryProfile: 'Masonry on profiles',
    masonrySearch: 'Masonry on search',
    cardMinWidth: 'Minimum card width (px)',
    cardGap: 'Card gap (px)',
    masonryBroken: 'Masonry is off: X changed its internals. xnote needs an update.',
  },
  'zh-Hans': {
    settings: 'xnote 设置',
    close: '关闭',
    enabled: '启用 xnote',
    enabledHint: '关闭后 X 完全恢复原样。',
    masonryHome: '首页瀑布流',
    masonryProfile: '个人主页瀑布流',
    masonrySearch: '搜索页瀑布流',
    cardMinWidth: '卡片最小宽度（像素）',
    cardGap: '卡片间距（像素）',
    masonryBroken: '瀑布流已停用：X 的内部实现变了，xnote 需要更新。',
  },
  'zh-Hant': {
    settings: 'xnote 設定',
    close: '關閉',
    enabled: '啟用 xnote',
    enabledHint: '關閉後 X 完全恢復原樣。',
    masonryHome: '首頁瀑布流',
    masonryProfile: '個人檔案瀑布流',
    masonrySearch: '搜尋頁瀑布流',
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
