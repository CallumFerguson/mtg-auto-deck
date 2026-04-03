import { useRef } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

type UseModalBackdropDismissOptions = {
  onDismiss: () => void
}

export function useModalBackdropDismiss({
  onDismiss,
}: UseModalBackdropDismissOptions) {
  const pointerStartedOnBackdropRef = useRef(false)

  function handleBackdropPointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    pointerStartedOnBackdropRef.current = event.target === event.currentTarget
  }

  function handleBackdropPointerUp(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const pointerEndedOnBackdrop = event.target === event.currentTarget

    if (
      pointerStartedOnBackdropRef.current &&
      pointerEndedOnBackdrop
    ) {
      onDismiss()
    }

    pointerStartedOnBackdropRef.current = false
  }

  function handleBackdropPointerCancel() {
    pointerStartedOnBackdropRef.current = false
  }

  return {
    handleBackdropPointerCancel,
    handleBackdropPointerDown,
    handleBackdropPointerUp,
  }
}
