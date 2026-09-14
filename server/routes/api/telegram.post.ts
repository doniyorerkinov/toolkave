/// <reference types="@cloudflare/workers-types" />
/**
 * The bot's webhook.
 *
 * One POST per update, answered 200 whatever happens: Telegram retries an
 * error, and a retry of a photo that was already counted would count it
 * twice. Anything that goes wrong is the chat's problem to see, not
 * Telegram's to repeat.
 *
 * The secret header is set when the webhook is registered, and is the only
 * thing separating a real update from anyone who finds the URL.
 */
import { handleUpdate } from '../../telegram/bot'
import { TelegramApi, type TelegramUpdate } from '../../telegram/api'
import { SessionStore } from '../../telegram/session'

interface BotEnv {
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_WEBHOOK_SECRET?: string
  /** Group chat that receives plain-text messages. Unset: feedback is declined. */
  TELEGRAM_FEEDBACK_CHAT?: string
  BOT_DB?: D1Database
}

export default defineEventHandler(async event => {
  const env = (event.context.cloudflare?.env ?? {}) as BotEnv

  if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_DB) {
    // Not configured yet: say nothing useful to whoever is knocking.
    setResponseStatus(event, 404)
    return 'not found'
  }
  if (
    env.TELEGRAM_WEBHOOK_SECRET &&
    getHeader(event, 'x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    setResponseStatus(event, 403)
    return 'forbidden'
  }

  const update = await readBody<TelegramUpdate>(event)

  // Telegram holds the next update for this chat until this one is answered,
  // so anything that waits has to wait after the response, not before it.
  const keepAlive = event.context.waitUntil as ((work: Promise<unknown>) => void) | undefined
  const context = {
    api: new TelegramApi(env.TELEGRAM_BOT_TOKEN),
    store: new SessionStore(env.BOT_DB),
    feedbackChat: env.TELEGRAM_FEEDBACK_CHAT ? Number(env.TELEGRAM_FEEDBACK_CHAT) : undefined,
    defer: keepAlive ? (work: Promise<unknown>) => keepAlive(work) : undefined
  }

  try {
    await handleUpdate(update, context)
  } catch (error) {
    console.error('[bot] update failed', error)
  }
  return 'ok'
})
