import { fibers } from './react.ts'

// Keep X's cell and measurement ref mounted. Let React unmount the post subtree,
// including its media players, and recreate it from the current props on return.
function ownerOf(cell: HTMLElement) {
  return fibers(cell).find(({ stateNode: n }) =>
    n?.props?.item?.id && typeof n.render === 'function' && typeof n.forceUpdate === 'function' &&
    typeof n.getElement === 'function' && n.getElement() === cell,
  )?.stateNode
}

export function parkCard(cell: HTMLElement) {
  const owner = ownerOf(cell)
  if (!owner) return
  const id = owner.props.item.id
  const render = owner.render
  const parked = function (this: typeof owner) {
    const result = render.call(this)
    const view = result?.props?.children
    if (this.props.item.id !== id || view?.props?.testID !== 'cellInnerDiv') return result
    return { ...result, props: { ...result.props, children: { ...view, props: { ...view.props, children: null } } } }
  }
  owner.render = parked
  owner.forceUpdate()
  return {
    id: String(id),
    sameItem: () => owner.props.item.id === id,
    resume(done?: () => void) {
      if (owner.render === parked) owner.render = render
      if (cell.isConnected) owner.forceUpdate(done)
    },
  }
}

export type SavedSlot = { key: string; height: number; top: number; column: number | undefined }
type NativeItem = { id: string; render(...args: unknown[]): unknown }
type RenderList = { _getFinalRenderedItems?: (...args: unknown[]) => unknown }

// On return, X still owns and measures every cell, but a known offscreen item renders no
// contents on its very first React mount. When it comes into range use X's current item.
export function restoreSlots(list: RenderList, slots: Map<string, SavedSlot>) {
  const original = list._getFinalRenderedItems
  if (!original || !slots.size) return
  const wrappers = new WeakMap<NativeItem, NativeItem>()
  const sources = new WeakMap<NativeItem, NativeItem>()
  list._getFinalRenderedItems = function (...args) {
    const rows = original.apply(this, args)
    if (!slots.size || !Array.isArray(rows)) return rows
    return rows.map(row => {
      const item: NativeItem | undefined = row?.item
      if (!item || !slots.has(item.id) || typeof item.render !== 'function') return row
      let wrapper = wrappers.get(item)
      if (!wrapper) {
        wrapper = Object.create(item) as NativeItem
        wrapper.render = (...args) => slots.has(item.id) ? null : item.render(...args)
        wrappers.set(item, wrapper)
        sources.set(wrapper, item)
      }
      return { ...row, item: wrapper }
    })
  }
  return {
    claim(cell: HTMLElement) {
      const owner = ownerOf(cell)
      const source = sources.get(owner?.props?.item)
      const slot = source && slots.get(source.id)
      if (!source || !slot) return
      const id = source.id
      return { slot, card: {
        id, sameItem: () => owner.props.item.id === id,
        resume(done?: () => void) {
          slots.delete(id)
          if (cell.isConnected) owner.forceUpdate(done)
        },
      } }
    },
    stop() {
      slots.clear()
      list._getFinalRenderedItems = original
    },
  }
}
