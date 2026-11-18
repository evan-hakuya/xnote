import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entityMedia } from './media-preview.ts'
import { defaults } from './settings.ts'

test('media preview requires an explicit opt-in for either trigger', () => {
  assert.equal(defaults.mediaCtrlPreview, false)
  assert.equal(defaults.mediaHoverPreview, false)
})

test('preview plays the highest bitrate MP4 supplied by X, including looping GIFs', () => {
  const poster = 'https://pbs.twimg.com/poster'
  const variants = [
    { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/stream' },
    { content_type: 'video/mp4', url: 'https://video.twimg.com/low', bitrate: 100 },
    { content_type: 'video/mp4', url: 'https://video.twimg.com/high', bitrate: 900 },
  ]
  assert.deepEqual(entityMedia({ type: 'animated_gif', media_url_https: poster, video_info: { variants } }),
    { kind: 'video', url: variants[2]!.url, alt: '', poster, loop: true })
  assert.equal(entityMedia({ type: 'video', media_url_https: poster }), undefined)
  assert.deepEqual(entityMedia({ type: 'photo', media_url_https: poster, ext_alt_text: 'A bird' }),
    { kind: 'photo', url: poster, alt: 'A bird' })
})
