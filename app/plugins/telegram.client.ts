/**
 * Makes the site behave when it is opened as a Telegram Mini App.
 *
 * A Mini App is not a port: Telegram opens this same site in its own webview,
 * so all 83 tools are already there. What differs is the frame around them -
 * Telegram draws its own header and back button, and hands the page the user's
 * colour theme - so the site has to stop drawing a second one.
 *
 * Telegram announces itself in the URL fragment (`#tgWebAppPlatform=...`), and
 * that is checked before anything is loaded: a visitor arriving from Google
 * should not pay for a script that exists to talk to an app they are not in.
 */
interface TelegramWebApp {
  ready: () => void
  expand: () => void
  colorScheme?: 'light' | 'dark'
  themeParams?: Record<string, string>
  platform?: string
  onEvent?: (event: string, handler: () => void) => void
}

const INSIDE_TELEGRAM = /(^|[#&?])tgWebApp(Platform|Data|Version)=/

export default defineNuxtPlugin(() => {
  const here = window.location.hash + window.location.search
  if (!INSIDE_TELEGRAM.test(here)) return

  // Marked before the script loads, so the chrome is hidden on first paint
  // rather than flashing a header Telegram is about to draw over.
  document.documentElement.classList.add('in-telegram')

  const script = document.createElement('script')
  script.src = 'https://telegram.org/js/telegram-web-app.js'
  script.async = true
  script.onload = () => {
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    if (!app) return

    // `ready` stops Telegram's loading placeholder; `expand` takes the full
    // height, without which every tool opens inside a half-screen sheet.
    app.ready()
    app.expand()

    const applyTheme = () => {
      const params = app.themeParams ?? {}
      const root = document.documentElement
      if (app.colorScheme) root.dataset.telegramScheme = app.colorScheme
      // Telegram's own background, so the page does not sit on a different
      // colour from the chat it was opened out of.
      if (params.bg_color) root.style.setProperty('--tg-bg', params.bg_color)
      if (params.text_color) root.style.setProperty('--tg-text', params.text_color)
      if (params.link_color) root.style.setProperty('--tg-link', params.link_color)
    }

    applyTheme()
    app.onEvent?.('themeChanged', applyTheme)
  }
  document.head.appendChild(script)
})
