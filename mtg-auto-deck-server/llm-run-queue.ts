export type LlmRunQueueCapacityInput = {
  activeOwnerUserIds: readonly (string | null)[]
  candidateMaxConcurrentRuns: number
  candidateOwnerUserId: string | null
  candidateQueuedAt: string | null
  maxConcurrentRuns: number
}

export function canClaimQueuedLlmRunWithCapacity({
  activeOwnerUserIds,
  candidateMaxConcurrentRuns,
  candidateOwnerUserId,
  candidateQueuedAt,
  maxConcurrentRuns,
}: LlmRunQueueCapacityInput) {
  if (candidateQueuedAt === null) {
    return false
  }

  if (activeOwnerUserIds.length >= maxConcurrentRuns) {
    return false
  }

  const activeRunsForOwner = activeOwnerUserIds.filter(
    (ownerUserId) => ownerUserId === candidateOwnerUserId
  ).length

  return activeRunsForOwner < candidateMaxConcurrentRuns
}
