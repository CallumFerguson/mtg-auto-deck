import type { StripePlan } from "@better-auth/stripe"

export const BILLING_TIER_LIMITS = {
  free: {
    maxConcurrentLlmRuns: 1,
  },
  plus: {
    maxConcurrentLlmRuns: 2,
  },
  pro: {
    maxConcurrentLlmRuns: 5,
  },
  super_max: {
    maxConcurrentLlmRuns: 5,
  },
} as const

export type BillingTier = keyof typeof BILLING_TIER_LIMITS
export type AdminGrantBillingTier = Exclude<BillingTier, "free">
export type BillingUsageLimitWindowKind = "five_hour" | "weekly"

export const BILLING_TIER_USAGE_LIMITS_USD = {
  free: {
    five_hour: 0.25,
    weekly: 0.5,
  },
  plus: {
    five_hour: 1.25,
    weekly: 2.5,
  },
  pro: {
    five_hour: 2.5,
    weekly: 5,
  },
  super_max: {
    five_hour: 100,
    weekly: 100,
  },
} as const satisfies Record<
  BillingTier,
  Record<BillingUsageLimitWindowKind, number>
>

const BILLING_TIER_RANKS = {
  free: 0,
  plus: 1,
  pro: 2,
  super_max: 3,
} as const satisfies Record<BillingTier, number>

export function getStripeSubscriptionPlans(): StripePlan[] {
  return [
    {
      name: "plus",
      priceId: getRequiredBillingEnvironmentVariable("STRIPE_PLUS_PRICE_ID"),
      limits: BILLING_TIER_LIMITS.plus,
    },
    {
      name: "pro",
      priceId: getRequiredBillingEnvironmentVariable("STRIPE_PRO_PRICE_ID"),
      limits: BILLING_TIER_LIMITS.pro,
    },
  ]
}

export function getBillingTierRank(tier: BillingTier) {
  return BILLING_TIER_RANKS[tier]
}

export function getHighestBillingTier(
  tiers: readonly (BillingTier | null | undefined)[]
): BillingTier {
  return tiers.reduce<BillingTier>(
    (highestTier, tier) =>
      tier && getBillingTierRank(tier) > getBillingTierRank(highestTier)
        ? tier
        : highestTier,
    "free"
  )
}

export function normalizeBillingTier(value: string | null | undefined) {
  const tier = value?.trim().toLowerCase()

  return isBillingTier(tier) ? tier : null
}

function isBillingTier(value: unknown): value is BillingTier {
  return (
    value === "free" ||
    value === "plus" ||
    value === "pro" ||
    value === "super_max"
  )
}

export function isAdminGrantBillingTier(
  value: unknown
): value is AdminGrantBillingTier {
  return value === "plus" || value === "pro" || value === "super_max"
}

function getRequiredBillingEnvironmentVariable(environmentVariable: string) {
  const value = process.env[environmentVariable]?.trim()

  if (!value) {
    throw new Error(
      `Missing billing environment variable: ${environmentVariable}. Add it to mtg-auto-deck-server/.env.`
    )
  }

  return value
}
