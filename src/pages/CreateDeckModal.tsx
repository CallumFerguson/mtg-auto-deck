import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Loader2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import {
  DECK_GUIDELINES_MAX_LENGTH,
  type DeckCardsInputValidationResult,
  validateAndParseDeckCardsInput,
  validateAndParseDeckInput,
  validateDeckDetailsInput,
  validateDeckGuidelinesInput,
} from "@/lib/deck-input"
import { cn } from "@/lib/utils"

type DeckDraft = {
  name: string
  description: string
  mulliganGuidelines: string
  strategyGuidelines: string
  commanderOne: string
  commanderTwo: string
  deckList: string
}

type ArchidektImportedDeck = {
  deckId: string
  name: string
  description: string
  commanders: string[]
  cards: {
    name: string
    quantity: number
  }[]
}

const CARD_ENTRY_STEP = 0
const DETAILS_STEP = 1
const GUIDELINES_STEP = 2
const CONFIRM_STEP = 3

const CREATE_DECK_STEPS = [
  {
    title: "Cards",
    description: "Commanders and library",
  },
  {
    title: "Details",
    description: "Name and description",
  },
  {
    title: "Guidelines",
    description: "Mulligan and strategy",
  },
  {
    title: "Confirm",
    description: "Review and create",
  },
]

const EMPTY_DECK_DRAFT: DeckDraft = {
  name: "",
  description: "",
  mulliganGuidelines: "",
  strategyGuidelines: "",
  commanderOne: "",
  commanderTwo: "",
  deckList: "",
}

const INPUT_CLASS_NAME =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
const TEXTAREA_CLASS_NAME =
  "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
const DECK_LIST_PLACEHOLDER = [
  "Supports most formats:",
  "1 Sol Ring",
  "1x Arcane Signet",
  "1 x Command Tower",
  "Counterspell x1",
  "Island",
  "1 Llanowar Elves (M12) 182",
].join("\n")

