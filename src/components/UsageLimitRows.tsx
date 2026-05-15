import type { UsageLimitWindow } from "@/lib/usage-limit-types"
import { useUsageLimits } from "@/lib/usage-limits"
import { cn } from "@/lib/utils"

export function UsageLimitRows({
  className,
  rowClassName,
}: {
  className?: string
  rowClassName?: string
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

  return (
    <div className={cn("mt-2 grid gap-1", className)}>
      {usageLimits.map((usageLimit) => (
        <p
          key={usageLimit.kind}
          className={cn("truncate text-xs text-muted-foreground", rowClassName)}
        >
          {formatUsageLimitLabel(usageLimit)}
        </p>
      ))}
    </div>
  )
}

function formatUsageLimitLabel(usageLimit: UsageLimitWindow) {
  const resetLabel =
    usageLimit.kind === "weekly"
      ? formatWeeklyResetDate(usageLimit.resetAt)
      : formatFiveHourResetTime(usageLimit.resetAt)
  const resetText =
    usageLimit.kind === "weekly"
      ? `resets ${resetLabel}`
      : `resets at ${resetLabel}`

  return `${usageLimit.label} - ${usageLimit.remainingPercent}% remaining, ${resetText}`
}

function formatFiveHourResetTime(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return "unknown"
  }

  return resetDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
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
