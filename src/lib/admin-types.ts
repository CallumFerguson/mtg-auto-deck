import type {
  ActiveAdminSubscriptionTierGrant,
  BillingTier,
} from "@/lib/subscription-tiers"

export type AdminUser = {
  activeAdminTierGrant: ActiveAdminSubscriptionTierGrant | null
  id: string
  email: string
  emailVerified: boolean
  effectiveTier: BillingTier
  name: string
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: string | null
  recentLlmRunCostUsd: number
  stripeTier: BillingTier
  totalLlmRunCostUsd: number
  createdAt: string
  updatedAt: string
}

export type AdminUsersResponse = {
  users: AdminUser[]
  total: number
  recentLlmRunCostUsd: number
  totalLlmRunCostUsd: number
}