export function CreateDeckModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [draft, setDraft] = useState<DeckDraft>(EMPTY_DECK_DRAFT)
  const [currentStep, setCurrentStep] = useState(CARD_ENTRY_STEP)
  const [errors, setErrors] = useState<string[]>([])
  const [validatedCardSignature, setValidatedCardSignature] = useState<
    string | null
  >(null)
  const [deckNameWasEdited, setDeckNameWasEdited] = useState(false)
  const [isValidatingCards, setIsValidatingCards] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isArchidektImportOpen, setIsArchidektImportOpen] = useState(false)
  const cardSignature = useMemo(() => createCardSignature(draft), [draft])
  const cardValidationResult = useMemo(
    () =>
      validateAndParseDeckCardsInput({
        commanderOne: draft.commanderOne,
        commanderTwo: draft.commanderTwo,
        deckList: draft.deckList,
      }),
    [draft.commanderOne, draft.commanderTwo, draft.deckList]
  )
  const cardsAreVerified =
    cardValidationResult.ok && validatedCardSignature === cardSignature
  const isBusy = isValidatingCards || isCreating || isArchidektImportOpen

  function updateDraftField(field: keyof DeckDraft, value: string) {
    if (field === "name") {
      setDeckNameWasEdited(true)
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    setErrors([])
  }

  function handleArchidektDeckImported(importedDeck: ArchidektImportedDeck) {
    const importedName = importedDeck.name.trim()
    const importedDescription = importedDeck.description.trim()

    setDraft((currentDraft) => ({
      ...currentDraft,
      name: importedName || currentDraft.name,
      description: importedDescription || currentDraft.description,
      commanderOne: importedDeck.commanders[0] ?? "",
      commanderTwo: importedDeck.commanders[1] ?? "",
      deckList: formatImportedDeckList(importedDeck.cards),
    }))

    if (importedName) {
      setDeckNameWasEdited(true)
    }

    setValidatedCardSignature(null)
    setErrors([])
    setCurrentStep(CARD_ENTRY_STEP)
    setIsArchidektImportOpen(false)
  }

  function applyDefaultDeckName() {
    if (deckNameWasEdited) {
      return
    }

    const defaultDeckName = getCommanderDefaultDeckName(cardValidationResult)

    if (!defaultDeckName) {
      return
    }

    setDraft((currentDraft) => {
      if (currentDraft.name === defaultDeckName) {
        return currentDraft
      }

      return {
        ...currentDraft,
        name: defaultDeckName,
      }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (currentStep === CONFIRM_STEP) {
      await handleCreateDeck()
      return
    }

    await handleNextStep()
  }

  async function handleNextStep() {
    if (currentStep === CARD_ENTRY_STEP) {
      await validateCardsAndAdvance()
      return
    }

    if (currentStep === DETAILS_STEP) {
      const result = validateDeckDetailsInput({
        name: draft.name,
        description: draft.description,
      })

      if (!result.ok) {
        setErrors(result.errors)
        return
      }

      setErrors([])
      setCurrentStep(GUIDELINES_STEP)
      return
    }

    if (currentStep === GUIDELINES_STEP) {
      const result = validateDeckGuidelinesInput({
        mulliganGuidelines: draft.mulliganGuidelines,
        strategyGuidelines: draft.strategyGuidelines,
      })

      if (!result.ok) {
        setErrors(result.errors)
        return
      }

      setErrors([])
      setCurrentStep(CONFIRM_STEP)
    }
  }

  async function validateCardsAndAdvance() {
    if (!cardValidationResult.ok) {
      setErrors(cardValidationResult.errors)
      return
    }

    if (cardsAreVerified) {
      setErrors([])
      applyDefaultDeckName()
      setCurrentStep(DETAILS_STEP)
      return
    }

    setErrors([])
    setIsValidatingCards(true)

    try {
      const response = await apiFetch(`${API_BASE_URL}/decks/validate-cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cardValidationResult.deckCards),
      })

      if (!response.ok) {
        setErrors([
          await readApiError(response, "Deck cards could not be validated."),
        ])
        return
      }

      setValidatedCardSignature(cardSignature)
      applyDefaultDeckName()
      setCurrentStep(DETAILS_STEP)
    } catch {
      setErrors(["Deck cards could not be validated with the server."])
    } finally {
      setIsValidatingCards(false)
    }
  }

  async function handleCreateDeck() {
    if (!cardsAreVerified) {
      setCurrentStep(CARD_ENTRY_STEP)
      setErrors(["Cards must be verified before creating the deck."])
      return
    }

    const result = validateAndParseDeckInput(draft)

    if (!result.ok) {
      setErrors(result.errors)
      return
    }

    setErrors([])
    setIsCreating(true)

    try {
      const response = await apiFetch(`${API_BASE_URL}/decks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result.deck),
      })

      if (!response.ok) {
        const error = await readApiError(response, "Deck could not be created.")

        if (isCardValidationError(error)) {
          setCurrentStep(CARD_ENTRY_STEP)
          setValidatedCardSignature(null)
        }

        setErrors([error])
        return
      }

      onCreated()
    } catch {
      setErrors(["Deck could not be sent to the server."])
    } finally {
      setIsCreating(false)
    }
  }

  function handleBack() {
    setErrors([])
    setCurrentStep((step) => Math.max(CARD_ENTRY_STEP, step - 1))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isBusy ? undefined : onClose}
    >
      <section
        aria-labelledby="create-deck-title"
        className="flex h-[46rem] max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="create-deck-title" className="text-xl font-semibold">
              New deck
            </h2>
            <p className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {CREATE_DECK_STEPS.length}:{" "}
              {CREATE_DECK_STEPS[currentStep].description}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isBusy}
          >
            <X />
          </Button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5"
          onSubmit={handleSubmit}
        >
          <StepProgress currentStep={currentStep} />

          <div className="min-h-0 flex-1 overflow-hidden">
            {currentStep === CARD_ENTRY_STEP ? (
              <CardEntryStep
                cardsAreVerified={cardsAreVerified}
                disabled={isBusy}
                draft={draft}
                onFieldChange={updateDraftField}
                onOpenArchidektImport={() => setIsArchidektImportOpen(true)}
                validationResult={cardValidationResult}
                validatedCardSignature={validatedCardSignature}
              />
            ) : null}

            {currentStep === DETAILS_STEP ? (
              <DetailsStep
                disabled={isBusy}
                draft={draft}
                onFieldChange={updateDraftField}
              />
            ) : null}

            {currentStep === GUIDELINES_STEP ? (
              <GuidelinesStep
                disabled={isBusy}
                draft={draft}
                onFieldChange={updateDraftField}
              />
            ) : null}

            {currentStep === CONFIRM_STEP ? (
              <ConfirmStep
                cardsAreVerified={cardsAreVerified}
                draft={draft}
                validationResult={cardValidationResult}
              />
            ) : null}
          </div>

          {errors.length > 0 ? (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <p className="font-medium">
                {currentStep === CONFIRM_STEP
                  ? "Deck could not be created."
                  : "Before continuing, fix this."}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {currentStep > CARD_ENTRY_STEP ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isBusy}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isBusy}>
                <PrimaryActionContent
                  currentStep={currentStep}
                  isCreating={isCreating}
                  isValidatingCards={isValidatingCards}
                />
              </Button>
            </div>
          </div>
        </form>
      </section>

      {isArchidektImportOpen ? (
        <ArchidektImportModal
          onClose={() => setIsArchidektImportOpen(false)}
          onImported={handleArchidektDeckImported}
        />
      ) : null}
    </div>
  )
}

function ArchidektImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (deck: ArchidektImportedDeck) => void
}) {
  const [archidektInput, setArchidektInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const input = archidektInput.trim()

    if (!input) {
      setError("Paste an Archidekt deck ID or link.")
      return
    }

    setError(null)
    setIsImporting(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/import/archidekt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input }),
        }
      )

      if (!response.ok) {
        setError(
          await readApiError(response, "Archidekt deck could not be imported.")
        )
        return
      }

      const data = (await response.json()) as {
        deck?: ArchidektImportedDeck
      }

      if (!data.deck) {
        setError("Archidekt import response was not in the expected format.")
        return
      }

      onImported(data.deck)
    } catch {
      setError("Archidekt import could not be sent to the server.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation()

        if (!isImporting) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="archidekt-import-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="archidekt-import-title" className="text-xl font-semibold">
              Import from Archidekt
            </h2>
            <p className="text-sm text-muted-foreground">
              Paste a deck ID or deck link.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isImporting}
          >
            <X />
          </Button>
        </header>

        <form className="grid gap-4 px-5 py-5" onSubmit={handleSubmit}>
          <Field label="Archidekt deck" htmlFor="archidekt-deck-input">
            <input
              id="archidekt-deck-input"
              name="archidektDeck"
              className={INPUT_CLASS_NAME}
              type="text"
              value={archidektInput}
              onChange={(event) => {
                setArchidektInput(event.target.value)
                setError(null)
              }}
              disabled={isImporting}
              autoFocus
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
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isImporting}>
              {isImporting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function CardEntryStep({
  cardsAreVerified,
  disabled,
  draft,
  onFieldChange,
  onOpenArchidektImport,
  validatedCardSignature,
  validationResult,
}: {
  cardsAreVerified: boolean
  disabled: boolean
  draft: DeckDraft
  onFieldChange: (field: keyof DeckDraft, value: string) => void
  onOpenArchidektImport: () => void
  validatedCardSignature: string | null
  validationResult: DeckCardsInputValidationResult
}) {
  const parsedLibraryCount = validationResult.ok
    ? countCards(validationResult.deckCards.cards)
    : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={onOpenArchidektImport}
          disabled={disabled}
        >
          <Download data-icon="inline-start" />
          Import from Archidekt
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Commander 1" htmlFor="main-commander">
          <input
            id="main-commander"
            name="commanderOne"
            className={INPUT_CLASS_NAME}
            type="text"
            value={draft.commanderOne}
            onChange={(event) =>
              onFieldChange("commanderOne", event.target.value)
            }
            disabled={disabled}
          />
        </Field>

        <Field label="Commander 2" htmlFor="secondary-commander">
          <input
            id="secondary-commander"
            name="commanderTwo"
            className={INPUT_CLASS_NAME}
            placeholder="Optional partner / background / etc."
            type="text"
            value={draft.commanderTwo}
            onChange={(event) =>
              onFieldChange("commanderTwo", event.target.value)
            }
            disabled={disabled}
          />
        </Field>
      </div>

      <Field
        className="min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]"
        label="Deck list"
        htmlFor="deck-list"
      >
        <textarea
          id="deck-list"
          name="deckList"
          className={cn(
            TEXTAREA_CLASS_NAME,
            "h-full min-h-0 resize-none py-3 font-mono"
          )}
          placeholder={DECK_LIST_PLACEHOLDER}
          value={draft.deckList}
          onChange={(event) => onFieldChange("deckList", event.target.value)}
          disabled={disabled}
        />
      </Field>

      {cardsAreVerified ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          <CheckCircle2 className="size-4" />
          Cards verified with Scryfall. Parsed {parsedLibraryCount} library
          cards.
        </p>
      ) : validatedCardSignature ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Cards changed since the last verification.
        </p>
      ) : null}
    </div>
  )
}

