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

/* ---- the second wave of media tools ---- */

test('rotation turns the pixels, not the metadata that was ignored in the first place', () => {
  assert.equal(valueAfter(media.rotateArgs('right'), '-vf'), 'transpose=1')
  assert.equal(valueAfter(media.rotateArgs('left'), '-vf'), 'transpose=2')
  // 180° is two quarter turns; one `transpose` cannot express it.
  assert.equal(valueAfter(media.rotateArgs('half'), '-vf'), 'transpose=2,transpose=2')
  assert.equal(valueAfter(media.rotateArgs('hflip'), '-vf'), 'hflip')
  for (const how of ['right', 'left', 'half', 'hflip', 'vflip']) {
    assert.ok(media.rotateArgs(how).includes('-movflags'), `${how}: must stay streamable`)
  }
})

test('muting copies every stream it keeps, so nothing is re-encoded', () => {
  const args = media.muteArgs()
  assert.deepEqual(args, ['-c', 'copy', '-an'])
  // If an encoder ever appears here the tool has stopped being instant and
  // started being lossy, which is the whole point of it.
  assert.ok(!args.some(a => a.startsWith('libx264') || a === 'aac'))
})

test('resizing caps height instead of setting it, and keeps the aspect ratio', () => {
  for (const height of media.RESOLUTIONS) {
    const scale = valueAfter(media.resizeArgs(height), '-vf')
    assert.equal(scale, `scale=-2:'min(${height},ih)'`)
  }
  assert.ok(media.RESOLUTIONS.includes(720))
})

test('social presets fill, fit or blur — and only blur needs a filter graph', () => {
  for (const preset of ['story', 'square', 'portrait', 'wide']) {
    const { w, h } = media.SOCIAL_SIZES[preset]
    const crop = media.socialArgs(preset, 'crop')
    assert.ok(crop.includes('-vf'), `${preset}: a single chain is not a filter_complex`)
    assert.match(valueAfter(crop, '-vf'), new RegExp(`increase,crop=${w}:${h}`))

    const pad = media.socialArgs(preset, 'pad')
    assert.match(valueAfter(pad, '-vf'), new RegExp(`decrease,pad=${w}:${h}`))

    const blur = media.socialArgs(preset, 'blur')
    // Two copies of one input can only be expressed with split, which makes it
    // a graph rather than a chain; passing it to -vf fails outright.
    assert.ok(blur.includes('-filter_complex'), `${preset}: split needs -filter_complex`)
    const graph = valueAfter(blur, '-filter_complex')
    assert.match(graph, /split\[bg\]\[fg\]/)
    assert.match(graph, /gblur/)
    assert.match(graph, /overlay=\(W-w\)\/2:\(H-h\)\/2/)
  }
  // Stories are taller than they are wide, or they are not stories.
  assert.ok(media.SOCIAL_SIZES.story.h > media.SOCIAL_SIZES.story.w)
  assert.ok(media.SOCIAL_SIZES.wide.w > media.SOCIAL_SIZES.wide.h)
  assert.equal(media.SOCIAL_SIZES.square.w, media.SOCIAL_SIZES.square.h)
})

test('frame extraction is capped, or a long video becomes fifteen thousand files', () => {
  const args = media.framesArgs({ fps: 1, width: 1280, limit: 200 })
  assert.equal(valueAfter(args, '-frames:v'), '200')
  assert.match(valueAfter(args, '-vf'), /^fps=1,scale='min\(1280,iw\)':-2$/)
})

test('ffmpeg is never asked for JPEG frames, because its encoder crashes the core', () => {
  // The wasm mjpeg encoder corrupts memory on a 10-bit HEVC source and kills
  // the worker mid-run. JPG is made by the browser from PNG instead, so no
  // JPEG quality flag and no JPEG-only option may reach ffmpeg from here.
  const args = media.framesArgs({ fps: 2, width: 640, limit: 10 })
  assert.ok(!args.includes('-q:v'), 'a JPEG quality flag means mjpeg is back')
  assert.ok(!args.some(a => /mjpeg|yuvj/.test(a)))
})

