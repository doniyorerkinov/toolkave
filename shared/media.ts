/**
 * What to tell ffmpeg, worked out separately from running it.
 *
 * Every tool here is a few command-line arguments around one binary, and the
 * arguments are where the mistakes live: a wrong flag order silently produces
 * a file that plays without audio, or re-encodes when it could have copied.
 * Keeping them as pure functions means they can be tested in milliseconds
 * without loading 31 MB of WebAssembly.
 */

export type VideoQuality = 'telegram' | 'email' | 'balanced' | 'high'

/**
 * Constant Rate Factor: lower is better and larger. 23 is ffmpeg's default and
 * looks untouched; 32 is visibly soft but sends over a slow connection.
 * Paired with a width cap, because resolution saves more bytes than any
 * amount of CRF once a phone video is involved.
 */
const QUALITY: Record<VideoQuality, { crf: number; width: number; audio: string }> = {
  telegram: { crf: 30, width: 854, audio: '96k' },
  email: { crf: 32, width: 640, audio: '64k' },
  balanced: { crf: 27, width: 1280, audio: '128k' },
  high: { crf: 23, width: 1920, audio: '192k' }
}

/**
 * `-vf scale` with a -2 keeps the aspect ratio and rounds to an even number,
 * which H.264 requires: an odd dimension is rejected outright. `min(iw,N)`
 * means a video already smaller than the cap is never upscaled.
 *
 * `-movflags +faststart` puts the index at the front so the file can start
 * playing before it has finished downloading — the difference between a
 * Telegram preview that plays and one that spins.
 */
