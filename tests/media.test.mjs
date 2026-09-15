/**
 * What gets handed to ffmpeg, checked without running it.
 *
 * Every audio and video tool is a few arguments around one binary, and the
 * arguments are where the mistakes hide: a flag in the wrong place produces a
 * file that plays with no sound, or spends two minutes re-encoding something
 * it could have copied in one second. None of that shows up as an error — it
 * shows up as a bad file. So the arguments are asserted directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const media = await import(pathToFileURL(path.join(ROOT, 'shared/media.ts')).href)

/** The order of a flag pair, so `['-crf','30']` can be asked about as a unit. */
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1]

test('compression caps resolution as well as quality, and never upscales', () => {
  for (const quality of ['telegram', 'email', 'balanced', 'high']) {
    const args = media.compressVideoArgs(quality)
    const scale = valueAfter(args, '-vf')
    assert.match(scale, /^scale='min\(\d+,iw\)':-2$/, `${quality}: a smaller video must not be blown up`)
    assert.match(scale, /:-2$/, `${quality}: height must round to an even number or H.264 refuses it`)
    assert.ok(Number(valueAfter(args, '-crf')) >= 23)
    assert.equal(valueAfter(args, '-movflags'), '+faststart', `${quality}: must start playing before it finishes downloading`)
  }

  // Smaller targets have to be both softer and narrower than larger ones.
  const email = media.compressVideoArgs('email')
  const high = media.compressVideoArgs('high')
  assert.ok(Number(valueAfter(email, '-crf')) > Number(valueAfter(high, '-crf')))
  assert.ok(Number(/min\((\d+),/.exec(valueAfter(email, '-vf'))[1]) < Number(/min\((\d+),/.exec(valueAfter(high, '-vf'))[1]))
})

test('trimming copies when it can and re-encodes when asked to be exact', () => {
  const fast = media.trimArgs({ start: 10, end: 25, accurate: false })
  assert.deepEqual(fast.slice(0, 4), ['-ss', '10', '-t', '15'], 'duration, not end time')
  assert.ok(fast.includes('-c') && fast.includes('copy'), 'a keyframe cut should not re-encode')

  const exact = media.trimArgs({ start: 10, end: 25, accurate: true })
  assert.ok(exact.includes('libx264'), 'frame-accurate means re-encoding')
  assert.ok(!exact.includes('copy'))

  // A backwards or zero-length selection must still produce a valid command.
  const degenerate = media.trimArgs({ start: 30, end: 12, accurate: false })
  assert.ok(Number(valueAfter(degenerate, '-t')) > 0, 'ffmpeg rejects a negative duration')
})

test('audio conversion strips video first, and flac carries no bitrate', () => {
  for (const format of ['mp3', 'wav', 'ogg', 'm4a', 'flac']) {
    const args = media.convertAudioArgs(format)
    assert.equal(args[0], '-vn', `${format}: album art would be encoded as a video stream`)
  }
  assert.ok(!media.convertAudioArgs('flac').includes('-b:a'), 'lossless has no bitrate to set')
  assert.equal(valueAfter(media.convertAudioArgs('mp3'), '-c:a'), 'libmp3lame')
  assert.equal(valueAfter(media.convertAudioArgs('wav'), '-c:a'), 'pcm_s16le')
})

test('extracting audio drops the picture before the encoder sees it', () => {
  const args = media.extractAudioArgs()
  assert.equal(args[0], '-vn')
  assert.equal(valueAfter(args, '-c:a'), 'libmp3lame')
})

test('a container change copies the streams; a codec change cannot', () => {
  const remux = media.toMp4Args(true)
  assert.ok(remux.includes('copy'), 'H.264 in a .mkv is an MP4 in the wrong box')
  assert.equal(valueAfter(remux, '-movflags'), '+faststart')
  assert.ok(!remux.includes('libx264'))

  const encode = media.toMp4Args(false)
  assert.ok(encode.includes('libx264') && encode.includes('aac'))
})

test('the GIF builds its own palette, or it comes out looking like 1997', () => {
  const args = media.gifArgs({ fps: 12, width: 480 })
  const filter = valueAfter(args, '-vf')
  assert.match(filter, /palettegen/, 'without a generated palette every frame is quantised to 216 colours')
  assert.match(filter, /paletteuse/)
  assert.match(filter, /fps=12/)
  assert.match(filter, /min\(480,iw\)/)
  assert.equal(valueAfter(args, '-loop'), '0', 'a GIF that plays once is not what anyone wants')

  // Seeking is optional and must not appear when it was not asked for.
  assert.ok(!media.gifArgs({ fps: 10, width: 320 }).includes('-ss'))
  assert.equal(valueAfter(media.gifArgs({ fps: 10, width: 320, start: 5, duration: 3 }), '-ss'), '5')
})

test('the filename ffmpeg sees keeps the extension, because it picks the demuxer', () => {
  assert.equal(media.inputName('Отпуск 2026.MOV'), 'input.mov')
  assert.equal(media.inputName('ovoz.ogg'), 'input.ogg')
  assert.equal(media.inputName('no-extension'), 'input.mp4')
  assert.equal(media.inputName('video.webm'), 'input.webm')
})
