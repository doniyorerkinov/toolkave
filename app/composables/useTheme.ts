/**
 * Which theme the visitor is looking at, and how they change it.
 *
 * Three states, not two. "System" is the default and the one most people
 * should stay on — a phone that goes dark at sunset should take the site with
 * it. Light and dark are overrides for the people who want the site to
 * disagree with their machine, which is a real preference and the reason a
 * two-way toggle is not enough.
 *
 * The choice is one attribute on `<html>`: absent for system, `light` or
 * `dark` for an override. The CSS does the rest — see the dark mode block in
 * `main.css`, which is written so the media query steps aside when the
 * attribute is present.
 */
export type Theme = 'system' | 'light' | 'dark'

export const THEMES: Theme[] = ['system', 'light', 'dark']

/**
 * Deliberately the same string as the inline boot script in `app.vue`. That
 * script runs before the first paint and this composable runs after hydration,
 * so the two must agree about where the choice is kept; if you rename it here,
 * rename it there.
 */
const STORAGE_KEY = 'toolkave-theme'

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme)

/** What the boot script already put on `<html>`, read back rather than assumed. */
function readTheme(): Theme {
  const attribute = document.documentElement.getAttribute('data-theme')
  if (attribute === 'light' || attribute === 'dark') return attribute

  // No attribute usually means system, but it also means "the boot script
  // could not read storage" — so check storage too rather than silently
  // resetting a choice the visitor made.
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // Private mode, or storage blocked. System it is.
  }
  return 'system'
}

export function useTheme() {
  /**
   * Starts at 'system' on both the server and the first client render, which
   * is what keeps hydration quiet: the real value is read in `onMounted`,
   * after the markup the server sent has been matched.
   *
   * The page itself is already correct by then — the boot script set the
   * attribute before anything was painted. This state only drives the control.
   */
  const theme = useState<Theme>('theme', () => 'system')

  onMounted(() => {
    theme.value = readTheme()
  })

  function set(next: Theme) {
    theme.value = next

    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)

    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The theme still applies to this tab; it just will not be remembered.
    }
  }

  return { theme, set }
}
