import { LogOut, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SignOutConfirmModal({
  isSigningOut,
  onClose,
  onConfirm,
}: {
  isSigningOut: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSigningOut ? undefined : onClose}
    >
      <section
        aria-labelledby="sign-out-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
              <LogOut className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="sign-out-title" className="text-xl font-semibold">
                Sign out?
              </h2>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSigningOut}
          >
            <X />
          </Button>
        </header>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSigningOut}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isSigningOut}
          >
            <LogOut data-icon="inline-start" />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </section>
    </div>
  )
}
