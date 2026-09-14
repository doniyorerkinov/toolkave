/// <reference types="@cloudflare/workers-types" />
/**
 * What the bot remembers between messages: the files a chat has sent and not
 * yet turned into anything.
 *
 * D1 rather than KV because the counter has to be right the instant the next
 * photo lands, and KV is eventually consistent - a burst of forty photos
 * would count itself wrong. Durable Objects would also fit, but a Nitro
 * Worker cannot export the class one needs.
 *
 * Only identifiers are stored. The photos themselves stay on Telegram's
 * servers until the moment the PDF is built, and are never written down here.
 */

export type PendingKind = 'image' | 'pdf'

export interface PendingFile {
  fileId: string
  kind: PendingKind
  bytes: number
  name: string
}

export interface Session {
  files: PendingFile[]
  /** The message showing the running count, so it can be rewritten in place. */
  counterMessageId: number | null
}

interface Row {
  file_id: string
  kind: PendingKind
  bytes: number
  name: string
}

export class SessionStore {
  /** Spelled out, not a parameter property: see the note in `api.ts`. */
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  /**
   * The language this chat chose, or null if it never has.
   *
   * Deliberately not derived from Telegram's `language_code`: in Uzbekistan a
   * phone set to Russian says nothing about what its owner reads comfortably,
   * and a teacher greeted in the wrong language closes the bot rather than
   * hunting for a setting.
   */
  async readLocale(chatId: number): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT locale FROM prefs WHERE chat_id = ?1')
      .bind(chatId)
      .first<{ locale: string }>()
    return row?.locale ?? null
  }

  async setLocale(chatId: number, locale: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO prefs (chat_id, locale, set_at) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(chat_id) DO UPDATE SET locale = ?2, set_at = ?3'
      )
      .bind(chatId, locale, Date.now())
      .run()
  }

  async read(chatId: number): Promise<Session> {
    const [files, chat] = await Promise.all([
      this.db
        .prepare('SELECT file_id, kind, bytes, name FROM pending WHERE chat_id = ?1 ORDER BY id')
        .bind(chatId)
        .all<Row>(),
      this.db
        .prepare('SELECT counter_message_id FROM chats WHERE chat_id = ?1')
        .bind(chatId)
        .first<{ counter_message_id: number | null }>()
    ])

    return {
      files: (files.results ?? []).map(row => ({
        fileId: row.file_id,
        kind: row.kind,
        bytes: row.bytes,
        name: row.name
      })),
      counterMessageId: chat?.counter_message_id ?? null
    }
  }

  async add(chatId: number, file: PendingFile): Promise<void> {
    await this.db
      .prepare('INSERT INTO pending (chat_id, file_id, kind, bytes, name, added_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(chatId, file.fileId, file.kind, file.bytes, file.name, Date.now())
      .run()
  }

  /** Put a file back: used when a burst of album photos overshoots the caps. */
  async remove(chatId: number, fileId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM pending WHERE chat_id = ?1 AND file_id = ?2')
      .bind(chatId, fileId)
      .run()
  }

  async setCounterMessage(chatId: number, messageId: number | null): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO chats (chat_id, counter_message_id, updated_at) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(chat_id) DO UPDATE SET counter_message_id = ?2, updated_at = ?3'
      )
      .bind(chatId, messageId, Date.now())
      .run()
  }

  async clear(chatId: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM pending WHERE chat_id = ?1').bind(chatId),
      this.db.prepare('DELETE FROM chats WHERE chat_id = ?1').bind(chatId)
    ])
  }

  /**
   * Rows from chats that went quiet mid-batch. Nothing here is private - file
   * ids and a count - but a table that only grows is a table that eventually
   * hurts, and a day-old id has expired on Telegram's side anyway.
   */
  async sweep(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - olderThanMs
    await this.db.batch([
      this.db.prepare('DELETE FROM pending WHERE added_at < ?1').bind(cutoff),
      this.db.prepare('DELETE FROM chats WHERE updated_at < ?1').bind(cutoff)
    ])
  }
}
