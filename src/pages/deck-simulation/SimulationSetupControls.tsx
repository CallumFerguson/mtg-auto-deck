import type { ReactNode } from "react"

export function FlexServiceTierSwitch({
  checked,
  disabled = false,
  label = "Use flex service tier",
  activeWarning,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  label?: string
  activeWarning?: string
  onCheckedChange: (checked: boolean) => void
}) {
  const visibleWarning = checked ? activeWarning : null

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
        checked
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-background/35 text-muted-foreground"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <button
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:ring-3 focus:ring-ring/25 focus:outline-none disabled:cursor-not-allowed ${
          checked
            ? "border-sky-300/70 bg-sky-500/70"
            : "border-border bg-muted/55"
        }`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={`absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm shadow-black/30 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="grid gap-1">
        <span className="font-medium">{label}</span>
        {visibleWarning ? (
          <span className="text-xs leading-5 text-amber-100/90" role="alert">
            {visibleWarning}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export function SimulationSetupChoiceCard({
  action,
  checked,
  inputId,
  label,
  name,
  summary,
  summaryTitle,
  onChange,
}: {
  action?: ReactNode
  checked: boolean
  inputId: string
  label: string
  name: string
  summary?: ReactNode
  summaryTitle?: string
  onChange: () => void
}) {
  return (
    <div
      className={`grid min-h-16 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
        checked
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-background/35 text-muted-foreground"
      } ${action ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}
      onClick={() => {
        if (!checked) {
          onChange()
        }
      }}
    >
      <label
        className="flex min-w-0 cursor-pointer items-center gap-2"
        htmlFor={inputId}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          id={inputId}
          className="size-4 shrink-0 accent-sky-300"
          type="radio"
          name={name}
          checked={checked}
          onChange={(event) => {
            if (event.currentTarget.checked) {
              onChange()
            }
          }}
        />
        <span className="grid min-w-0 gap-1">
          <span
            className={`font-medium ${
              checked ? "text-accent-foreground" : "text-foreground"
            }`}
          >
            {label}
          </span>
          {summary ? (
            <span
              className={`truncate text-xs leading-5 ${
                checked ? "text-accent-foreground/80" : "text-muted-foreground"
              }`}
              title={summaryTitle}
            >
              {summary}
            </span>
          ) : null}
        </span>
      </label>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