function DetailsStep({
  disabled,
  draft,
  onFieldChange,
}: {
  disabled: boolean
  draft: DeckDraft
  onFieldChange: (field: keyof DeckDraft, value: string) => void
}) {
  return (
    <div className="grid gap-4">
      <Field label="Deck name" htmlFor="deck-name">
        <input
          id="deck-name"
          name="name"
          className={INPUT_CLASS_NAME}
          type="text"
          value={draft.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          disabled={disabled}
        />
      </Field>

      <Field label="Description" htmlFor="deck-description">
        <textarea
          id="deck-description"
          name="description"
          className={cn(TEXTAREA_CLASS_NAME, "min-h-40")}
          placeholder="Optional description"
          value={draft.description}
          onChange={(event) => onFieldChange("description", event.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>
  )
}

function GuidelinesStep({
  disabled,
  draft,
  onFieldChange,
}: {
  disabled: boolean
  draft: DeckDraft
  onFieldChange: (field: keyof DeckDraft, value: string) => void
}) {
  return (
    <div className="grid gap-4">
      <Field label="Mulligan guidelines" htmlFor="deck-mulligan-guidelines">
        <textarea
          id="deck-mulligan-guidelines"
          name="mulliganGuidelines"
          className={cn(TEXTAREA_CLASS_NAME, "min-h-36")}
          maxLength={DECK_GUIDELINES_MAX_LENGTH}
          placeholder="(optional) A good starting hand usually has around 3 lands and some ramp so you can play the commander on turn 4."
          value={draft.mulliganGuidelines}
          onChange={(event) =>
            onFieldChange("mulliganGuidelines", event.target.value)
          }
          disabled={disabled}
        />
      </Field>

      <Field label="Strategy guidelines" htmlFor="deck-strategy-guidelines">
        <textarea
          id="deck-strategy-guidelines"
          name="strategyGuidelines"
          className={cn(TEXTAREA_CLASS_NAME, "min-h-36")}
          maxLength={DECK_GUIDELINES_MAX_LENGTH}
          placeholder="(optional) Use the commander as a Voltron threat and win through commander damage."
          value={draft.strategyGuidelines}
          onChange={(event) =>
            onFieldChange("strategyGuidelines", event.target.value)
          }
          disabled={disabled}
        />
      </Field>
    </div>
  )
}

function ConfirmStep({
  cardsAreVerified,
  draft,
  validationResult,
}: {
  cardsAreVerified: boolean
  draft: DeckDraft
  validationResult: DeckCardsInputValidationResult
}) {
  const commanders = validationResult.ok
    ? validationResult.deckCards.commanders
    : [draft.commanderOne.trim(), draft.commanderTwo.trim()].filter(Boolean)
  const libraryCount = validationResult.ok
    ? countCards(validationResult.deckCards.cards)
    : null
  const rows = [
    {
      label: "Commanders",
      value: commanders.length > 0 ? commanders.join(" / ") : "Missing",
      isPlaceholder: commanders.length === 0,
    },
    {
      label: "Library",
      value: libraryCount === null ? "Needs review" : `${libraryCount} cards`,
      isPlaceholder: libraryCount === null,
    },
    {
      label: "Deck name",
      ...summarizeText(draft.name, "Missing"),
    },
    {
      label: "Description",
      ...summarizeText(draft.description, "No description"),
    },
    {
      label: "Mulligan",
      ...summarizeText(draft.mulliganGuidelines, "No mulligan guidelines"),
    },
    {
      label: "Strategy",
      ...summarizeText(draft.strategyGuidelines, "No strategy guidelines"),
    },
  ]

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
        <CheckCircle2 className="size-4" />
        {cardsAreVerified
          ? "Cards verified with Scryfall."
          : "Cards need verification before creation."}
      </div>

      <dl className="divide-y divide-border border-y border-border">
        {rows.map((row) => (
          <div
            className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
            key={row.label}
          >
            <dt className="text-sm font-medium text-muted-foreground">
              {row.label}
            </dt>
            <dd
              className={cn(
                "text-sm break-words",
                row.isPlaceholder
                  ? "text-muted-foreground italic"
                  : "text-foreground"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <ol
      aria-label="Create deck progress"
      className="grid grid-cols-4 px-1 pt-1"
    >
      {CREATE_DECK_STEPS.map((step, index) => {
        const isCurrent = currentStep === index
        const isComplete = currentStep > index
        const isConnectorComplete = currentStep > index

        return (
          <li
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex min-w-0 flex-col items-center gap-2 text-center"
            key={step.title}
          >
            {index < CREATE_DECK_STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-4 left-[calc(50%+1.25rem)] h-px w-[calc(100%-2.5rem)] transition-colors",
                  isConnectorComplete ? "bg-primary/70" : "bg-border"
                )}
              />
            ) : null}

            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : isComplete
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-muted-foreground"
              )}
            >
              {isComplete ? <Check className="size-4 stroke-[3]" /> : index + 1}
            </span>

            <span
              className={cn(
                "block w-full truncate px-1 text-xs font-medium transition-colors sm:text-sm",
                isCurrent || isComplete
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.title}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function PrimaryActionContent({
  currentStep,
  isCreating,
  isValidatingCards,
}: {
  currentStep: number
  isCreating: boolean
  isValidatingCards: boolean
}) {
  if (isValidatingCards) {
    return (
      <>
        <Loader2 className="animate-spin" data-icon="inline-start" />
        Validating...
      </>
    )
  }

  if (currentStep === CONFIRM_STEP) {
    return (
      <>
        {isCreating ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <CheckCircle2 data-icon="inline-start" />
        )}
        {isCreating ? "Creating..." : "Create deck"}
      </>
    )
  }

  return (
    <>
      Next
      <ArrowRight data-icon="inline-end" />
    </>
  )
}

function Field({
  children,
  className,
  htmlFor,
  label,
}: {
  children: ReactNode
  className?: string
  htmlFor: string
  label: string
}) {
  return (
    <label
      className={cn("grid gap-2 text-sm font-medium", className)}
      htmlFor={htmlFor}
    >
      <span>{label}</span>
      {children}
    </label>
  )
}

function createCardSignature({
  commanderOne,
  commanderTwo,
  deckList,
}: DeckDraft) {
  return JSON.stringify({
    commanderOne,
    commanderTwo,
    deckList,
  })
}

function countCards(cards: readonly { quantity: number }[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

function getCommanderDefaultDeckName(
  validationResult: DeckCardsInputValidationResult
) {
  if (!validationResult.ok) {
    return ""
  }

  return validationResult.deckCards.commanders.join(" / ")
}

function formatImportedDeckList(
  cards: readonly ArchidektImportedDeck["cards"][number][]
) {
  return cards.map((card) => `${card.quantity} ${card.name}`).join("\n")
}

function summarizeText(value: string, emptyLabel: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return {
      value: emptyLabel,
      isPlaceholder: true,
    }
  }

  if (trimmedValue.length <= 160) {
    return {
      value: trimmedValue,
      isPlaceholder: false,
    }
  }

  return {
    value: `${trimmedValue.slice(0, 157)}...`,
    isPlaceholder: false,
  }
}

function isCardValidationError(error: string) {
  return (
    error.includes("Commander") ||
    error.includes("Deck list") ||
    error.includes("exact matches")
  )
}
