import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useModalBackdropDismiss } from "@/lib/use-modal-backdrop-dismiss"

type ResetDeckModalProps = {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ResetDeckModal({
  isOpen,
  onCancel,
  onConfirm,
}: ResetDeckModalProps) {
  const {
    handleBackdropPointerCancel,
    handleBackdropPointerDown,
    handleBackdropPointerUp,
  } = useModalBackdropDismiss({ onDismiss: onCancel })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onPointerCancel={handleBackdropPointerCancel}
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(28,25,23,0.98)_0%,rgba(17,24,39,0.96)_100%)] shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-deck-modal-title"
        aria-describedby="reset-deck-modal-description"
      >
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_55%)] p-6">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
            <AlertTriangle className="size-5" />
          </div>
          <h3
            id="reset-deck-modal-title"
            className="text-xl font-semibold tracking-tight text-stone-50"
          >
            Reset to the sample deck?
          </h3>
          <p
            id="reset-deck-modal-description"
            className="mt-2 text-sm leading-6 text-stone-300"
          >
            Your saved commanders and decklist will be replaced with the default
            sample deck.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-stone-200 hover:bg-white/10 hover:text-stone-50"
            onClick={onCancel}
          >
            Keep my deck
          </Button>
          <Button
            type="button"
            className="h-11 rounded-full bg-amber-200 px-5 text-stone-950 hover:bg-amber-100"
            onClick={onConfirm}
          >
            <RotateCcw />
            Reset deck
          </Button>
        </div>
      </div>
    </div>
  )
}
