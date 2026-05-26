import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import {
  BillingTierContext,
  type BillingTierContextValue,
} from "@/lib/billing-tier-state"
import {
  type ActiveAdminSubscriptionTierGrant,
  type BillingTierSummary,
  type BillingTier,
} from "@/lib/subscription-tiers"

const BILLING_TIER_REFRESH_INTERVAL_MS = 5000

export function BillingTierProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId: string | null
}) {
  const requestIdRef = useRef(0)
  const prefetchedUserIdRef = useRef<string | null>(null)
  const [activeAdminTierGrant, setActiveAdminTierGrant] =
    useState<ActiveAdminSubscriptionTierGrant | null>(null)
  const [billingTier, setBillingTier] = useState<BillingTier>("free")
  const [billingTierError, setBillingTierError] = useState<string | null>(null)
  const [hasLoadedBillingTier, setHasLoadedBillingTier] = useState(false)
  const [isBillingTierLoading, setIsBillingTierLoading] = useState(false)
  const [pollingRequestCount, setPollingRequestCount] = useState(0)
  const [stripeBillingTier, setStripeBillingTier] =
    useState<BillingTier>("free")

  useEffect(() => {
    requestIdRef.current += 1
    setActiveAdminTierGrant(null)
    setBillingTier("free")
    setBillingTierError(null)
    setHasLoadedBillingTier(false)
    setIsBillingTierLoading(false)
    prefetchedUserIdRef.current = null
    setStripeBillingTier("free")
  }, [userId])

  const refreshBillingTier = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!userId) {
      setActiveAdminTierGrant(null)
      setBillingTier("free")
      setBillingTierError(null)
      setHasLoadedBillingTier(false)
      setIsBillingTierLoading(false)
      setStripeBillingTier("free")
      return "free"
    }

    setIsBillingTierLoading(true)
    setBillingTierError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/billing/tier`, {
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Subscription could not be loaded.")
        )
      }

      const summary = (await response.json()) as BillingTierSummary

      if (requestIdRef.current === requestId) {
        setActiveAdminTierGrant(summary.adminGrant)
        setBillingTier(summary.effectiveTier)
        setBillingTierError(null)
        setHasLoadedBillingTier(true)
        setStripeBillingTier(summary.stripeTier)
      }

      return summary.effectiveTier
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setBillingTierError(
          error instanceof Error
            ? error.message
            : "Subscription could not be loaded."
        )
      }

      return null
    } finally {
      if (requestIdRef.current === requestId) {
        setIsBillingTierLoading(false)
      }
    }
  }, [userId])

  useEffect(() => {
    if (!userId || prefetchedUserIdRef.current === userId) {
      return
    }

    prefetchedUserIdRef.current = userId
    void refreshBillingTier()
  }, [refreshBillingTier, userId])

  const beginBillingTierPolling = useCallback(() => {
    setPollingRequestCount((currentCount) => currentCount + 1)

    return () => {
      setPollingRequestCount((currentCount) => Math.max(0, currentCount - 1))
    }
  }, [])

  useEffect(() => {
    if (pollingRequestCount <= 0) {
      return
    }

    void refreshBillingTier()
    const refreshInterval = window.setInterval(() => {
      void refreshBillingTier()
    }, BILLING_TIER_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(refreshInterval)
    }
  }, [pollingRequestCount, refreshBillingTier])

  const contextValue = useMemo<BillingTierContextValue>(
    () => ({
      activeAdminTierGrant,
      beginBillingTierPolling,
      billingTier,
      billingTierError,
      hasLoadedBillingTier,
      isBillingTierLoading,
      refreshBillingTier,
      stripeBillingTier,
    }),
    [
      activeAdminTierGrant,
      beginBillingTierPolling,
      billingTier,
      billingTierError,
      hasLoadedBillingTier,
      isBillingTierLoading,
      refreshBillingTier,
      stripeBillingTier,
    ]
  )

  return (
    <BillingTierContext.Provider value={contextValue}>
      {children}
    </BillingTierContext.Provider>
  )
}
