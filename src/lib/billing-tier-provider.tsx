import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { authClient } from "@/lib/auth-client"
import { getAuthErrorMessage } from "@/lib/billing"
import {
  BillingTierContext,
  type BillingTierContextValue,
} from "@/lib/billing-tier-state"
import {
  getActiveBillingSubscription,
  getBillingTierFromSubscription,
  type BillingSubscription,
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
  const [billingTier, setBillingTier] = useState<BillingTier>("free")
  const [billingTierError, setBillingTierError] = useState<string | null>(null)
  const [hasLoadedBillingTier, setHasLoadedBillingTier] = useState(false)
  const [isBillingTierLoading, setIsBillingTierLoading] = useState(false)
  const [pollingRequestCount, setPollingRequestCount] = useState(0)

  useEffect(() => {
    requestIdRef.current += 1
    setBillingTier("free")
    setBillingTierError(null)
    setHasLoadedBillingTier(false)
    setIsBillingTierLoading(false)
  }, [userId])

  const refreshBillingTier = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!userId) {
      setBillingTier("free")
      setBillingTierError(null)
      setHasLoadedBillingTier(false)
      setIsBillingTierLoading(false)
      return "free"
    }

    setIsBillingTierLoading(true)
    setBillingTierError(null)

    try {
      const result = await authClient.subscription.list({
        query: {},
      })

      if (result.error) {
        throw new Error(
          getAuthErrorMessage(
            result.error,
            "Subscription could not be loaded."
          )
        )
      }

      const subscriptions: BillingSubscription[] = Array.isArray(result.data)
        ? result.data
        : []
      const activeSubscription = getActiveBillingSubscription(subscriptions)
      const nextBillingTier = getBillingTierFromSubscription(activeSubscription)

      if (requestIdRef.current === requestId) {
        setBillingTier(nextBillingTier)
        setBillingTierError(null)
        setHasLoadedBillingTier(true)
      }

      return nextBillingTier
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
      beginBillingTierPolling,
      billingTier,
      billingTierError,
      hasLoadedBillingTier,
      isBillingTierLoading,
      refreshBillingTier,
    }),
    [
      beginBillingTierPolling,
      billingTier,
      billingTierError,
      hasLoadedBillingTier,
      isBillingTierLoading,
      refreshBillingTier,
    ]
  )

  return (
    <BillingTierContext.Provider value={contextValue}>
      {children}
    </BillingTierContext.Provider>
  )
}
