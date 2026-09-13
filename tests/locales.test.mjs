/**
 * The two ways a perfectly valid JSON string still breaks the site.
 *
 * Translations go through vue-i18n's message compiler, which reads some
 * ordinary punctuation as syntax. When it refuses a message the whole locale
 * file fails to compile and every string on the site renders as its own key
 * — a total failure produced by one sentence, and one that a type check and
 * a page load both sail straight past.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const DIR = path.join(ROOT, 'i18n/locales')
const LOCALES = readdirSync(DIR).filter(name => name.endsWith('.json'))

/** Every leaf string, with the dotted path that would be used to reach it. */
function* messages(node, parts = []) {
  if (typeof node === 'string') {
    yield [parts.join('.'), node]
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) yield* messages(value, [...parts, key])
  }
}

const HTML = /<\s*\/?\s*[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?\s*>/
/**
 * A linked message is `@:key` or `@.lower:key`; a bare @ is a syntax error.
 * A literal one is written `{'@'}`, so those are taken out before looking.
 */
const LITERAL = /\{'[^']*'\}/g
const LINKED = /@(?![:.])/

test('every locale file is valid JSON', () => {
  for (const name of LOCALES) {
    assert.doesNotThrow(
      () => JSON.parse(readFileSync(path.join(DIR, name), 'utf8')),
      `${name} should parse`
    )
  }
})

test('no message contains something the compiler reads as HTML', () => {
  for (const name of LOCALES) {
    const data = JSON.parse(readFileSync(path.join(DIR, name), 'utf8'))
    for (const [key, value] of messages(data)) {
      assert.ok(
        !HTML.test(value),
        `${name} → ${key} contains a tag, which unplugin-vue-i18n refuses: ${value.slice(0, 80)}`
      )
    }
  }
})

test('no message contains a bare @, which the compiler reads as a link', () => {
  for (const name of LOCALES) {
    const data = JSON.parse(readFileSync(path.join(DIR, name), 'utf8'))
    for (const [key, value] of messages(data)) {
      assert.ok(
        !LINKED.test(value.replace(LITERAL, '')),
        `${name} → ${key} has an unescaped @; write it as {'@'}: ${value.slice(0, 80)}`
      )
    }
  }
})

test('the locales carry the same keys as each other', () => {
  const keysOf = name =>
    new Set([...messages(JSON.parse(readFileSync(path.join(DIR, name), 'utf8')))].map(([key]) => key))
  const reference = keysOf('en.json')
  for (const name of LOCALES.filter(n => n !== 'en.json')) {
    const theirs = keysOf(name)
    const missing = [...reference].filter(key => !theirs.has(key))
    const extra = [...theirs].filter(key => !reference.has(key))
    assert.deepEqual(missing, [], `${name} is missing keys`)
    assert.deepEqual(extra, [], `${name} has keys en.json does not`)
  }
})
