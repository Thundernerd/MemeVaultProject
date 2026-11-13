import { nextTick, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

interface OpenDialog {
  close: () => void
  box: Readonly<Ref<HTMLElement | null>>
  /** Where focus goes back to when this dialog closes. */
  opener: HTMLElement | null
}

// Open dialogs, innermost last. Shared by every useDialog instance so that nested
// dialogs behave as one stack instead of each acting as if it were alone.
const stack: OpenDialog[] = []

// The app scrolls in `<main>`, not the page (see style.css). It is locked while the
// stack is non-empty; this holds its own inline overflow from before the first dialog.
let scroller: HTMLElement | null = null
let scrollerOverflow = ''

function onKeydown(e: KeyboardEvent) {
  // Leave Escape alone while an IME is composing or another handler already used it.
  if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented) stack.at(-1)?.close()
}

function push(dialog: OpenDialog) {
  if (stack.length === 0) {
    document.addEventListener('keydown', onKeydown)
    scroller = document.querySelector('main')
    if (scroller) {
      scrollerOverflow = scroller.style.overflow
      scroller.style.overflow = 'hidden'
    }
  }
  stack.push(dialog)
}

function remove(dialog: OpenDialog) {
  const i = stack.indexOf(dialog)
  if (i === -1) return
  stack.splice(i, 1)
  const above = stack[i]
  if (above) {
    // Closed out of order (e.g. a parent dialog unmounting with its child still open).
    // Focus is in the dialog above, so leave it there; if that dialog was opened from
    // inside this one, its opener is about to go away, so hand it this dialog's opener.
    if (above.opener && dialog.box.value?.contains(above.opener)) above.opener = dialog.opener
  } else if (dialog.opener?.isConnected) {
    dialog.opener.focus()
  }
  dialog.opener = null
  if (stack.length === 0) {
    document.removeEventListener('keydown', onKeydown)
    if (scroller) scroller.style.overflow = scrollerOverflow
    scroller = null
  }
}

/**
 * Make a modal box behave like a dialog for keyboard users.
 *
 * While `open` is true, focus moves to the `[data-autofocus]` element inside `box`,
 * Escape anywhere on the page calls `close`, and the scrolling `<main>` is locked
 * (the app scrolls in `<main>`, not the page; see style.css). When it closes, focus
 * returns to the element that had it before the dialog opened and `<main>` scrolls again.
 *
 * Dialogs may nest: Escape closes only the most recently opened one, and `<main>`
 * stays locked until the last one closes, in whichever order they close.
 */
export function useDialog(
  open: MaybeRefOrGetter<boolean>,
  close: () => void,
  box: Readonly<Ref<HTMLElement | null>>,
) {
  const self: OpenDialog = { close, box, opener: null }
  let active = false

  async function activate() {
    if (active) return
    active = true
    self.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    push(self)
    await nextTick()
    // The dialog may have closed again before it rendered.
    if (!active) return
    box.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }

  function deactivate() {
    if (!active) return
    active = false
    remove(self)
  }

  watch(
    () => toValue(open),
    (isOpen) => (isOpen ? void activate() : deactivate()),
    { immediate: true },
  )
  onBeforeUnmount(deactivate)
}
