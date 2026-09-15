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
