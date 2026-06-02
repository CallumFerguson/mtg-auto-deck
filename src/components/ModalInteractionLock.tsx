import { useEffect } from "react"

const MODAL_SELECTOR = '[aria-modal="true"]'
const SCROLL_LOCK_CLASS = "modal-interaction-locked"

export function ModalInteractionLock() {
  useEffect(() => {
    let isLocked = false

    function getOpenModals() {
      return Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
    }

    function setLocked(nextIsLocked: boolean) {
      if (isLocked === nextIsLocked) {
        return
      }

      isLocked = nextIsLocked
      document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, isLocked)
      document.body.classList.toggle(SCROLL_LOCK_CLASS, isLocked)
    }

    function syncLockState() {
      setLocked(getOpenModals().length > 0)
    }

    function isInsideModal(target: EventTarget | null) {
      if (!(target instanceof Node)) {
        return false
      }

      return getOpenModals().some((modal) => modal.contains(target))
    }

    function blockBackgroundScroll(event: WheelEvent | TouchEvent) {
      if (!isLocked || isInsideModal(event.target)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    document.addEventListener("wheel", blockBackgroundScroll, {
      capture: true,
      passive: false,
    })
    document.addEventListener("touchmove", blockBackgroundScroll, {
      capture: true,
      passive: false,
    })

    const observer = new MutationObserver(syncLockState)
    observer.observe(document.body, {
      attributeFilter: ["aria-modal"],
      attributes: true,
      childList: true,
      subtree: true,
    })

    syncLockState()

    return () => {
      observer.disconnect()
      document.removeEventListener("wheel", blockBackgroundScroll, {
        capture: true,
      })
      document.removeEventListener("touchmove", blockBackgroundScroll, {
        capture: true,
      })
      setLocked(false)
    }
  }, [])

  return null
}