test('merging normalises every input first, because concat refuses mismatches', () => {
  const graph = valueAfter(media.mergeVideoArgs({ count: 3, height: 720, audio: true }), '-filter_complex')
  // Each input scaled, padded and given a fixed frame rate before joining.
  for (const i of [0, 1, 2]) {
    assert.ok(graph.includes(`[${i}:v]scale=`), `input ${i} must be scaled to the common frame`)
    assert.ok(graph.includes(`[${i}:a]aformat=`), `input ${i} audio must be resampled`)
  }
  assert.match(graph, /concat=n=3:v=1:a=1/)
})

test('a silent clip in the batch makes the whole merge silent rather than failing', () => {
  const args = media.mergeVideoArgs({ count: 2, height: 720, audio: false })
  const graph = valueAfter(args, '-filter_complex')
  assert.match(graph, /concat=n=2:v=1:a=0/)
  assert.ok(!graph.includes('aformat'), 'no audio to normalise')
  // Mapping a stream that concat did not produce is an immediate failure.
  assert.ok(!args.includes('[a]'), 'must not map an audio stream that does not exist')
  assert.ok(!args.includes('-c:a'))
})

test('merged video lands on an even width, which H.264 requires', () => {
  for (const height of [360, 480, 720, 1080]) {
    const graph = valueAfter(media.mergeVideoArgs({ count: 2, height, audio: true }), '-filter_complex')
    const width = Number(/scale=(\d+):/.exec(graph)[1])
    assert.equal(width % 2, 0, `${height}p produced an odd width`)
  }
})

test('audio merge normalises sample rate, or the result plays at the wrong speed', () => {
  const graph = valueAfter(media.mergeAudioArgs(2), '-filter_complex')
  assert.match(graph, /\[0:a\]aformat=sample_fmts=fltp:sample_rates=44100/)
  assert.match(graph, /concat=n=2:v=0:a=1\[out\]/)
})

test('very low audio bitrates drop the sample rate with them', () => {
  const high = media.compressAudioArgs({ bitrate: '192k', mono: false })
  assert.ok(!high.includes('-ar'), '192k carries 44.1 kHz perfectly well')
  assert.ok(!high.includes('-ac'))

  const low = media.compressAudioArgs({ bitrate: '32k', mono: true })
  assert.equal(valueAfter(low, '-ar'), '22050', '32 kbps cannot carry 44.1 kHz cleanly')
  assert.equal(valueAfter(low, '-ac'), '1')
  assert.ok(low.includes('-vn'), 'album art is a video stream and must be dropped')
})

test('trimming silence from the end means reversing the stream twice', () => {
  const ends = valueAfter(media.silenceArgs({ mode: 'ends', threshold: -50, keep: 0.5 }), '-af')
  // silenceremove only ever trims the front, so the end is reached by turning
  // the audio round, trimming the new front, and turning it back.
  assert.equal(ends.match(/areverse/g).length, 2)
  assert.equal(ends.match(/silenceremove/g).length, 2)

  const all = valueAfter(media.silenceArgs({ mode: 'all', threshold: -50, keep: 0.5 }), '-af')
  assert.match(all, /stop_periods=-1/, 'removing every pause is stop_periods=-1')
  assert.ok(!all.includes('areverse'), 'one pass, so nothing needs buffering')
})

test('a fade-out has to be told where the end is', () => {
  const args = media.fadeArgs({ fadeIn: 2, fadeOut: 3, duration: 60 })
  const filter = valueAfter(args, '-af')
  assert.match(filter, /afade=t=in:st=0:d=2/)
  assert.match(filter, /afade=t=out:st=57\.000:d=3/)
  // Asking for neither fade must not re-encode for nothing.
  assert.deepEqual(media.fadeArgs({ fadeIn: 0, fadeOut: 0, duration: 60 }), ['-c:a', 'copy'])
  // A fade longer than the file starts at zero rather than a negative time.
  assert.match(valueAfter(media.fadeArgs({ fadeIn: 0, fadeOut: 30, duration: 10 }), '-af'), /st=0\.000/)
})

