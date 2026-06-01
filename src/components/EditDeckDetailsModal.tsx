import { useState, type FormEvent, type ReactNode } from "react"
import { Save, Star, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import { DECK_GUIDELINES_MAX_LENGTH } from "@/lib/deck-input"
import type { Deck } from "@/lib/deck-types"

export function EditDeckDetailsModal({
  deck,
  onClose,
  onUpdated,
  showAdminOptions = false,
}: {
  deck: Deck
  onClose: () => void
  onUpdated: (deck: Deck) => void
  showAdminOptions?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const mulliganGuidelines = String(
      formData.get("mulliganGuidelines") ?? ""
    ).trim()
    const strategyGuidelines = String(
      formData.get("strategyGuidelines") ?? ""
    ).trim()
    const isStarter = formData.get("isStarter") === "on"

    if (!name) {
      setError("Deck name is required.")
      return
    }

    if (mulliganGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
      setError("Mulligan guidelines must be 1000 characters or fewer.")
      return
    }

    if (strategyGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
      setError("Strategy guidelines must be 1000 characters or fewer.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const payload: {
        description: string
        isStarter?: boolean
        mulliganGuidelines: string
        name: string
        strategyGuidelines: string
      } = {
        name,
        description,
        mulliganGuidelines,
        strategyGuidelines,
      }

      if (showAdminOptions) {
        payload.isStarter = isStarter
      }

      const response = await apiFetch(`${API_BASE_URL}/decks/${deck.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        setError(
          await readApiError(response, "Deck details could not be updated.")
        )
        return
      }

      const data = (await response.json()) as { deck: Deck }
      onUpdated(data.deck)
    } catch {
      setError("Deck details could not be sent to the server.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSaving ? undefined : onClose}
    >
      <section
        aria-labelledby="edit-deck-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="edit-deck-title" className="text-xl font-semibold">
              Edit deck
            </h2>
            <p className="text-sm text-muted-foreground">
              Update the deck details and play guidance.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSaving}
          >
            <X />
          </Button>
        </header>

        <form className="grid gap-4 px-5 py-5" onSubmit={handleSubmit}>
          <Field label="Deck name" htmlFor="edit-deck-name">
            <input
              id="edit-deck-name"
              name="name"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
              type="text"
              defaultValue={deck.name}
              disabled={isSaving}
            />
          </Field>

          <Field label="Description" htmlFor="edit-deck-description">
            <textarea
              id="edit-deck-description"
              name="description"
              className="min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
              placeholder="Optional description"
              defaultValue={deck.description ?? ""}
              disabled={isSaving}
            />
          </Field>

          {showAdminOptions ? (
            <label
              className="flex items-start gap-3 rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-3 text-sm transition focus-within:border-sky-300/60 focus-within:ring-3 focus-within:ring-sky-300/20"
              htmlFor="edit-deck-is-starter"
            >
              <input
                id="edit-deck-is-starter"
                name="isStarter"
                className="mt-0.5 size-4 shrink-0 accent-sky-300 disabled:opacity-50"
                type="checkbox"
                defaultChecked={deck.isStarter}
                disabled={isSaving}
              />
              <span className="grid min-w-0 gap-1">
                <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                  <Star className="size-4 shrink-0 text-sky-300" aria-hidden />
                  <span className="truncate">Starter deck</span>
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  New users receive a copy of this deck.
                </span>
              </span>
            </label>
          ) : null}

          <Field
            label="Mulligan guidelines"
            htmlFor="edit-deck-mulligan-guidelines"
          >
            <textarea
              id="edit-deck-mulligan-guidelines"
              name="mulliganGuidelines"
              className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
              placeholder="(optional) A good starting hand usually has around 3 lands and some ramp so you can play the commander on turn 4."
              defaultValue={deck.mulliganGuidelines ?? ""}
              maxLength={DECK_GUIDELINES_MAX_LENGTH}
              disabled={isSaving}
            />
          </Field>

          <Field
            label="Strategy guidelines"
            htmlFor="edit-deck-strategy-guidelines"
          >
            <textarea
              id="edit-deck-strategy-guidelines"
              name="strategyGuidelines"
              className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
              placeholder="(optional) Use the commander as a Voltron threat and win through commander damage."
              defaultValue={deck.strategyGuidelines ?? ""}
              maxLength={DECK_GUIDELINES_MAX_LENGTH}
              disabled={isSaving}
            />
          </Field>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode
  htmlFor: string
  label: string
}) {
  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
    </label>
  )
}
