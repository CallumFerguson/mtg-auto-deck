export const BILLING_TIER_LIMITS = {
  free: {
    maxConcurrentLlmRuns: 1,
    maxTurnSimulationsPerDay: 3,
  },
  plus: {
    maxConcurrentLlmRuns: 1,
    maxTurnSimulationsPerDay: 25,
  },
  pro: {
    maxConcurrentLlmRuns: 5,
    maxTurnSimulationsPerDay: 100,
  },
} as const

export type BillingTier = keyof typeof BILLING_TIER_LIMITS

export const BILLING_TIER_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
} satisfies Record<BillingTier, string>

export function isPaidBillingTier(tier: BillingTier): tier is "plus" | "pro" {
  return tier === "plus" || tier === "pro"
}
