/**
 * What a file actually is, when the browser will not say.
 *
 * `File.type` is a guess the operating system makes from the extension, and it
 * guesses wrong or not at all more often than you would expect. Windows has no
 * registered media type for Matroska, so Chrome reports an empty string for
 * every `.mkv` — and a dropzone that compares `file.type` against a list of
 * MIME types rejects a file it fully supports, with a message saying it
 * accepts exactly that format. The same goes for `.opus`, `.flac` and `.m4a`
 * on a machine with no media player installed.
 *
 * So acceptance is decided by the extension as well as the type, and a file
 * passes if either agrees.
 */

/** Extensions that belong to each media type we accept. Lower case, no dot. */
export const EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],

  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/heic': ['heic', 'heif'],
  'image/heif': ['heif', 'heic'],
  'image/avif': ['avif'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tif', 'tiff'],
  'image/svg+xml': ['svg'],
  'image/x-icon': ['ico'],
  'image/vnd.microsoft.icon': ['ico'],

  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov', 'qt'],
  'video/x-msvideo': ['avi'],
  'video/x-matroska': ['mkv'],
  'video/webm': ['webm'],
  'video/3gpp': ['3gp', '3gpp'],
  'video/x-ms-wmv': ['wmv'],
  'video/mpeg': ['mpg', 'mpeg'],

  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/ogg': ['ogg', 'oga'],
  'audio/mp4': ['m4a', 'm4b'],
  'audio/aac': ['aac'],
  'audio/flac': ['flac'],
  'audio/x-flac': ['flac'],
  'audio/opus': ['opus'],
  'audio/webm': ['weba'],
  'audio/amr': ['amr']
}

/**
 * What to call each type in front of a person.
 *
 * Without this the dropzone derives a name from the MIME subtype and tells
 * people it accepts "X-MSVIDEO" and "QUICKTIME", which are AVI and MOV — the
 * two names nobody would recognise for the two formats everybody has.
 */
export const LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/heic': 'HEIC',
  'image/heif': 'HEIC',
  'image/svg+xml': 'SVG',
  'image/x-icon': 'ICO',
  'image/vnd.microsoft.icon': 'ICO',
  'image/tiff': 'TIFF',
  'video/quicktime': 'MOV',
  'video/x-msvideo': 'AVI',
  'video/x-matroska': 'MKV',
  'video/3gpp': '3GP',
  'video/x-ms-wmv': 'WMV',
  'video/mpeg': 'MPEG',
  'audio/mpeg': 'MP3',
  'audio/x-wav': 'WAV',
  'audio/mp4': 'M4A',
  'audio/x-flac': 'FLAC',
  'audio/webm': 'WEBA'
}

/** The extension of a file name, lower case and without the dot. */
export function extensionOf(fileName: string): string {
  return /\.([a-z0-9]{1,6})$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
}

/**
 * Does this file satisfy an `accept` list?
 *
 * The list is what goes in an `<input accept>`: MIME types, wildcards like
 * `image/*`, and bare extensions, comma separated. A file matches on its type
 * or on its extension, because only one of the two can be trusted at a time
 * and which one varies by machine.
 */
export function matchesAccept(file: { name: string; type: string }, accept: string): boolean {
  const extension = extensionOf(file.name)
  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? ''

  return accept.split(',').map(entry => entry.trim()).filter(Boolean).some(pattern => {
    if (pattern.startsWith('.')) return extension === pattern.slice(1).toLowerCase()
    if (pattern.endsWith('/*')) {
      const family = pattern.slice(0, -1)
      if (type.startsWith(family)) return true
      // An empty type tells us nothing, so fall back to any extension known
      // to belong to that family.
      return Object.entries(EXTENSIONS).some(
        ([mime, extensions]) => mime.startsWith(family) && extensions.includes(extension)
      )
    }
    if (type === pattern) return true
    return !!extension && (EXTENSIONS[pattern] ?? []).includes(extension)
  })
}

/** "MP4, MOV, AVI, MKV" — the formats named the way people know them. */
export function acceptLabel(accept: string): string {
  const names = accept
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(pattern => {
      if (pattern.startsWith('.')) return pattern.slice(1).toUpperCase()
      if (pattern.endsWith('/*')) return pattern.slice(0, -2).toUpperCase()
      return LABELS[pattern] ?? (pattern.split('/')[1] ?? pattern).toUpperCase()
    })
  return [...new Set(names)].join(', ')
}

/**
 * The `accept` attribute for the file input, with extensions added.
 *
 * The OS file picker greys out files it cannot match, using the same unreliable
 * type registry — so a `.mkv` is unselectable on Windows unless the extension
 * is listed explicitly alongside the MIME type.
 */
export function acceptAttribute(accept: string): string {
  const out = new Set<string>()
  for (const entry of accept.split(',').map(a => a.trim()).filter(Boolean)) {
    out.add(entry)
    for (const extension of EXTENSIONS[entry] ?? []) out.add(`.${extension}`)
  }
  return [...out].join(',')
}
