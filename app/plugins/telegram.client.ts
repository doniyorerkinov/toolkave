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
  platform?: string
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
    //
    // Telegram's theme colours are deliberately not read. They follow the
    // user's chat theme, which is usually dark, and this site is drawn
    // entirely against white - borrowing the background turns the subtitle
    // and every section heading into dark text on dark. See the note in
    // main.css; this comes back when the site has a dark palette of its own.
    app.ready()
    app.expand()
  }
  document.head.appendChild(script)
})
