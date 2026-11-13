const messages = {
  en: {
    settings: 'xnote settings',
    close: 'Close',
    enabled: 'Enable xnote',
    enabledHint: 'Turn off to restore the original X.',
  },
  'zh-Hans': {
    settings: 'xnote 设置',
    close: '关闭',
    enabled: '启用 xnote',
    enabledHint: '关闭后 X 完全恢复原样。',
  },
  'zh-Hant': {
    settings: 'xnote 設定',
    close: '關閉',
    enabled: '啟用 xnote',
    enabledHint: '關閉後 X 完全恢復原樣。',
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
