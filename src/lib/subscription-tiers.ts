export type BillingTier = "free" | "plus" | "pro" | "super_max"
export type StripeBillingTier = "plus" | "pro"
export type AdminGrantBillingTier = Exclude<BillingTier, "free">

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
  stripeBillingEnabled: boolean
  stripeTier: BillingTier
}

export const BILLING_TIER_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  super_max: "Super Max",
} satisfies Record<BillingTier, string>

export function isPaidBillingTier(
  tier: BillingTier
): tier is StripeBillingTier {
  return tier === "plus" || tier === "pro"
}