export function compressVideoArgs(quality: VideoQuality): string[] {
  const { crf, width, audio } = QUALITY[quality]
  return [
    '-vf', `scale='min(${width},iw)':-2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-c:a', 'aac',
    '-b:a', audio,
    '-movflags', '+faststart'
  ]
}

/**
 * Cutting without re-encoding where it is safe.
 *
 * `-c copy` is instant but can only cut at a keyframe, so the result may start
 * up to a second or two early. Re-encoding is frame-accurate and slow. The
 * tool offers both and says which is which rather than choosing silently.
 *
 * `-ss` before `-i` seeks by index and is fast; after `-i` it decodes from the
 * start and is accurate. The accurate path therefore puts it after, which is
 * the opposite of what most examples online show.
 */
export function trimArgs(options: { start: number; end: number; accurate: boolean; audioOnly?: boolean }): string[] {
  const duration = Math.max(0.05, options.end - options.start)
  const codec = options.audioOnly
    ? ['-c', 'copy']
    : options.accurate
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac']
      : ['-c', 'copy']
  return ['-ss', String(options.start), '-t', String(duration), ...codec]
}

/** Strip the picture, keep the sound. `-vn` first, or the encoder still sees video. */
export function extractAudioArgs(bitrate = '192k'): string[] {
  return ['-vn', '-c:a', 'libmp3lame', '-b:a', bitrate]
}

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'm4a' | 'flac'

const AUDIO_CODEC: Record<AudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  // FLAC is lossless: a bitrate would be meaningless and ffmpeg ignores it.
  flac: ['-c:a', 'flac']
}

export function convertAudioArgs(format: AudioFormat): string[] {
  return ['-vn', ...AUDIO_CODEC[format]]
}

/**
 * To MP4, copying the streams when the codecs already suit the container.
 *
 * A .mkv or .webm holding H.264 and AAC is an MP4 in the wrong box: remuxing
 * takes a second and loses nothing. Anything else has to be re-encoded, and
 * the caller decides which by what it read from the file.
 */
export function toMp4Args(remux: boolean): string[] {
  return remux
    ? ['-c', 'copy', '-movflags', '+faststart']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']
}

/**
 * A GIF worth looking at, in one pass.
 *
 * The naive conversion quantises each frame against the standard 216-colour
 * palette and looks like 1997. `palettegen` and `paletteuse` in a filter chain
 * build one palette from the actual footage and dither against it — the same
 * two-pass technique ffmpeg documents, expressed as a single graph so it runs
 * once.
 */
export function gifArgs(options: { fps: number; width: number; start?: number; duration?: number }): string[] {
  const seek = options.start ? ['-ss', String(options.start)] : []
  const length = options.duration ? ['-t', String(options.duration)] : []
  const filter =
    `fps=${options.fps},scale='min(${options.width},iw)':-1:flags=lanczos,` +
    'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3'
  return [...seek, ...length, '-vf', filter, '-loop', '0']
}

/** Louder, without clipping: two-pass loudness normalisation in one command. */
export function normaliseArgs(): string[] {
  return ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'libmp3lame', '-b:a', '192k']
}

/** Extensions ffmpeg can open here, by what the tool is for. */
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/3gpp']
export const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/opus', 'audio/webm']

/** The name ffmpeg's in-memory filesystem sees. Its extension picks the demuxer. */
export function inputName(fileName: string, fallback = 'input.mp4'): string {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]
  return extension ? `input.${extension.toLowerCase()}` : fallback
}

/* ------------------------------------------------------------------ *
 * Transforms: the same video, turned, shrunk, silenced or reframed.
 * ------------------------------------------------------------------ */

export type Orientation = 'right' | 'left' | 'half' | 'hflip' | 'vflip'

/**
 * `transpose` rotates in 90° steps and is the only correct way to do it.
 *
 * Setting the rotation metadata instead would be instant, but it only asks the
 * player to turn the picture and half of them ignore it — which is exactly how
 * the sideways video arrived in the first place. Rotating the pixels means the
 * file is upright everywhere, including in the places that caused the problem.
 *
 * ffmpeg applies the source's own display matrix while decoding, so by the
 * time these filters run the frame is already the way up the phone intended.
 */
const ORIENTATION: Record<Orientation, string> = {
  right: 'transpose=1',
  left: 'transpose=2',
  half: 'transpose=2,transpose=2',
  hflip: 'hflip',
  vflip: 'vflip'
}

export function rotateArgs(how: Orientation): string[] {
  return [
    '-vf', ORIENTATION[how],
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart'
  ]
}

/**
 * Drop the sound and touch nothing else.
 *
 * `-c copy` means no encoder runs at all: the picture is moved across
 * untouched, so this finishes in about a second on a file that would take
 * minutes to re-encode and the quality is bit-for-bit identical. It only works
 * while the container stays the same, which is why the caller keeps the
 * original extension rather than forcing MP4 like the other video tools.
 */
export function muteArgs(): string[] {
  return ['-c', 'copy', '-an']
}

/** The heights offered, smallest first is deliberate: most people want smaller. */
export const RESOLUTIONS = [2160, 1440, 1080, 720, 480, 360] as const
export type Resolution = (typeof RESOLUTIONS)[number]

/**
 * Scale to a target height, never upwards.
 *
 * `min(H,ih)` caps rather than sets: asking for 1080p from a 720p source
 * produces 720p rather than a blurry upscale that is three times the size for
 * no extra detail. The width is `-2` so the aspect ratio is kept and the
 * result lands on an even number, which H.264 requires.
 */
export function resizeArgs(height: Resolution): string[] {
  return [
    '-vf', `scale=-2:'min(${height},ih)'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart'
  ]
}

export type SocialPreset = 'story' | 'square' | 'portrait' | 'wide'
export type SocialFit = 'crop' | 'pad' | 'blur'

/**
 * The four shapes every social platform actually wants.
 *
 * Named for what they are for rather than by ratio, because nobody uploading a
 * Reel is thinking "9:16". 1080 wide is the useful ceiling: every one of these
 * platforms re-encodes on upload and none of them keep more than that, so a
 * 4K source only costs upload time.
 */
export const SOCIAL_SIZES: Record<SocialPreset, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  wide: { w: 1920, h: 1080 }
}

