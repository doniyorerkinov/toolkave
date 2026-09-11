import { defineStore } from 'pinia'

export interface HeldFile {
  id: string
  name: string
  size: number
  type: string
  data: Uint8Array
}

export interface ToolResult {
  name: string
  type: string
  data: Uint8Array
  /** Combined size of the inputs, so the result card can show before/after. */
  sourceSize: number
  /**
   * One short line about what changed, for tools whose work the byte count
   * does not show — a resized page looks identical in any viewer that fits
   * the page to the window.
   */
  note?: string
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Files currently being worked on.
 *
 * Held in memory so tools can chain without a re-upload ("merged, now split").
 * Deliberately not persisted: the whole promise of the site is that files never
 * leave the device, and writing them to storage would outlive the session in a
 * way users would not expect.
 *
 * A full page reload clears this. Client-side navigation between tools does not,
 * which is what chaining relies on.
 */
export const useFilesStore = defineStore('files', () => {
  const files = ref<HeldFile[]>([])
  const result = ref<ToolResult | null>(null)
  const busy = ref(false)
  const error = ref<string | null>(null)

  /**
   * Which tool the current files belong to. Without this the store leaks
   * between tools: opening Split after Merge would silently inherit the merge
   * inputs as the file to split.
   */
  const ownerToolId = ref<string | null>(null)

  const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))
  const hasFiles = computed(() => files.value.length > 0)

  /** Anything the user would lose by navigating away. */
  const hasWork = computed(() => files.value.length > 0 || result.value !== null)

  /**
   * Called when a tool page opens. Clears anything left behind by a different
   * tool, so a stale file can never be picked up as the new tool's input.
   */
  function claim(toolId: string) {
    if (ownerToolId.value && ownerToolId.value !== toolId) reset()
    ownerToolId.value = toolId
  }

  async function add(incoming: File[]) {
    const loaded = await Promise.all(
      incoming.map(async file => ({
        id: makeId(),
        name: file.name,
        size: file.size,
        type: file.type,
        data: new Uint8Array(await file.arrayBuffer())
      }))
    )
    files.value = [...files.value, ...loaded]
  }

  function remove(id: string) {
    files.value = files.value.filter(f => f.id !== id)
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= files.value.length) return
    const next = [...files.value]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    files.value = next
  }

  function setResult(next: ToolResult | null) {
    result.value = next
  }

  /**
   * Feed the result back in as the input, so the next tool starts from it.
   *
   * Ownership is released at the same time: the files become a hand-off, so
   * `claim()` on whichever tool page opens next adopts them instead of
   * discarding them, and the leave-page prompt stays quiet.
   */
  function chainResult() {
    if (!result.value) return
    files.value = [
      {
        id: makeId(),
        name: result.value.name,
        size: result.value.data.byteLength,
        type: result.value.type,
        data: result.value.data
      }
    ]
    result.value = null
    ownerToolId.value = null
  }

  /** Whether the current files are a hand-off waiting for a tool to adopt them. */
  const handedOff = computed(() => ownerToolId.value === null && files.value.length > 0)

  function reset() {
    files.value = []
    result.value = null
    error.value = null
    busy.value = false
  }

  return {
    files,
    result,
    busy,
    error,
    ownerToolId,
    totalSize,
    hasFiles,
    hasWork,
    handedOff,
    claim,
    add,
    remove,
    move,
    setResult,
    chainResult,
    reset
  }
})
