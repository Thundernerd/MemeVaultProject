import { nextTick, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/**
 * Make a modal box behave like a dialog for keyboard users.
 *
 * While `open` is true, focus moves to the `[data-autofocus]` element inside `box`,
 * Escape anywhere on the page calls `close`, and the scrolling `<main>` is locked
 * (the app scrolls in `<main>`, not the page; see style.css). When it closes, focus
 * returns to the element that had it before the dialog opened and `<main>` scrolls again.
 */
export function useDialog(
  open: MaybeRefOrGetter<boolean>,
  close: () => void,
  box: Readonly<Ref<HTMLElement | null>>,
) {
  let active = false
  let opener: HTMLElement | null = null
  let scroller: HTMLElement | null = null
  let scrollerOverflow = ''

  function onKeydown(e: KeyboardEvent) {
    // Leave Escape alone while an IME is composing or another handler already used it.
    if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented) close()
  }

  async function activate() {
    if (active) return
    active = true
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeydown)
    scroller = document.querySelector('main')
    if (scroller) {
      scrollerOverflow = scroller.style.overflow
      scroller.style.overflow = 'hidden'
    }
    await nextTick()
    // The dialog may have closed again before it rendered.
    if (!active) return
    box.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }

  function deactivate() {
    if (!active) return
    active = false
    document.removeEventListener('keydown', onKeydown)
    if (scroller) scroller.style.overflow = scrollerOverflow
    scroller = null
    if (opener?.isConnected) opener.focus()
    opener = null
  }

  watch(
    () => toValue(open),
    (isOpen) => (isOpen ? void activate() : deactivate()),
    { immediate: true },
  )
  onBeforeUnmount(deactivate)
}
