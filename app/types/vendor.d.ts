/**
 * Types for entry points that ship JavaScript without declarations.
 *
 * `mammoth/mammoth.browser.js` is the prebuilt browser bundle. It is the same
 * API as the package's main entry, which is typed — the bundle simply has no
 * declaration file pointing at it.
 */
declare module 'mammoth/mammoth.browser.js' {
  import type mammoth from 'mammoth'
  const browserMammoth: typeof mammoth
  export default browserMammoth
}
