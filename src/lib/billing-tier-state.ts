import { createContext, useContext, useEffect } from "react"

import type {
  ActiveAdminSubscriptionTierGrant,
  BillingTier,
} from "@/lib/subscription-tiers"

export type BillingTierContextValue = {
  activeAdminTierGrant: ActiveAdminSubscriptionTierGrant | null
  beginBillingTierPolling: () => () => void
  billingTier: BillingTier
  billingTierError: string | null
  hasLoadedBillingTier: boolean
  isBillingTierLoading: boolean
  refreshBillingTier: () => Promise<BillingTier | null>
  stripeBillingEnabled: boolean
  stripeBillingTier: BillingTier
}

export const BillingTierContext =
  createContext<BillingTierContextValue | null>(null)

export function useBillingTier() {
  const contextValue = useContext(BillingTierContext)

  if (!contextValue) {
    throw new Error("useBillingTier must be used within BillingTierProvider.")
  }

  return contextValue
}

export function useOptionalBillingTier() {
  return useContext(BillingTierContext)
}

export function useBillingTierPolling(isActive: boolean) {
  const { beginBillingTierPolling } = useBillingTier()

  useEffect(() => {
    if (!isActive) {
      return
    }

    return beginBillingTierPolling()
  }, [beginBillingTierPolling, isActive])
}
