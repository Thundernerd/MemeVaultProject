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

// The media modal's <video controls> is a Tab stop too, and the first one in its box.
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  '[tabindex]',
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(',')

/** The visible elements in `root` that Tab stops on, in document order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.getClientRects().length > 0,
  )
}

/** Whether `node` comes after `ref` in the document, or is inside it. */
function isAfter(node: Node, ref: Node): boolean {
  return (ref.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

// Wrap Tab at the ends of `root` and pull focus back in from outside it; the browser
// moves focus between the elements in between. Ends are found by position, not identity,
// because focus can sit on an element that is no longer a stop (a button disabled while
// focused, such as Upload or Delete going busy).
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const stops = tabbables(root)
  if (!stops.length) return
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  const current = document.activeElement
  let target: HTMLElement | null = null
  if (!current || !root.contains(current)) target = e.shiftKey ? last : first
  else if (e.shiftKey && (current === first || !isAfter(current, first))) target = last
  else if (!e.shiftKey && (current === last || isAfter(current, last))) target = first
  if (target) {
    e.preventDefault()
    target.focus()
  }
}

function onKeydown(e: KeyboardEvent) {
  const top = stack.at(-1)
  if (!top || e.defaultPrevented) return
  // Leave Escape alone while an IME is composing.
  if (e.key === 'Escape' && !e.isComposing) top.close()
  // Tab stays inside the innermost dialog.
  else if (e.key === 'Tab' && top.box.value) trapTab(e, top.box.value)
}

/** Put a dialog on the stack, taking the keydown listener and scroll lock if it is the first. */
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
 * Take a dialog off the stack and restore focus to its opener. Releases the keydown
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
 * Escape anywhere on the page calls `close`, Tab and Shift+Tab wrap around inside `box`,
 * and the scrolling `<main>` is locked (the app scrolls in `<main>`, not the page; see
 * style.css). When it closes, focus returns to the element that had it before the dialog
 * opened and `<main>` scrolls again.
 *
 * Dialogs may nest: Escape closes and Tab is trapped in only the most recently opened
 * one, and `<main>`
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