test('waveform colours go in as 0x, because # starts a comment', () => {
  const graph = valueAfter(media.waveformArgs({ width: 1200, height: 300, colour: '#c2410c', split: false }), '-filter_complex')
  assert.match(graph, /colors=0xc2410c/)
  assert.ok(!graph.includes('#'))
  assert.match(graph, /s=1200x300/)
  assert.match(graph, /split_channels=0/)
})

test('an iPhone ringtone is AAC in an ipod container, capped at 40 seconds', () => {
  const args = media.ringtoneArgs({ phone: 'iphone', start: 32, duration: 30, fadeIn: 0.5, fadeOut: 1.5 })
  assert.equal(valueAfter(args, '-f'), 'ipod', 'the extension alone does not pick the muxer')
  assert.equal(valueAfter(args, '-c:a'), 'aac')
  assert.equal(valueAfter(args, '-ss'), '32')
  assert.ok(args.includes('-vn'), 'album art must not end up as a video stream')

  // Apple rejects anything longer on sync, so the cap is enforced here rather
  // than trusted to the input.
  assert.equal(valueAfter(media.ringtoneArgs({ phone: 'iphone', start: 0, duration: 120, fadeIn: 0, fadeOut: 0 }), '-t'), '40')

  // Android wants a plain MP3 and none of the container ceremony.
  const android = media.ringtoneArgs({ phone: 'android', start: 0, duration: 30, fadeIn: 0, fadeOut: 0 })
  assert.equal(valueAfter(android, '-c:a'), 'libmp3lame')
  assert.ok(!android.includes('-f'))
})

test('the ringtone fade-out is placed against the cut length, not the song', () => {
  // 30 s taken from three minutes in: the fade belongs at 28 s, not at 178.
  const filter = valueAfter(media.ringtoneArgs({ phone: 'iphone', start: 180, duration: 30, fadeIn: 0, fadeOut: 2 }), '-af')
  assert.match(filter, /afade=t=out:st=28\.000:d=2/)
})

test('a batch gets one name each, and each keeps its own extension', () => {
  const names = media.inputNames(['clip.MOV', 'clip.mov', 'other.webm'])
  assert.deepEqual(names, ['input-0.mov', 'input-1.mov', 'input-2.webm'])
  // Two files with the same name must not collide, or a merge joins one file
  // to itself and nobody finds out until they watch the result.
  assert.equal(new Set(names).size, names.length)
})

/* ---- reading ffmpeg's own report of a file ---- */

// Verbatim from ffmpeg -i on a phone recording; the layout is what is being
// asserted, so it must not be tidied up.
const PROBE = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.mp4':",
  '  Metadata:',
  '    major_brand     : isom',
  '  Duration: 00:02:07.34, start: 0.000000, bitrate: 17203 kb/s',
  '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 17071 kb/s, 29.97 fps, 29.97 tbr, 90k tbn (default)',
  '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)'
]

test('the probe reads duration, container and both streams out of ffmpeg text', () => {
  const info = media.readProbe(PROBE)
  assert.equal(info.container, 'mov,mp4,m4a,3gp,3g2,mj2')
  // 2 minutes 7.34 seconds.
  assert.equal(info.duration, 127.34)
  assert.equal(info.bitrate, '17203 kb/s')
  assert.equal(info.streams.length, 2)

  const [video, audio] = info.streams
  assert.equal(video.kind, 'video')
  assert.equal(video.codec, 'h264')
  // The [SAR 1:1 DAR 16:9] that follows must not be mistaken for the size.
  assert.equal(video.size, '1920x1080')
  assert.equal(video.fps, 29.97)

  assert.equal(audio.kind, 'audio')
  assert.equal(audio.codec, 'aac')
  assert.equal(audio.sampleRate, 48000)
  assert.equal(audio.channels, 'stereo')
  assert.equal(audio.bitrate, '128 kb/s')
})

test('the probe survives a file with no audio and no declared duration', () => {
  const info = media.readProbe([
    "Input #0, matroska,webm, from 'input.webm':",
    '  Duration: N/A, start: 0.000000, bitrate: N/A',
    '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 640x480, SAR 1:1 DAR 4:3, 25 fps, 25 tbr, 1k tbn (default)'
  ])
  assert.equal(info.duration, null, 'N/A is not a duration')
  assert.equal(info.bitrate, null)
  assert.equal(info.streams.length, 1)
  assert.equal(info.streams[0].kind, 'video')
  assert.equal(info.streams[0].codec, 'vp9')
  assert.equal(info.streams[0].sampleRate, undefined)
})

