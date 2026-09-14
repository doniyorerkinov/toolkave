/**
 * Pure logic with no browser dependency: image sniffing, page ranges, date
 * maths, mojibake repair, delimited text. Imported straight from `app/`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCanvas } from '@napi-rs/canvas'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const app = relative => import(pathToFileURL(path.join(ROOT, 'app', relative)).href)
const image = await app('composables/useImage.ts')
const formatters = await app('utils/formatters.ts')
const calc = await app('utils/calc.ts')
const encoding = await app('utils/encoding.ts')
const table = await app('utils/table.ts')
const compare = await app('composables/usePdfCompare.ts')

/** A JPEG whose only content is an EXIF APP1 segment carrying an orientation tag. */
function exifJpeg(orientation, { jfif = false, bigEndian = false } = {}) {
  const jfifSeg = jfif ? [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00] : []
  const tiff = bigEndian
    ? [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    : [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
  const len = payload.length + 2
  return new Uint8Array([0xff, 0xd8, ...jfifSeg, 0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload, 0xff, 0xd9])
}

test('jpegOrientation reads the EXIF tag in either byte order and never throws', () => {
  assert.equal(image.jpegOrientation(exifJpeg(6)), 6)
  assert.equal(image.jpegOrientation(exifJpeg(6, { jfif: true })), 6)
  assert.equal(image.jpegOrientation(exifJpeg(8, { bigEndian: true })), 8)
  assert.equal(image.jpegOrientation(exifJpeg(1)), 1)
  assert.equal(image.jpegOrientation(exifJpeg(9)), 1, 'out-of-range values are treated as upright')
  assert.equal(image.jpegOrientation(new Uint8Array(createCanvas(40, 30).toBuffer('image/jpeg', 80))), 1, 'no EXIF at all')
  assert.equal(image.jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1, 'not a JPEG')
  assert.equal(image.jpegOrientation(exifJpeg(6).slice(0, 14)), 1, 'truncated')
})

test('sniffImage goes by magic bytes', () => {
  assert.equal(image.sniffImage(new Uint8Array(createCanvas(4, 4).toBuffer('image/png'))), 'png')
  assert.equal(image.sniffImage(new Uint8Array(createCanvas(4, 4).toBuffer('image/jpeg', 80))), 'jpeg')
  assert.equal(image.sniffImage(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), 'heic')
  assert.equal(image.sniffImage(new Uint8Array([1, 2, 3])), null)
})

test('page ranges parse leniently and format back compactly', () => {
  assert.deepEqual(formatters.parsePageRanges('1-3, 5, 8-10', 10), [0, 1, 2, 4, 7, 8, 9])
  assert.deepEqual(formatters.parsePageRanges('5-3', 10), [2, 3, 4], 'reversed ranges work')
  assert.deepEqual(formatters.parsePageRanges('0, 11, x, 2', 10), [1], 'out-of-range and junk ignored')
  assert.deepEqual(formatters.parsePageRanges('', 10), [])
  assert.equal(formatters.formatPageRanges([0, 1, 2, 4, 7, 8, 9]), '1-3, 5, 8-10')
  assert.equal(formatters.formatPageRanges([3, 3, 1]), '2, 4')
  assert.equal(formatters.formatBytes(2048), '2.0 KB')
  assert.equal(formatters.withSuffix('report.final.pdf', '-merged'), 'report.final-merged.pdf')
})

test('date differences are calendar-aware', () => {
  const d = calc.dateDifference(new Date(2024, 0, 31), new Date(2024, 2, 1))
  assert.deepEqual([d.months, d.days, d.totalDays], [1, 1, 30], '31 Jan + 1 month clamps to 29 Feb')
  const leap = calc.dateDifference(new Date(2000, 1, 29), new Date(2001, 1, 28))
  assert.deepEqual([leap.years, leap.months, leap.days], [1, 0, 0], 'a 29 Feb birthday is a year older on 28 Feb')
  const e = calc.dateDifference(new Date(1990, 0, 15), new Date(2026, 8, 11))
  assert.deepEqual([e.years, e.months, e.days], [36, 7, 27])
  assert.equal(calc.dateDifference(new Date('nope'), new Date()), null)
})

test('money and unit helpers', () => {
  const inclusive = calc.vat(112, 12, true)
  assert.ok(Math.abs(inclusive.net - 100) < 1e-9 && Math.abs(inclusive.tax - 12) < 1e-9 && inclusive.gross === 112, JSON.stringify(inclusive))
  assert.deepEqual(calc.vat(100, 12, false), { net: 100, tax: 12, gross: 112 })
  assert.equal(calc.loan(100_000, 0, 10).monthly, 10_000, 'zero-rate loan does not divide by zero')
  assert.ok(Math.abs(calc.loan(100_000, 18, 60).monthly - 2539.34) < 0.01)
  assert.equal(calc.convertUnit(100, 'temperature', 'c', 'f'), 212)
  assert.ok(Math.abs(calc.convertUnit(1, 'length', 'mi', 'km') - 1.609344) < 1e-9)
})

test('mojibake repair fixes broken Cyrillic and leaves clean text alone', () => {
  const broken = encoding.repairText('ÐŸÑ€Ð¸Ð²ÐµÑ‚, Ð¼Ð¸Ñ€!')
  assert.equal(broken.changed, true)
  assert.equal(broken.text, 'Привет, мир!')
  const twice = encoding.repairText('РџСЂРёРІРµС‚, РјРёСЂ!')
  assert.equal(twice.text, 'Привет, мир!', 'UTF-8 read as windows-1251')
  for (const clean of ['Привет, мир!', 'Plain English text.', "Oʻzbekiston Respublikasi"]) {
    assert.equal(encoding.repairText(clean).changed, false, clean)
  }
  const bytes = new TextEncoder().encode('Привет')
  assert.equal(encoding.detectEncoding(bytes).best.label, 'utf-8')
  const cp1251 = encoding.encodeToBytes('Привет, мир', 'windows-1251')
  assert.equal(encoding.detectEncoding(cp1251).best.text, 'Привет, мир')
})

test('delimited text: semicolons with decimal commas, quoting, typed JSON', () => {
  assert.equal(table.guessDelimiter('name;price\nСтол;1,50\nСтул;2,25\n'), ';')
  assert.equal(table.guessDelimiter('a,b\n1,2\n'), ',')
  assert.equal(table.gridToCsv([['a', 'b,c'], ['"q"', 'x\ny']]), 'a,"b,c"\r\n"""q""","x\ny"')
  assert.ok(table.gridToCsv([['a']], ',', true).startsWith('\uFEFF'), 'BOM on request')
  assert.deepEqual(table.gridToJson([['id', 'code'], ['1', '007']]), [{ id: 1, code: '007' }], 'leading zeros stay text')
  assert.deepEqual(table.jsonToGrid([{ a: 1, b: { c: 'x' } }, { a: 2 }]).grid, [['a', 'b.c'], ['1', 'x'], ['2', '']])
})

test('page comparison classifies identical, changed, added and removed', () => {
  const result = compare.comparePages(['same', 'old  text', 'gone'], ['same', 'old text', 'gone', 'new'])
  assert.deepEqual(result.map(r => r.status), ['identical', 'identical', 'identical', 'added'])
  assert.deepEqual(compare.comparePages(['a', 'b'], ['a']).map(r => r.status), ['identical', 'removed'])
  assert.deepEqual(compare.summarise(result), { identical: 3, changed: 0, added: 1, removed: 0 })
})

test('body fat estimate differs by sex, which is the point of asking', () => {
  // Deurenberg: 1.2*BMI + 0.23*age - 10.8*(male?1:0) - 5.4
  // At BMI 24, age 30: man 1.2*24 + 6.9 - 10.8 - 5.4 = 19.5; woman = 30.3.
  const man = calc.bodyFatPercent(24, 30, 'male')
  const woman = calc.bodyFatPercent(24, 30, 'female')
  assert.ok(Math.abs(man - 19.5) < 0.01, `man came out ${man}`)
  assert.ok(Math.abs(woman - 30.3) < 0.01, `woman came out ${woman}`)
  assert.ok(Math.abs(woman - man - 10.8) < 0.01, 'the gap is the sex term itself')

  assert.equal(calc.bodyFatPercent(0, 30, 'male'), null)
  assert.equal(calc.bodyFatPercent(24, 0, 'male'), null)
})

test('the same percentage lands in different bands for men and women', () => {
  // 22% is average for a man and athletic-to-fit for a woman.
  assert.equal(calc.fatBand(22, 'male'), 'average')
  assert.equal(calc.fatBand(22, 'female'), 'fit')
  assert.equal(calc.fatBand(12, 'male'), 'athletic')
  assert.equal(calc.fatBand(12, 'female'), 'essential')
  assert.equal(calc.fatBand(40, 'male'), 'high')
  assert.equal(calc.fatBand(40, 'female'), 'high')
})

test('BMI bands do not differ by sex, and the tool must not pretend they do', () => {
  // Same weight and height, same category — this is the claim the page makes.
  const a = calc.bmi(70, 175)
  assert.equal(a.category, 'normal')
  assert.ok(Math.abs(a.value - 22.857) < 0.01, `bmi came out ${a.value}`)
  assert.equal(calc.bmi(85, 175).category, 'overweight')
  assert.equal(calc.bmi(95, 175).category, 'obese')
  assert.equal(calc.bmi(50, 175).category, 'underweight')
})