/**
 * Fit a video into a shape it was not filmed in, three ways.
 *
 * `crop` fills the frame and loses the edges — right for scenery, wrong for a
 * face near the side. `pad` keeps everything and adds black bars. `blur` also
 * keeps everything, but fills the bars with an enlarged blurred copy of the
 * footage, which is what the platforms' own editors do and what most people
 * mean when they say they want it to "look normal".
 *
 * `force_original_aspect_ratio=increase` scales until the frame is covered and
 * `decrease` until it fits — the pair is what makes crop and pad one-liners.
 * `setsar=1` resets the pixel aspect ratio, without which anamorphic phone
 * footage comes out stretched after cropping.
 */
export function socialArgs(preset: SocialPreset, fit: SocialFit): string[] {
  const { w, h } = SOCIAL_SIZES[preset]

  const filter =
    fit === 'crop'
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
      : fit === 'pad'
        ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
        : // One source, two copies: a blown-up blurred background and the real
          // footage laid on top of it, centred.
          `split[bg][fg];` +
          `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=24[bg];` +
          `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];` +
          `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`

  return [
    fit === 'blur' ? '-filter_complex' : '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart'
  ]
}

/**
 * Still images out of a video - always as PNG, whatever the visitor asked for.
 *
 * ffmpeg's own JPEG encoder is not usable in this wasm core: on a 10-bit HEVC
 * source it corrupts memory after a few dozen frames and the worker dies with
 * "memory access out of bounds", taking the shared engine with it. Converting
 * to 8-bit first made no difference; the fault is in the encoder. PNG output
 * from the same command runs to the end, so ffmpeg produces PNG and, when JPG
 * was wanted, the browser's own encoder makes it from that - see Frames.vue.
 * Do not put mjpeg back here without a file like that to test against.
 *
 * `fps` below 1 means one frame every few seconds - the useful end for "give
 * me a contact sheet of this lecture". The frame cap is a guard: `fps=25` on a
 * ten-minute video is fifteen thousand files, which fills memory and produces
 * a zip nobody wanted.
 */
/**
 * How much of the input the frame cap can possibly need, in seconds.
 *
 * `-frames:v` only limits output. If the `fps` filter stops emitting - a
 * timestamp discontinuity in the source is enough - ffmpeg carries on decoding
 * to the end of the file looking for frames that never come, and a 60-frame
 * request against a two-hour video becomes a two-hour decode with the progress
 * bar frozen. Capping the input read with `-t` makes the run proportional to
 * the cap whatever the file does. One extra period so the filter can flush
 * the final frame.
 */
export function framesSpan(options: { fps: number; limit: number }): number {
  return Math.ceil((options.limit + 1) / options.fps)
}

export function framesArgs(options: { fps: number; width: number; limit: number }): string[] {
  return ['-vf', `fps=${options.fps},scale='min(${options.width},iw)':-2`, '-frames:v', String(options.limit)]
}

/* ------------------------------------------------------------------ *
 * Joining things together.
 * ------------------------------------------------------------------ */

/**
 * Play several videos one after another.
 *
 * The `concat` filter refuses inputs that differ in size, pixel format or
 * sample rate, and clips from two different phones differ in all three. So
 * every input is first scaled and padded into one common frame and its audio
 * resampled to one common format; only then are they joined. That is why this
 * always re-encodes. The alternative — the concat *demuxer* with `-c copy` —
 * is instant but silently produces a broken file the moment two inputs do not
 * match exactly, which is most of the time.
 *
 * `audio` is decided by the caller after probing: `concat` with `a=1` fails
 * outright if any one input has no sound, so a batch where one clip is silent
 * is joined as video only rather than not at all.
 */
