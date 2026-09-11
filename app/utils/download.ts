/**
 * Hand a file to the browser's download machinery.
 *
 * An object URL rather than a data: URI, so a large file is not base64-encoded
 * into memory first. The URL is revoked on a generous delay: Safari and older
 * Firefox start the download asynchronously, and revoking on the next tick —
 * the obvious thing — can cancel it. FileSaver.js waits 40 seconds for the
 * same reason.
 */
export function downloadBytes(data: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([data as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 40_000)
}
