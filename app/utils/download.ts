/**
 * Hand a file to the user, by whichever route this browser actually has.
 *
 * The normal route is an anchor with `download`, and everywhere except one
 * place that is the right answer: it is silent, instant, and needs no
 * permission. The exception is a webview. Inside Telegram's Mini App browser
 * on iOS the anchor is simply ignored — no error, no file, nothing to tell
 * the user their merged PDF went nowhere. Reported from a real phone, which
 * is the only way this kind of thing is ever found.
 *
 * So inside Telegram the share sheet is tried first. It is the native route
 * on iOS, and it lands the file where it was going anyway: Files, or straight
 * back into a chat. Nothing is uploaded — the bytes go from the page to the
 * system share sheet without passing through us, which keeps the promise the
 * homepage makes.
 *
 * Returns what happened, so a caller can say something when there is no route
 * left rather than leaving a button that does nothing.
 */
export type DeliveryResult = 'shared' | 'downloaded' | 'unavailable'

/**
 * Only inside Telegram. iOS Safari has handled `download` since iOS 13, and a
 * share sheet where a download was expected is worse, so the ordinary web
 * keeps the ordinary behaviour.
 */
function inTelegramWebview(): boolean {
  return document.documentElement.classList.contains('in-telegram')
}

async function share(blob: Blob, name: string, type: string): Promise<boolean> {
  const canShare = navigator.canShare?.bind(navigator)
  if (!canShare || typeof navigator.share !== 'function') return false

  const file = new File([blob], name, { type })
  if (!canShare({ files: [file] })) return false

  try {
    await navigator.share({ files: [file] })
    return true
  } catch (error) {
    // The user closing the sheet is a completed interaction, not a failure:
    // falling through to an anchor that does nothing would be worse than
    // doing nothing visibly.
    return (error as Error | undefined)?.name === 'AbortError'
  }
}

/**
 * An object URL rather than a data: URI, so a large file is not base64-encoded
 * into memory first. The URL is revoked on a generous delay: Safari and older
 * Firefox start the download asynchronously, and revoking on the next tick —
 * the obvious thing — can cancel it. FileSaver.js waits 40 seconds for the
 * same reason.
 */
function anchor(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 40_000)
}

export async function downloadBytes(
  data: Uint8Array | string,
  name: string,
  type: string
): Promise<DeliveryResult> {
  const blob = new Blob([data as BlobPart], { type })

  if (inTelegramWebview()) {
    if (await share(blob, name, type)) return 'shared'
    // No share sheet here either: say so rather than click an anchor that
    // this webview will ignore without complaining.
    return 'unavailable'
  }

  anchor(blob, name)
  return 'downloaded'
}
