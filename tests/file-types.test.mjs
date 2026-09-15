/**
 * Whether a file is allowed in, decided without trusting the browser.
 *
 * A real report from a real machine: dropping a `.mkv` on the video tools was
 * refused with "Only MP4, QUICKTIME, X-MSVIDEO, X-MATROSKA, WEBM, 3GPP files
 * can be used" — a message that lists the very format being refused, in names
 * nobody recognises. Both halves of that are tested here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const ft = await import(pathToFileURL(path.join(ROOT, 'shared/file-types.ts')).href)
const media = await import(pathToFileURL(path.join(ROOT, 'shared/media.ts')).href)

const VIDEO = media.VIDEO_TYPES.join(',')
const AUDIO = media.AUDIO_TYPES.join(',')

test('a Matroska file with no type at all is still a video', () => {
  // Windows has no registered media type for Matroska, so Chrome reports "".
  // This is the exact file that was rejected.
  assert.ok(ft.matchesAccept({ name: "67 - I'm Back.mkv", type: '' }, VIDEO))
  // Upper case extensions come off cameras constantly.
  assert.ok(ft.matchesAccept({ name: 'CLIP.MKV', type: '' }, VIDEO))
})

test('the other formats browsers routinely fail to type', () => {
  for (const [name, accept] of [
    ['song.opus', AUDIO], ['track.flac', AUDIO], ['voice.m4a', AUDIO],
    ['note.oga', AUDIO], ['clip.mov', VIDEO], ['old.avi', VIDEO], ['phone.3gp', VIDEO]
  ]) {
    assert.ok(ft.matchesAccept({ name, type: '' }, accept), `${name} should be accepted with no type`)
  }
})

test('a correct type is still enough on its own', () => {
  // A file with the right type but an extension we do not list must pass:
  // trusting only the extension would be the same bug the other way round.
  assert.ok(ft.matchesAccept({ name: 'recording', type: 'video/mp4' }, VIDEO))
  assert.ok(ft.matchesAccept({ name: 'blob', type: 'audio/mpeg' }, AUDIO))
})

test('the wrong file is still refused', () => {
  assert.ok(!ft.matchesAccept({ name: 'report.pdf', type: 'application/pdf' }, VIDEO))
  assert.ok(!ft.matchesAccept({ name: 'photo.jpg', type: 'image/jpeg' }, VIDEO))
  assert.ok(!ft.matchesAccept({ name: 'song.mp3', type: 'audio/mpeg' }, VIDEO))
  // No extension and no type is not a free pass.
  assert.ok(!ft.matchesAccept({ name: 'mystery', type: '' }, VIDEO))
})

test('a wildcard falls back to extensions when the type is missing', () => {
  assert.ok(ft.matchesAccept({ name: 'shot.heic', type: '' }, 'image/*'))
  assert.ok(ft.matchesAccept({ name: 'shot.png', type: 'image/png' }, 'image/*'))
  assert.ok(!ft.matchesAccept({ name: 'clip.mkv', type: '' }, 'image/*'))
})

test('formats are named the way people know them, not by MIME subtype', () => {
  const label = ft.acceptLabel(VIDEO)
  assert.equal(label, 'MP4, MOV, AVI, MKV, WEBM, 3GP')
  // The names that caused the complaint must be gone.
  for (const wrong of ['QUICKTIME', 'X-MSVIDEO', 'X-MATROSKA', '3GPP']) {
    assert.ok(!label.includes(wrong), `${wrong} is not a name anybody recognises`)
  }
  assert.equal(ft.acceptLabel('image/jpeg,image/png,image/heic'), 'JPG, PNG, HEIC')
  // The same format spelled twice collapses to one name.
  assert.equal(ft.acceptLabel('audio/wav,audio/x-wav'), 'WAV')
})

test('the file picker is given extensions as well as types', () => {
  const attr = ft.acceptAttribute(VIDEO)
  // Without these the OS dialog greys the file out and it cannot even be chosen.
  for (const extension of ['.mkv', '.mov', '.avi', '.mp4', '.webm', '.3gp']) {
    assert.ok(attr.includes(extension), `the picker needs ${extension} spelled out`)
  }
  assert.ok(attr.includes('video/x-matroska'), 'the MIME types must survive too')
})

test('extensions are read off the end of the name, dots in the name and all', () => {
  assert.equal(ft.extensionOf("67 - I'm Back.mkv"), 'mkv')
  assert.equal(ft.extensionOf('my.holiday.video.MP4'), 'mp4')
  assert.equal(ft.extensionOf('no-extension'), '')
  assert.equal(ft.extensionOf('trailing.'), '')
})

test('the media size cap is far above the site default', () => {
  // 100 MB is right for a PDF and stops two minutes of phone video.
  assert.ok(media.MEDIA_MAX_SIZE > 100 * 1024 * 1024)
  assert.equal(media.MEDIA_MAX_SIZE, 500 * 1024 * 1024)
})
