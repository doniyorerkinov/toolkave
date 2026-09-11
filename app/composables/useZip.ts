/**
 * Bundling several output files into one .zip.
 *
 * Used where a tool's natural output is many files from one input — PDF to
 * JPG turns an N-page document into N images — and the site has nowhere to
 * offer more than one download at a time. `jszip` is lazy-imported here so
 * nothing else on the site pays for it.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

export async function zipFiles(entries: ZipEntry[]): Promise<Uint8Array> {
  if (import.meta.server) throw new Error('browser only')
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const entry of entries) zip.file(entry.name, entry.data)
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return out
}