test('the probe copes with lines arriving glued together', () => {
  // The worker emits log lines one at a time, but not always one per message.
  const glued = [PROBE.slice(0, 3).join('\n'), PROBE.slice(3).join('\n')]
  assert.deepEqual(media.readProbe(glued), media.readProbe(PROBE))
})

test('a mono voice note reports one channel, not stereo', () => {
  const info = media.readProbe([
    "Input #0, ogg, from 'input.ogg':",
    '  Duration: 00:00:09.00, start: 0.000000, bitrate: 28 kb/s',
    '  Stream #0:0: Audio: opus, 48000 Hz, mono, fltp, 28 kb/s'
  ])
  assert.equal(info.streams[0].channels, 'mono')
  assert.equal(info.duration, 9)
})

test('frame extraction reads only the span the cap can use, plus one period to flush', () => {
  // 60 frames one second apart need 60 s of input, and the fps filter emits a
  // frame only when it sees the next one - so one more period.
  assert.equal(media.framesSpan({ fps: 1, limit: 60 }), 61)
  assert.equal(media.framesSpan({ fps: 2, limit: 300 }), 151)
  // Every three seconds, ten frames: 33 s, not the whole film.
  assert.equal(media.framesSpan({ fps: 1 / 3, limit: 10 }), 33)
})

/* ---- watermarks ---- */

test('the mark lands in the corner asked for, whatever the video size', () => {
  const graph = p => valueAfter(media.watermarkArgs({ logoWidth: 200, margin: 24, position: p, opacity: 1 }), '-filter_complex')
  // W/H are the video and w/h the mark, so these hold for any dimensions.
  assert.match(graph('top-left'), /overlay=24:24/)
  assert.match(graph('top-right'), /overlay=W-w-24:24/)
  assert.match(graph('bottom-left'), /overlay=24:H-h-24/)
  assert.match(graph('bottom-right'), /overlay=W-w-24:H-h-24/)
  // Centring is arithmetic, not a margin; a gap from the edge means nothing there.
  assert.match(graph('centre'), /overlay=\(W-w\)\/2:\(H-h\)\/2/)
  assert.equal(media.WATERMARK_POSITIONS.length, 5)
})

test('opacity only works if the logo is given an alpha channel first', () => {
  const graph = valueAfter(media.watermarkArgs({ logoWidth: 120, margin: 10, position: 'top-right', opacity: 0.4 }), '-filter_complex')
  // A JPEG logo has no alpha to set, so colorchannelmixer would do nothing
  // without the conversion - and the opacity slider would look broken.
  assert.ok(graph.indexOf('format=rgba') < graph.indexOf('colorchannelmixer'), 'format=rgba must come first')
  assert.match(graph, /colorchannelmixer=aa=0\.400/)
})

test('watermarking copies the audio rather than re-encoding it', () => {
  const args = media.watermarkArgs({ logoWidth: 100, margin: 8, position: 'centre', opacity: 1 })
  assert.equal(valueAfter(args, '-c:a'), 'copy', 'a still image over the picture cannot change the sound')
  assert.equal(valueAfter(args, '-c:v'), 'libx264')
  assert.equal(valueAfter(args, '-movflags'), '+faststart')
})

test('a nonsense size or opacity is clamped rather than passed to ffmpeg', () => {
  const tiny = valueAfter(media.watermarkArgs({ logoWidth: 0.2, margin: -50, position: 'top-left', opacity: 5 }), '-filter_complex')
  assert.match(tiny, /scale=2:-1/, 'scale=0 would abort the run')
  assert.match(tiny, /overlay=0:0/, 'a negative margin would push the mark off the frame')
  assert.match(tiny, /aa=1\.000/)
  const clear = valueAfter(media.watermarkArgs({ logoWidth: 50, margin: 0, position: 'centre', opacity: -3 }), '-filter_complex')
  assert.match(clear, /aa=0\.000/)
})
