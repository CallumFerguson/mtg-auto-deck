export type UsageLimitWindow = {
  kind: "five_hour" | "weekly"
  label: string
  remainingPercent: number
  resetAt: string
}

export type UsageLimitsResponse = {
  usageLimits: UsageLimitWindow[]
}
