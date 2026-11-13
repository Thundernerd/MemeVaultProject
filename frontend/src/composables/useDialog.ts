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
// stack is non-empty; `overflow` is its own inline value from before the first dialog.
let scrollLock: { scroller: HTMLElement; overflow: string } | null = null

function onKeydown(e: KeyboardEvent) {
  // Leave Escape alone while an IME is composing or another handler already used it.
  if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented) stack.at(-1)?.close()
}

/** Put a dialog on the stack, taking the Escape listener and scroll lock if it is the first. */
function openDialog(dialog: OpenDialog) {
  if (stack.length === 0) {
    document.addEventListener('keydown', onKeydown)
    const scroller = document.querySelector('main')
    if (scroller) {
      scrollLock = { scroller, overflow: scroller.style.overflow }
      scroller.style.overflow = 'hidden'
    }
  }
  stack.push(dialog)
}

/**
 * Take a dialog off the stack and restore focus to its opener. Releases the Escape
 * listener and scroll lock if it was the last one.
 */
function closeDialog(dialog: OpenDialog) {
  const i = stack.indexOf(dialog)
  if (i === -1) return
  stack.splice(i, 1)
  if (i < stack.length) {
    // Closed out of order (e.g. a parent dialog unmounting with its children still open).
    // Focus is in a dialog above, so leave it there; any dialog above that was opened
    // from inside this one is about to lose its opener, so hand it this dialog's opener.
    for (const above of stack.slice(i)) {
      if (above.opener && dialog.box.value?.contains(above.opener)) above.opener = dialog.opener
    }
  } else if (dialog.opener?.isConnected) {
    dialog.opener.focus()
  }
  dialog.opener = null
  if (stack.length === 0) {
    document.removeEventListener('keydown', onKeydown)
    if (scrollLock) scrollLock.scroller.style.overflow = scrollLock.overflow
    scrollLock = null
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
  const entry: OpenDialog = { close, box, opener: null }
  let active = false

  async function activate() {
    if (active) return
    active = true
    entry.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openDialog(entry)
    await nextTick()
    // The dialog may have closed again before it rendered.
    if (!active) return
    box.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }

  function deactivate() {
    if (!active) return
    active = false
    closeDialog(entry)
  }

  watch(
    () => toValue(open),
    (isOpen) => (isOpen ? void activate() : deactivate()),
    { immediate: true },
  )
  onBeforeUnmount(deactivate)
}
