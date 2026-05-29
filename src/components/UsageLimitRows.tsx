import type { UsageLimitWindow } from "@/lib/usage-limit-types"
import { useUsageLimits } from "@/lib/usage-limits"
import { cn } from "@/lib/utils"

export function UsageLimitRows({
  className,
  rowClassName,
  variant = "compact",
}: {
  className?: string
  rowClassName?: string
  variant?: "compact" | "settings"
}) {
  const { isUsageLimitsLoading, usageLimits, usageLimitsError } =
    useUsageLimits()

  if (usageLimitsError) {
    return (
      <p className="mt-2 text-xs text-destructive" role="alert">
        Usage unavailable
      </p>
    )
  }

  if (isUsageLimitsLoading && usageLimits.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">Loading usage...</p>
    )
  }

  if (usageLimits.length === 0) {
    return null
  }

  if (variant === "settings") {
    return (
      <div
        className={cn(
          "mt-3 grid w-full max-w-3xl divide-y divide-border/70",
          className
        )}
      >
        {usageLimits.map((usageLimit) => {
          const remainingPercent = getClampedRemainingPercent(usageLimit)
          const usageLimitLabel = getSettingsUsageLimitLabel(usageLimit)

          return (
            <div
              key={usageLimit.kind}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4 text-sm first:pt-3 last:pb-1 sm:grid-cols-[minmax(12rem,1fr)_minmax(8rem,12rem)_5.5rem] sm:gap-x-5",
                rowClassName
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {usageLimitLabel}
                </p>
                <p className="mt-1 text-xs text-sky-100/85">
                  Resets {formatSettingsUsageLimitReset(usageLimit)}
                </p>
              </div>
              <div
                className="col-span-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/75 sm:col-span-1"
                role="progressbar"
                aria-label={`${usageLimitLabel} remaining`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={remainingPercent}
              >
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
              <span className="text-right text-xs text-sky-100/85 tabular-nums">
                {usageLimit.remainingPercent}% left
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("mt-2 grid gap-1.5", className)}>
      {usageLimits.map((usageLimit) => (
        <div
          key={usageLimit.kind}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-xs text-muted-foreground",
            rowClassName
          )}
        >
          <span className="truncate pl-4 font-bold text-foreground">
            {usageLimit.label}
          </span>
          <span className="flex min-w-0 items-baseline justify-end gap-2 text-right tabular-nums">
            <span>{usageLimit.remainingPercent}%</span>
            <span>{formatUsageLimitReset(usageLimit)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function formatUsageLimitReset(usageLimit: UsageLimitWindow) {
  return usageLimit.kind === "weekly"
    ? formatWeeklyResetDate(usageLimit.resetAt)
    : formatFiveHourResetTime(usageLimit.resetAt)
}

function formatSettingsUsageLimitReset(usageLimit: UsageLimitWindow) {
  return usageLimit.kind === "weekly"
    ? formatWeeklyResetDateTime(usageLimit.resetAt)
    : formatFiveHourResetTime(usageLimit.resetAt)
}

function getSettingsUsageLimitLabel(usageLimit: UsageLimitWindow) {
  return usageLimit.kind === "five_hour"
    ? "5 hour usage limit"
    : "Weekly usage limit"
}

function formatFiveHourResetTime(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return "unknown"
  }

  return formatResetTime(resetDate)
}

function formatResetTime(resetDate: Date) {
  return resetDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatWeeklyResetDateTime(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return "unknown"
  }

  const currentYear = new Date().getFullYear()

  const resetDay = resetDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: resetDate.getFullYear() === currentYear ? undefined : "numeric",
  })

  return `${resetDay} at ${formatResetTime(resetDate)}`
}

function formatWeeklyResetDate(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return "unknown"
  }

  const currentYear = new Date().getFullYear()

  return resetDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: resetDate.getFullYear() === currentYear ? undefined : "numeric",
  })
}

function getClampedRemainingPercent(usageLimit: UsageLimitWindow) {
  if (!Number.isFinite(usageLimit.remainingPercent)) {
    return 0
  }

  return Math.min(Math.max(usageLimit.remainingPercent, 0), 100)
}
