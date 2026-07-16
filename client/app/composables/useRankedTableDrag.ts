import Sortable from 'sortablejs'
import type { Ref } from 'vue'

interface RankedTableDragOptions {
  onReorder: (group: string, oldIndex: number, newIndex: number) => void | Promise<void>
}

function restoreDraggedElement(container: HTMLElement, item: HTMLElement, oldIndex: number) {
  item.remove()
  const previousSibling = container.children.item(oldIndex)
  if (previousSibling) container.insertBefore(item, previousSibling)
  else container.appendChild(item)
}

export function useRankedTableDrag(
  root: Ref<HTMLElement | null>,
  { onReorder }: RankedTableDragOptions
) {
  const instances = new Map<HTMLElement, Sortable>()
  let observer: MutationObserver | null = null
  let observedRoot: HTMLElement | null = null
  let scanQueued = false

  function destroyDetachedInstances() {
    for (const [element, instance] of instances) {
      if (!element.isConnected) {
        instance.destroy()
        instances.delete(element)
      }
    }
  }

  function scan() {
    scanQueued = false
    const rootElement = root.value
    if (!rootElement) return

    destroyDetachedInstances()
    const containers = [
      ...(rootElement.matches('[data-rank-group]') ? [rootElement] : []),
      ...rootElement.querySelectorAll<HTMLElement>('[data-rank-group]')
    ]

    for (const container of containers) {
      const target = container.dataset.rankDirect === 'true'
        ? container
        : container.querySelector<HTMLElement>('tbody')
      if (!target || instances.has(target)) continue

      const instance = Sortable.create(target, {
        animation: 180,
        handle: '.rank-drag-handle',
        ghostClass: 'opacity-40',
        chosenClass: 'bg-elevated',
        onMove: () => container.dataset.rankDisabled !== 'true',
        onUpdate: (event) => {
          if (
            event.oldIndex === undefined
            || event.newIndex === undefined
            || event.oldIndex === event.newIndex
          ) return

          // Sortable muta DOM-ul direct. Il restauram, apoi lasam Vue sa aplice
          // ordinea noua din array-ul reactiv, evitand conflictul cu Virtual DOM.
          restoreDraggedElement(event.from, event.item, event.oldIndex)

          void onReorder(
            container.dataset.rankGroup ?? '',
            event.oldIndex,
            event.newIndex
          )
        }
      })
      instances.set(target, instance)
    }
  }

  function queueScan() {
    if (scanQueued) return
    scanQueued = true
    queueMicrotask(scan)
  }

  function observeRoot(element: HTMLElement | null) {
    if (element === observedRoot) return
    observer?.disconnect()
    observer = null
    observedRoot = element
    destroyDetachedInstances()
    if (!element) return
    scan()
    observer = new MutationObserver(queueScan)
    observer.observe(element, { childList: true, subtree: true })
  }

  onMounted(async () => {
    await nextTick()
    observeRoot(root.value)
  })

  watch(root, element => observeRoot(element), { flush: 'post' })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observedRoot = null
    for (const instance of instances.values()) instance.destroy()
    instances.clear()
  })
}
