/**
 * The developer tools, where the whole value is the edge case.
 *
 * None of these is hard to write badly: a case converter that mangles an
 * acronym, a base converter that silently rounds a 64-bit id, a cron reader
 * that accepts an hour of 25 and describes a job which will never run. Each
 * one looks fine in a demo and is wrong in use, which is exactly the shape of
 * bug a test is for.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const dev = await import(pathToFileURL(path.join(ROOT, 'shared/devtools.ts')).href)

test('words survive acronyms, which is where case converters usually break', () => {
  assert.deepEqual(dev.words('parseHTMLDocument'), ['parse', 'HTML', 'Document'])
  assert.deepEqual(dev.words('getURLPath'), ['get', 'URL', 'Path'])
  assert.deepEqual(dev.words('user_id'), ['user', 'id'])
  assert.deepEqual(dev.words('background-color'), ['background', 'color'])
  assert.deepEqual(dev.words('  spaced  out  '), ['spaced', 'out'])
  assert.deepEqual(dev.words('XMLHttpRequest'), ['XML', 'Http', 'Request'])
})

test('every case style round-trips an acronym without shattering it', () => {
  assert.equal(dev.toCase('parseHTMLDocument', 'snake'), 'parse_html_document')
  assert.equal(dev.toCase('parseHTMLDocument', 'kebab'), 'parse-html-document')
  assert.equal(dev.toCase('parseHTMLDocument', 'camel'), 'parseHtmlDocument')
  assert.equal(dev.toCase('parseHTMLDocument', 'pascal'), 'ParseHtmlDocument')
  assert.equal(dev.toCase('parseHTMLDocument', 'constant'), 'PARSE_HTML_DOCUMENT')
  assert.equal(dev.toCase('parseHTMLDocument', 'title'), 'Parse Html Document')
  assert.equal(dev.toCase('hello world again', 'sentence'), 'Hello world again')
  assert.equal(dev.toCase('', 'camel'), '', 'empty input must not throw')
})

test('bases go through BigInt, because a 64-bit id is the reason to use this', () => {
  // Past 2^53 Number is already lying; a Telegram chat id lives here.
  const big = dev.convertBase('9007199254740993', 10)
  assert.equal(big.decimal, '9007199254740993')
  assert.equal(big.hex, '20000000000001')

  assert.equal(dev.convertBase('ff', 16).decimal, '255')
  assert.equal(dev.convertBase('1010', 2).decimal, '10')
  assert.equal(dev.convertBase('777', 8).decimal, '511')
  assert.equal(dev.convertBase('-ff', 16).decimal, '-255')
  assert.equal(dev.convertBase('  de_ad  ', 16).hex, 'dead', 'spacing and separators are ignored')

  // A digit outside the base is a mistake, not something to guess at.
  assert.equal(dev.convertBase('2', 2), null)
  assert.equal(dev.convertBase('xyz', 16), null)
  assert.equal(dev.convertBase('', 10), null)
})

test('URL encoding covers the characters the spec reserves', () => {
  assert.equal(dev.encodeComponent("a b&c=d"), 'a%20b%26c%3Dd')
  // encodeURIComponent leaves these alone; strict servers do not.
  assert.equal(dev.encodeComponent("it's (a) *test*!"), 'it%27s%20%28a%29%20%2Atest%2A%21')
  assert.equal(dev.decodeComponent('a%20b').text, 'a b')
  assert.equal(dev.decodeComponent('a+b').text, 'a b', 'a plus is a space in a query string')

  const broken = dev.decodeComponent('%E0%A4%A')
  assert.equal(broken.error, true, 'a truncated escape must be reported, not swallowed')
})

test('a JWT is decoded, never verified, and its dates are read back', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) - 60
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'abc', name: 'Дилноза', exp })}.fakesignature`

  const out = dev.decodeJwt(token)
  assert.equal(out.header.alg, 'HS256')
  assert.equal(out.payload.name, 'Дилноза', 'the payload is UTF-8, not latin1')
  assert.equal(out.expired, true)
  assert.ok(out.expiresAt instanceof Date)
  assert.equal(out.signature, 'fakesignature')

  assert.equal(dev.decodeJwt('not.a.token'), null)
  assert.equal(dev.decodeJwt('only.two'), null)
})

test('an epoch is read as seconds or milliseconds, and says which', () => {
  const seconds = dev.readEpoch('1758000000')
  assert.equal(seconds.unit, 'seconds')
  assert.equal(seconds.date.getUTCFullYear(), 2025)

  const millis = dev.readEpoch('1758000000000')
  assert.equal(millis.unit, 'milliseconds')
  assert.equal(millis.date.getUTCFullYear(), 2025)

  assert.equal(dev.readEpoch('0').unit, 'seconds')
  assert.equal(dev.readEpoch('not a number'), null)
})

test('cron is described in words, and an hour of 25 is refused', () => {
  assert.match(dev.readCron('0 9 * * 1').description, /09:00/)
  assert.match(dev.readCron('0 9 * * 1').description, /Monday/)
  assert.match(dev.readCron('*/15 * * * *').description, /every 15 minutes/)
  assert.match(dev.readCron('0 0 1 1 *').description, /January/)

  // The real cron failure is not a syntax error: it is a job that never fires.
  const bad = dev.readCron('0 25 * * *')
  assert.equal(bad.ok, false)
  assert.match(bad.description, /0-23/)

  assert.equal(dev.readCron('* * *').ok, false)
  assert.match(dev.readCron('* * *').description, /five fields/)
})