export function mergeVideoArgs(options: { count: number; height: number; audio: boolean }): string[] {
  const { count, height, audio } = options
  const width = Math.round((height * 16) / 9 / 2) * 2

  const prepared: string[] = []
  const labels: string[] = []
  for (let i = 0; i < count; i++) {
    prepared.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30[v${i}]`
    )
    if (audio) prepared.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`)
    labels.push(audio ? `[v${i}][a${i}]` : `[v${i}]`)
  }

  const graph =
    `${prepared.join(';')};${labels.join('')}concat=n=${count}:v=1:a=${audio ? 1 : 0}` +
    (audio ? '[v][a]' : '[v]')

  return [
    '-filter_complex', graph,
    '-map', '[v]',
    ...(audio ? ['-map', '[a]'] : []),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    ...(audio ? ['-c:a', 'aac', '-b:a', '160k'] : []),
    '-movflags', '+faststart'
  ]
}

/**
 * Play several audio files one after another.
 *
 * Same normalising step and the same reason: a 44.1 kHz stereo MP3 and a
 * 48 kHz mono voice note cannot be concatenated as they are. Joining them
 * without `aformat` produces either a failure or, worse, a file that plays at
 * the wrong speed.
 */
export function mergeAudioArgs(count: number): string[] {
  const prepared: string[] = []
  const labels: string[] = []
  for (let i = 0; i < count; i++) {
    prepared.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`)
    labels.push(`[a${i}]`)
  }
  return [
    '-filter_complex', `${prepared.join(';')};${labels.join('')}concat=n=${count}:v=0:a=1[out]`,
    '-map', '[out]',
    '-c:a', 'libmp3lame',
    '-b:a', '192k'
  ]
}

/* ------------------------------------------------------------------ *
 * Audio editing.
 * ------------------------------------------------------------------ */

export const AUDIO_BITRATES = ['320k', '256k', '192k', '128k', '96k', '64k', '32k'] as const
export type AudioBitrate = (typeof AUDIO_BITRATES)[number]

/**
 * Make an audio file smaller by spending fewer bits on it.
 *
 * `mono` halves the data again and is the right default for anything spoken:
 * a voice recording has no stereo information worth keeping, and 32 kbps mono
 * is still perfectly intelligible speech at roughly a fortieth of the size.
 * Music is a different matter, hence the choice rather than an assumption.
 */
export function compressAudioArgs(options: { bitrate: AudioBitrate; mono: boolean }): string[] {
  return [
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', options.bitrate,
    ...(options.mono ? ['-ac', '1'] : []),
    // 32 kbps cannot carry 44.1 kHz cleanly; dropping the sample rate with the
    // bitrate is what keeps very low settings sounding like speech rather than
    // like a broken radio.
    ...(parseInt(options.bitrate, 10) <= 64 ? ['-ar', '22050'] : [])
  ]
}

export type SilenceMode = 'ends' | 'all'

/**
 * Cut the dead air out.
 *
 * `ends` trims the fumbling at the start and the reach for the stop button at
 * the end, and leaves the middle exactly as recorded. It works by trimming the
 * front, reversing the stream, trimming the new front, and reversing back —
 * the documented idiom, because the filter only ever trims from the beginning.
 * Reversing buffers the whole stream in memory, which is fine for a lecture
 * and would not be for an audiobook.
 *
 * `all` removes every pause longer than `keep` anywhere in the recording. On
 * an hour of hesitant speech this is the difference between fifty minutes and
 * thirty-five.
 *
 * The threshold is in dB below full scale and negative: -50 is a quiet room,
 * -30 starts eating the ends of quiet words.
 */
export function silenceArgs(options: { mode: SilenceMode; threshold: number; keep: number }): string[] {
  const { mode, threshold, keep } = options
  const trim = `silenceremove=start_periods=1:start_duration=0:start_threshold=${threshold}dB:detection=peak`

  const filter =
    mode === 'ends'
      ? `${trim},areverse,${trim},areverse`
      : `silenceremove=stop_periods=-1:stop_duration=${keep}:stop_threshold=${threshold}dB:detection=peak`

  return ['-af', filter, '-c:a', 'libmp3lame', '-b:a', '192k']
}

/**
 * Ease the sound in and out instead of starting and stopping flat.
 *
 * The fade-out has to be placed, not just given a length: `afade=t=out` starts
 * at `st` and runs for `d`, so it needs to know where the end is. The duration
 * comes from the browser's own player, which has already decoded enough of the
 * file to know — no extra pass over the audio to find out.
 */
export function fadeArgs(options: { fadeIn: number; fadeOut: number; duration: number }): string[] {
  const filters: string[] = []
  if (options.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${options.fadeIn}`)
  if (options.fadeOut > 0) {
    const at = Math.max(0, options.duration - options.fadeOut)
    filters.push(`afade=t=out:st=${at.toFixed(3)}:d=${options.fadeOut}`)
  }
  if (!filters.length) return ['-c:a', 'copy']
  return ['-af', filters.join(','), '-c:a', 'libmp3lame', '-b:a', '192k']
}

