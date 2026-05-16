import { createContext, useContext, useEffect } from "react"

import type { UsageLimitWindow } from "@/lib/usage-limit-types"

export type UsageLimitsContextValue = {
  beginUsageLimitsPolling: () => () => void
  isUsageLimitsLoading: boolean
  refreshUsageLimits: () => Promise<UsageLimitWindow[]>
  usageLimits: UsageLimitWindow[]
  usageLimitsError: string | null
}

export const UsageLimitsContext =
  createContext<UsageLimitsContextValue | null>(null)

export function useUsageLimits() {
  const contextValue = useContext(UsageLimitsContext)

  if (!contextValue) {
    throw new Error("useUsageLimits must be used within UsageLimitsProvider.")
  }

  return contextValue
}

export function useUsageLimitsPolling(isActive: boolean) {
  const { beginUsageLimitsPolling } = useUsageLimits()

  useEffect(() => {
    if (!isActive) {
      return
    }

    return beginUsageLimitsPolling()
  }, [beginUsageLimitsPolling, isActive])
}
