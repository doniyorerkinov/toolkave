import type { Ref } from 'vue'

/**
 * Close a popup when the pointer or the Escape key says so.
 *
 * Both menus in the header need exactly this and there is nothing
 * tool-specific about it. `pointerdown` in the capture phase rather than
 * `click`, so a press that starts outside closes the menu before the element
 * underneath reacts to it.
 */
export function useDismissable(open: Ref<boolean>, root: Ref<HTMLElement | null>) {
  function onPointerDown(event: PointerEvent) {
    const target = event.target
    if (target instanceof Node && root.value?.contains(target)) return
    open.value = false
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open.value = false
  }

  // Listeners only exist while the menu does, rather than sitting on the
  // document for the life of the page.
  watch(open, isOpen => {
    if (!import.meta.client) return
    if (isOpen) {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeydown)
    }
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) return
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  })
}