/**
 * A picture of the sound.
 *
 * `showwavespic` draws the whole file as one image in a single pass — useful
 * for a thumbnail, a podcast cover, or just seeing where in a two-hour
 * recording somebody actually spoke. Colours go in as `0xRRGGBB`; a `#` would
 * be read as the start of a comment.
 */
export function waveformArgs(options: { width: number; height: number; colour: string; split: boolean }): string[] {
  const colour = options.colour.replace('#', '0x')
  return [
    '-filter_complex',
    `showwavespic=s=${options.width}x${options.height}:colors=${colour}:split_channels=${options.split ? 1 : 0}`,
    '-frames:v', '1'
  ]
}

/* ------------------------------------------------------------------ *
 * Ringtones.
 * ------------------------------------------------------------------ */

/** Apple stops at 40 seconds for a ringtone; anything longer is rejected on sync. */
export const RINGTONE_MAX = 40

export type RingtonePhone = 'iphone' | 'android'

/**
 * A slice of a song, cut and packaged the way a phone will accept it.
 *
 * On iPhone that means AAC in an MPEG-4 container with the extension `.m4r` —
 * byte-for-byte an `.m4a`, renamed, which is the entire trick the paid apps
 * charge for. `-f ipod` picks that muxer explicitly rather than trusting the
 * extension. Android wants none of this and takes a plain MP3.
 *
 * `-ss` sits after the input here rather than before it: seeking by index is
 * faster but lands on the nearest keyframe, and for a ringtone that is the
 * difference between starting on the chorus and starting half a second into
 * it. Over 40 seconds the accurate seek costs nothing worth having.
 *
 * The short fades are not decoration. A ringtone loops, and a cut that starts
 * mid-waveform clicks audibly on every repeat.
 */
