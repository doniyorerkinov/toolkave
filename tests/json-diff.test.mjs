/**
 * Comparing JSON by meaning.
 *
 * The cases that matter are the ones a line diff gets wrong: reordered keys,
 * reformatting, and a real change buried among cosmetic ones.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const { diffJson, parseJson } = await import(pathToFileURL(path.join(ROOT, 'shared/json-diff.ts')).href)

test('key order and whitespace are not differences', () => {
  const a = JSON.parse('{"b":2,"a":1}')
  const b = JSON.parse('{\n  "a": 1,\n  "b": 2\n}')
  const result = diffJson(a, b)
  assert.deepEqual(result.changes, [])
  assert.equal(result.similarity, 1)
})

test('a changed value is reported with its path', () => {
  const result = diffJson({ user: { name: 'Ada', age: 36 } }, { user: { name: 'Ada', age: 37 } })
  assert.equal(result.changes.length, 1)
  assert.deepEqual(result.changes[0], { path: 'user.age', kind: 'changed', left: 36, right: 37 })
})

test('added and removed keys are told apart', () => {
  const result = diffJson({ a: 1, gone: true }, { a: 1, fresh: 'yes' })
  const byKind = Object.fromEntries(result.changes.map(c => [c.kind, c.path]))
  assert.equal(byKind.removed, 'gone')
  assert.equal(byKind.added, 'fresh')
  assert.equal(result.changes.length, 2)
})

test('arrays are compared position by position', () => {
  const result = diffJson({ tags: ['a', 'b', 'c'] }, { tags: ['a', 'x', 'c', 'd'] })
  const paths = result.changes.map(c => `${c.kind} ${c.path}`)
  assert.deepEqual(paths.sort(), ['added tags[3]', 'changed tags[1]'])
})

test('a type change is one change, not a removal and an addition', () => {
  const result = diffJson({ id: 7 }, { id: '7' })
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0].kind, 'changed')
  assert.equal(result.changes[0].left, 7)
  assert.equal(result.changes[0].right, '7')
})

test('awkward keys come back as a path you can paste', () => {
  const result = diffJson({ 'not-an-ident': 1 }, { 'not-an-ident': 2 })
  assert.equal(result.changes[0].path, '["not-an-ident"]')
})

test('similarity is 1 for identical and falls as things differ', () => {
  assert.equal(diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 }).similarity, 1)
  const half = diffJson({ a: 1, b: 2 }, { a: 1, b: 99 })
  assert.ok(half.similarity > 0.4 && half.similarity < 0.6, `expected about a half, got ${half.similarity}`)
  assert.equal(diffJson({ a: 1 }, { b: 1 }).similarity, 0)
})

test('nested additions count for their whole subtree', () => {
  const result = diffJson({}, { config: { a: 1, b: 2, c: 3 } })
  assert.equal(result.changes.length, 1)
  assert.equal(result.total, 3, 'three leaves were added, not one')
})

test('parsing says which line is wrong', () => {
  const good = parseJson('{"a": 1}')
  assert.deepEqual(good.value, { a: 1 })
  assert.equal(good.error, null)

  const bad = parseJson('{\n  "a": 1,\n  "b": ,\n}')
  assert.equal(bad.value, null)
  assert.ok(bad.error.message)
  assert.equal(bad.error.line, 3, `expected line 3, got ${bad.error.line}`)
  assert.ok(bad.error.column > 0)
})

test('the root itself can be the difference', () => {
  const result = diffJson([1, 2], { a: 1 })
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0].path, '(root)')
})

const { findJsonError } = await import(pathToFileURL(path.join(ROOT, 'shared/json-scan.ts')).href)

test('the scanner points at the real problem, in words', () => {
  const cases = [
    ['{"a": 1,}', 'Trailing comma before }', 1],
    ['[1, 2,]', 'Trailing comma before ]', 1],
    ["{'a': 1}", 'JSON strings use double quotes, not single', 1],
    ['{\n  // a note\n  "a": 1\n}', 'JSON has no comments', 2],
    ['{"a": 1}\n{"b": 2}', 'Extra content after the end of the document', 2],
    ['{"a": "no end}', 'The string is never closed', 1],
    ['{"a": 1', 'The object is never closed', 1],
    ['{"a" 1}', 'Expected : after the key', 1],
    ['', 'Nothing to check', 1]
  ]
  for (const [text, expected, line] of cases) {
    const problem = findJsonError(text)
    assert.ok(problem, `${JSON.stringify(text)} should be rejected`)
    assert.equal(problem.message, expected, `message for ${JSON.stringify(text)}`)
    assert.equal(problem.line, line, `line for ${JSON.stringify(text)}`)
  }
})

test('the scanner agrees with JSON.parse on what is valid', () => {
  const valid = [
    '{}', '[]', 'null', 'true', '0', '-1.5e10', '"text"',
    '{"nested": {"deep": [1, 2, {"x": null}]}}',
    '{"escaped": "quote \\" and \\\\ and \\u00e9"}',
    '  \n {"padded": true} \n '
  ]
  for (const text of valid) {
    assert.equal(findJsonError(text), null, `${text} should pass the scanner`)
    assert.doesNotThrow(() => JSON.parse(text), `${text} should pass JSON.parse`)
  }
  const invalid = ['{', '[1 2]', '"unterminated', '01', '.5', '{"a":}', 'tru', '{"a": 1} extra']
  for (const text of invalid) {
    assert.ok(findJsonError(text), `${text} should be rejected by the scanner`)
    assert.throws(() => JSON.parse(text), `${text} should be rejected by JSON.parse`)
  }
})
