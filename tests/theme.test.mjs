/**
 * The two dark palettes must stay the same palette.
 *
 * Dark mode is declared twice because it has to win against the system
 * preference in both directions, and CSS offers no way to say that once. The
 * cost is forty measured colour values kept in two places, where editing one
 * and forgetting the other produces a site that is subtly wrong only for
 * people who picked the theme by hand — which is exactly the sort of thing
 * nobody notices for a month.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const css = readFileSync(path.join(ROOT, 'app/assets/css/main.css'), 'utf8')

/** The declarations of the rule introduced by `selector`, comments stripped. */
function declarations(selector) {
  const at = css.indexOf(`${selector} {`)
  assert.notEqual(at, -1, `no rule found for ${selector}`)
  const open = css.indexOf('{', at)
  let depth = 0
  let close = -1
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) { close = i; break }
  }
  assert.notEqual(close, -1, `unbalanced braces after ${selector}`)
  return css
    .slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map(part => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

test('both ways of asking for dark produce the same palette', () => {
  const system = declarations(":root:not([data-theme='light'])")
  const chosen = declarations(":root[data-theme='dark']")

  assert.ok(system.length > 30, 'the dark palette should be substantial; did the selector change?')
  assert.deepEqual(
    chosen,
    system,
    'the chosen-dark palette has drifted from the system-dark one — every declaration must appear in both'
  )
})

test('the system palette steps aside when light is chosen', () => {
  // Without the :not(), picking light on a dark laptop would do nothing at all.
  assert.ok(
    css.includes(":root:not([data-theme='light'])"),
    'the media query must yield to an explicit light choice'
  )
  assert.ok(
    !/@media \(prefers-color-scheme: dark\) \{\s*:root \{/.test(css),
    'a bare :root inside the media query cannot be overridden by the switch'
  )
})

test('the light palette is the unconditional default', () => {
  // Light lives in @theme on :root with no media query, so no stored choice
  // and no JavaScript still gives a readable page.
  const theme = css.indexOf('@theme')
  assert.notEqual(theme, -1)
  assert.ok(theme < css.indexOf('@media (prefers-color-scheme: dark)'))
})

test('white ink and paper previews are rescued under both dark scopes', () => {
  // text-white is ink on dark chrome; a canvas is a picture of paper. Both
  // need saving from the inverted palette, whichever way dark was reached.
  for (const scope of [":root:not([data-theme='light'])", ":root[data-theme='dark']"]) {
    assert.ok(css.includes(`${scope} .text-white`), `${scope}: white ink not preserved`)
    assert.ok(css.includes(`${scope} canvas.bg-white`), `${scope}: canvas preview would invert`)
    assert.ok(css.includes(`${scope} svg.bg-white`), `${scope}: svg preview would invert`)
  }
})

test('white text is not left sitting on ember in dark mode', () => {
  // Ember is lifted rather than mirrored, so `bg-ember-700` is a LIGHT surface
  // once the lights go out - and `.text-white` is deliberately pinned to #fff
  // for ink on dark chrome. Together they gave the primary button of every
  // tool on the site a contrast of 1.67 against its own background. The fix
  // has to exist under both ways of asking for dark, for the same reason the
  // palette does.
  for (const scope of [":root:not([data-theme='light'])", ":root[data-theme='dark']"]) {
    const at = css.indexOf(`${scope} :is(`)
    assert.notEqual(at, -1, `${scope} has no ember override for white text`)
    const rule = css.slice(at, css.indexOf('}', at))

    assert.ok(rule.includes('.text-white'), `${scope}: the override has to be the one white text loses to`)
    assert.ok(rule.includes('color: var(--color-ink)'), `${scope}: white on a light surface has to become ink`)

    // Every shade that turns light has to be covered, not just the one that
    // happened to be noticed.
    for (const shade of [400, 500, 600, 700, 800, 900]) {
      assert.ok(rule.includes(`.bg-ember-${shade}`), `${scope}: ember-${shade} is light in dark mode too`)
    }
  }
})