export function ringtoneArgs(options: {
  phone: RingtonePhone
  start: number
  duration: number
  fadeIn: number
  fadeOut: number
}): string[] {
  const length = Math.min(options.duration, RINGTONE_MAX)

  const filters: string[] = []
  if (options.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${options.fadeIn}`)
  if (options.fadeOut > 0) {
    const at = Math.max(0, length - options.fadeOut)
    filters.push(`afade=t=out:st=${at.toFixed(3)}:d=${options.fadeOut}`)
  }

  return [
    '-ss', String(options.start),
    '-t', String(length),
    '-vn',
    ...(filters.length ? ['-af', filters.join(',')] : []),
    ...(options.phone === 'iphone'
      ? ['-c:a', 'aac', '-b:a', '192k', '-f', 'ipod']
      : ['-c:a', 'libmp3lame', '-b:a', '192k'])
  ]
}

/**
 * Unique names for a batch of inputs.
 *
 * ffmpeg's filesystem is flat and `inputName` deliberately returns the same
 * `input.mp4` every time, which is right for the one-file tools and wrong the
 * moment two clips are merged: the second write would overwrite the first and
 * the merge would quietly join a file to itself. The index goes in the name
 * rather than the extension, because the extension is what picks the demuxer.
 */
export function inputNames(fileNames: string[], fallback = 'input.mp4'): string[] {
  return fileNames.map((name, index) => inputName(name, fallback).replace(/^input\./, `input-${index}.`))
}

/* ------------------------------------------------------------------ *
 * Reading what ffmpeg says about a file.
 * ------------------------------------------------------------------ */

export interface MediaStreamInfo {
  kind: 'video' | 'audio' | 'subtitle' | 'other'
  codec: string
  size?: string
  fps?: number
  sampleRate?: number
  channels?: string
  bitrate?: string
  /** Everything else on the line, kept verbatim for the people who want it. */
  detail: string
}

export interface MediaInfo {
  container: string | null
  /** Seconds, or null when the container does not declare one. */
  duration: number | null
  bitrate: string | null
  streams: MediaStreamInfo[]
}

/**
 * Turn `ffmpeg -i` chatter into something that can be put in a table.
 *
 * This is text scraping and it is the only option: ffprobe's JSON output is a
 * separate binary that the wasm build does not include, so the stream table
 * printed to the log is all there is. It is a stable format — the layout has
 * not changed in a decade — but it is still text, which is exactly why the
 * parsing lives here with tests around it rather than inside a component.
 *
 * Lines arrive from the worker one at a time and sometimes glued together, so
 * they are rejoined and re-split before anything is read.
 */
export function readProbe(lines: string[]): MediaInfo {
  const rows = lines.join('\n').split('\n').map(line => line.trimEnd())

  const container = /^Input #0,\s*([^,]+(?:,[^,]+)*),\s*from/.exec(rows.find(r => r.startsWith('Input #0,')) ?? '')?.[1]?.trim() ?? null

  const durationRow = rows.find(row => /^\s*Duration:/.test(row)) ?? ''
  const clock = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(durationRow)
  const duration = clock
    ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
    : null
  const bitrate = /bitrate:\s*([\d.]+\s*\w+\/s)/.exec(durationRow)?.[1] ?? null

  const streams: MediaStreamInfo[] = []
  for (const row of rows) {
    const match = /^\s*Stream #\d+:\d+.*?:\s*(Video|Audio|Subtitle|Data|Attachment):\s*(.+)$/.exec(row)
    if (!match) continue

    const label = (match[1] ?? '').toLowerCase()
    const rest = match[2] ?? ''
    const kind: MediaStreamInfo['kind'] =
      label === 'video' || label === 'audio' || label === 'subtitle' ? label : 'other'

    // The codec is everything up to the first comma or bracketed qualifier.
    const codec = (/^([\w.\-]+)/.exec(rest)?.[1] ?? rest).trim()

    streams.push({
      kind,
      codec,
      // Resolution is the only WxH on the line; the [SAR ...] that sometimes
      // follows it is not part of it.
      size: /(\d{2,5}x\d{2,5})/.exec(rest)?.[1],
      fps: Number(/([\d.]+)\s*fps/.exec(rest)?.[1]) || undefined,
      sampleRate: Number(/(\d+)\s*Hz/.exec(rest)?.[1]) || undefined,
      channels: /,\s*(mono|stereo|\d+(?:\.\d+)? channels)/.exec(rest)?.[1],
      bitrate: /([\d.]+\s*\w+\/s)/.exec(rest)?.[1],
      detail: rest
    })
  }

  return { container, duration, bitrate, streams }
}

/**
 * How large a file the media tools will take.
 *
 * The site-wide default is 100 MB, which is right for a PDF and absurd for
 * video: two minutes from a phone clears it comfortably. There is no server to
 * protect here, so the only real limit is what the browser can hold — and it
 * has to hold the file twice over, once in JavaScript and once inside ffmpeg's
 * own filesystem, plus the output.
 *
 * 500 MB covers phone clips, lectures and screen recordings while leaving room
 * for that. It is a desktop figure; a phone will run out well before it, which
 * is why the tools fail with a message rather than a silent crash.
 */
export const MEDIA_MAX_SIZE = 500 * 1024 * 1024
