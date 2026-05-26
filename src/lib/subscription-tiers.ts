export type BillingTier = "free" | "plus" | "pro" | "super_max"
export type StripeBillingTier = "plus" | "pro"
export type AdminGrantBillingTier = Exclude<BillingTier, "free">

export type BillingSubscription = {
  id: string
  plan: string
  status: string
  cancelAtPeriodEnd?: boolean
  stripeSubscriptionId?: string
}

export type ActiveAdminSubscriptionTierGrant = {
  expiresAt: string
  grantedAt: string
  grantedByAdminUserId: string | null
  id: string
  tier: AdminGrantBillingTier
}

export type BillingTierSummary = {
  adminGrant: ActiveAdminSubscriptionTierGrant | null
  effectiveTier: BillingTier
  stripeTier: BillingTier
}

export const BILLING_TIER_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  super_max: "Super Max",
} satisfies Record<BillingTier, string>

const ACTIVE_BILLING_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])
const BILLING_TIER_RANKS = {
  free: 0,
  plus: 1,
  pro: 2,
  super_max: 3,
} satisfies Record<BillingTier, number>

export function isPaidBillingTier(
  tier: BillingTier
): tier is StripeBillingTier {
  return tier === "plus" || tier === "pro"
}

export function getHighestBillingTier(
  tiers: readonly (BillingTier | null | undefined)[]
) {
  return tiers.reduce<BillingTier>(
    (highestTier, tier) =>
      tier && BILLING_TIER_RANKS[tier] > BILLING_TIER_RANKS[highestTier]
        ? tier
        : highestTier,
    "free"
  )
}

export function getActiveBillingSubscription(
  subscriptions: readonly BillingSubscription[]
) {
  return (
    subscriptions.find((subscription) =>
      ACTIVE_BILLING_SUBSCRIPTION_STATUSES.has(subscription.status)
    ) ?? null
  )
}

export function getBillingTierFromSubscription(
  subscription: BillingSubscription | null
): BillingTier {
  const plan = subscription?.plan.trim().toLowerCase()

  if (plan === "plus" || plan === "pro") {
    return plan
  }

  return "free"
}
