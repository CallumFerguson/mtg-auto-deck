export type BillingTier = "free" | "plus" | "pro"

export type BillingSubscription = {
  id: string
  plan: string
  status: string
  cancelAtPeriodEnd?: boolean
  stripeSubscriptionId?: string
}

export const BILLING_TIER_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
} satisfies Record<BillingTier, string>

const ACTIVE_BILLING_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])

export function isPaidBillingTier(tier: BillingTier): tier is "plus" | "pro" {
  return tier === "plus" || tier === "pro"
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
