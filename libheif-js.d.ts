/**
 * `libheif-js` ships type definitions for its raw emscripten module but not
 * for the ES module entry the app imports, which carries the WebAssembly
 * inline instead of fetching a second file. Only the three calls `useImage`
 * makes are declared.
 */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    /** Fills `into` with RGBA pixels; the callback gets null on failure. */
    display(into: ImageData, done: (result: ImageData | null) => void): void
  }

  class HeifDecoder {
    decode(data: Uint8Array | ArrayBuffer): HeifImage[]
  }

  /** Emscripten factory: hands back the ready module (awaiting it is safe). */
  export default function createLibheif(): Promise<{ HeifDecoder: typeof HeifDecoder }>
  export { HeifDecoder }
  export type { HeifImage }
}
