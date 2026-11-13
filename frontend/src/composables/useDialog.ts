import { nextTick, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

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

/**
 * Make a modal box behave like a dialog for keyboard users.
 *
 * While `open` is true, focus moves to the `[data-autofocus]` element inside `box`,
 * Escape anywhere on the page calls `close`, Tab and Shift+Tab wrap around inside `box`,
 * and the scrolling `<main>` is locked (the app scrolls in `<main>`, not the page; see
 * style.css). When it closes, focus returns to the element that had it before the dialog
 * opened and `<main>` scrolls again.
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
    else if (e.key === 'Tab' && !e.defaultPrevented) trapTab(e)
  }

  // Wrap Tab at the ends of the box and pull focus back in from outside it; the browser
  // moves focus between the elements in between. Ends are found by position, not identity,
  // because focus can sit on an element that is no longer a stop (a button disabled while
  // focused, such as Upload or Delete going busy).
  function trapTab(e: KeyboardEvent) {
    const root = box.value
    if (!root) return
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
