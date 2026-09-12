/**
 * The slice of the Telegram Bot API the bot uses.
 *
 * Written against `fetch` rather than a library: the whole surface is four
 * calls, and a Worker should not carry a framework to make them.
 */

const API = 'https://api.telegram.org'

/** Telegram refuses to hand a bot anything larger, whatever the chat shows. */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024

export interface InlineButton {
  text: string
  callback_data: string
}

export class TelegramApi {
  // Written out rather than a constructor parameter property: Node's
  // type-stripping runs this file as-is in the tests, and a parameter
  // property is syntax that emits code, which strip-only mode refuses.
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const response = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string }
    if (!payload.ok) throw new Error(`telegram ${method}: ${payload.description ?? response.status}`)
    return payload.result as T
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<{ message_id: number }> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
    })
  }

  /**
   * Rewrites the running count in place instead of posting a new line for
   * every photo — forty photos should not mean forty messages. A failure
   * here is not worth surfacing: it means the message is gone or unchanged.
   */
  async editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void> {
    try {
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true,
        ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
      })
    } catch {
      // Nothing to do: the counter is a convenience, not the result.
    }
  }

  answerCallback(callbackId: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) })
  }

  /** Two steps, because Telegram hands out a path before it hands out bytes. */
  async download(fileId: string): Promise<Uint8Array> {
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId })
    if (!file.file_path) throw new Error('telegram getFile: no path')
    const response = await fetch(`${API}/file/bot${this.token}/${file.file_path}`)
    if (!response.ok) throw new Error(`telegram download: ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }

  /** Documents go up as multipart, the one call that is not plain JSON. */
  async sendDocument(chatId: number, name: string, bytes: Uint8Array, caption?: string): Promise<void> {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    if (caption) form.append('caption', caption)
    form.append('document', new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)

    const response = await fetch(`${API}/bot${this.token}/sendDocument`, { method: 'POST', body: form })
    const payload = (await response.json()) as { ok: boolean; description?: string }
    if (!payload.ok) throw new Error(`telegram sendDocument: ${payload.description ?? response.status}`)
  }
}

/* ---- the shapes of an update, narrowed to what the bot reads ---- */

export interface TelegramUser {
  language_code?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_size?: number
  width: number
  height: number
}

export interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessage {
  message_id: number
  chat: { id: number }
  from?: TelegramUser
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
}

export interface TelegramCallback {
  id: string
  data?: string
  from?: TelegramUser
  message?: { message_id: number; chat: { id: number } }
}

export interface TelegramUpdate {
  message?: TelegramMessage
  callback_query?: TelegramCallback
}
