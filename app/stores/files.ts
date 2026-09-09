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

  const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))
  const hasFiles = computed(() => files.value.length > 0)

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

  /** Feed the result back in as the input, so the next tool starts from it. */
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
  }

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
    totalSize,
    hasFiles,
    add,
    remove,
    move,
    setResult,
    chainResult,
    reset
  }
})
