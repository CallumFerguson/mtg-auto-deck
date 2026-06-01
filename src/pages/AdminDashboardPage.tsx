import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  CircleOff,
  Copy,
  Download,
  Edit3,
  LayoutDashboard,
  LogIn,
  MoreVertical,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  Star,
  Square,
  Trash2,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { AccountMenu } from "@/components/AccountMenu"
import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import type {
  AdminBenchmark,
  AdminBenchmarksResponse,
  AdminUser,
  AdminUsersResponse,
  CreateAdminBenchmarkResponse,
  StopAdminBenchmarkResponse,
} from "@/lib/admin-types"
import { authClient, type AuthUser } from "@/lib/auth-client"
import type { Deck, DecksResponse, LlmProcessingMode } from "@/lib/deck-types"
import {
  BILLING_TIER_LABELS,
  type AdminGrantBillingTier,
  type BillingTier,
  type BillingTierSummary,
} from "@/lib/subscription-tiers"
import {
  formatProviderLabel,
  getLlmModelPresetLabel,
  getLlmModelPresetTechnicalLabel,
  type LlmModelPreset,
  type LlmModelPresetsResponse,
  type AdminLlmModelPreset,
  type AdminLlmModelPresetsResponse,
  type LlmProvider,
  type ReasoningEffort,
} from "@/lib/llm-model-preset-types"
import type { AdminDashboardSectionId } from "@/lib/navigation"
import { FlexServiceTierSwitch } from "./deck-simulation/SimulationSetupControls"

type AdminDashboardProps = {
  activeSectionId: AdminDashboardSectionId | null
  adminOptionsEnabled: boolean
  isImpersonating: boolean
  onAdminOptionsEnabledChange: (isEnabled: boolean) => void
  onSessionChanged: () => Promise<void> | void
  onSignedOut: () => void
  onStopImpersonating: () => Promise<void> | void
  user: AuthUser
}

type AdminSection = {
  id: AdminDashboardSectionId
  label: string
  description: string
  path: string
  Icon: typeof UsersRound
}

const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    id: "users",
    label: "Users",
    description: "Accounts and access",
    path: "/admin/users",
    Icon: UsersRound,
  },
  {
    id: "model-presets",
    label: "Model presets",
    description: "Runtime LLM choices",
    path: "/admin/model-presets",
    Icon: BrainCircuit,
  },
  {
    id: "benchmarks",
    label: "Benchmarks",
    description: "Preset comparisons",
    path: "/admin/benchmarks",
    Icon: BarChart3,
  },
]

const ADMIN_USER_ACTIONS_MENU_WIDTH = 208
const ADMIN_USER_ACTIONS_MENU_GAP = 6
const ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN = 8
const ADMIN_MODEL_PRESET_ACTIONS_MENU_WIDTH = 192
const ADMIN_MODEL_PRESET_ACTIONS_MENU_GAP = 6
const ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN = 8
const ADMIN_BENCHMARK_ACTIONS_MENU_WIDTH = 192
const ADMIN_BENCHMARK_ACTIONS_MENU_GAP = 6
const ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN = 8

type FloatingMenuPosition = {
  left: number
  maxHeight: number
  top: number
}

type UpdateLlmModelPresetPayload = {
  name: string | null
  model: string
  reasoningEffort: ReasoningEffort
  openrouterModelProvider: string | null
  supportsFlex: boolean
  isFreeTier: boolean
  inputTokenCostUsdPerMillion: number | null
  cachedInputTokenCostUsdPerMillion: number | null
  cacheWriteInputTokenCostUsdPerMillion: number | null
  outputTokenCostUsdPerMillion: number | null
}

const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]
const ANTHROPIC_REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]

function getReasoningEffortOptions(provider: LlmProvider) {
  return provider === "anthropic"
    ? ANTHROPIC_REASONING_EFFORT_OPTIONS
    : REASONING_EFFORT_OPTIONS.filter((effort) => effort !== "max")
}

function normalizeReasoningEffortForProvider(
  provider: LlmProvider,
  reasoningEffort: ReasoningEffort
): ReasoningEffort {
  const options = getReasoningEffortOptions(provider)

  return options.includes(reasoningEffort) ? reasoningEffort : "medium"
}

function supportsProviderFlex(provider: LlmProvider) {
  return provider === "openai" || provider === "openrouter"
}
const ADMIN_GRANT_TIER_OPTIONS: readonly AdminGrantBillingTier[] = [
  "plus",
  "pro",
  "super_max",
]

export function AdminDashboardPage({
  activeSectionId,
  adminOptionsEnabled,
  isImpersonating,
  onAdminOptionsEnabledChange,
  onSessionChanged,
  onSignedOut,
  onStopImpersonating,
  user,
}: AdminDashboardProps) {
  const navigate = useNavigate()
  const activeSection = ADMIN_SECTIONS.find(
    (section) => section.id === activeSectionId
  )

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AdminDashboardHeader
          adminOptionsEnabled={adminOptionsEnabled}
          isImpersonating={isImpersonating}
          navigate={navigate}
          onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
          onSignedOut={onSignedOut}
          onStopImpersonating={onStopImpersonating}
          user={user}
        />

        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden rounded-lg border border-border bg-card/70 p-2 lg:block">
            <AdminSectionNav
              activeSectionId={activeSectionId}
              navigate={navigate}
            />
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="debug-scrollbar-neutral overflow-x-auto lg:hidden">
              <div className="flex min-w-max gap-2 rounded-lg border border-border bg-card/70 p-2">
                <AdminSectionNav
                  activeSectionId={activeSectionId}
                  compact
                  navigate={navigate}
                />
              </div>
            </div>

            {activeSection?.id === "users" ? (
              <AdminUsersSection
                currentUserId={user.id}
                onSessionChanged={onSessionChanged}
              />
            ) : activeSection?.id === "model-presets" ? (
              <AdminModelPresetsSection />
            ) : activeSection?.id === "benchmarks" ? (
              <AdminBenchmarksSection />
            ) : (
              <UnknownAdminSection />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export function AdminAccessDeniedPage({
  adminOptionsEnabled,
  isImpersonating,
  onAdminOptionsEnabledChange,
  onSignedOut,
  onStopImpersonating,
  user,
}: Omit<AdminDashboardProps, "activeSectionId" | "onSessionChanged">) {
  const navigate = useNavigate()

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-5">
          <Button
            type="button"
            variant="ghost"
            size="default"
            onClick={() => navigate("/")}
          >
            <ArrowLeft data-icon="inline-start" />
            Decks
          </Button>
          <AccountMenu
            adminOptionsEnabled={adminOptionsEnabled}
            isImpersonating={isImpersonating}
            onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
            onSignedOut={onSignedOut}
            onStopImpersonating={onStopImpersonating}
            user={user}
          />
        </header>

        <section className="rounded-lg border border-border bg-card/70 px-5 py-8 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold">
                  Admin access required
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Your account does not have permission to view this dashboard.
                </p>
              </div>
              <Button type="button" onClick={() => navigate("/")}>
                <ArrowLeft data-icon="inline-start" />
                Back to decks
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function AdminDashboardHeader({
  adminOptionsEnabled,
  isImpersonating,
  navigate,
  onAdminOptionsEnabledChange,
  onSignedOut,
  onStopImpersonating,
  user,
}: Omit<AdminDashboardProps, "activeSectionId" | "onSessionChanged"> & {
  navigate: (path: string) => void
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          size="default"
          className="w-fit"
          onClick={() => navigate("/")}
        >
          <ArrowLeft data-icon="inline-start" />
          Decks
        </Button>
        <div className="space-y-1">
          <p className="text-sm font-medium text-sky-300">MTG Auto Deck</p>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="size-6 text-sky-300" aria-hidden />
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Admin dashboard
            </h1>
          </div>
        </div>
      </div>

      <AccountMenu
        adminOptionsEnabled={adminOptionsEnabled}
        isImpersonating={isImpersonating}
        onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
        onSignedOut={onSignedOut}
        onStopImpersonating={onStopImpersonating}
        user={user}
      />
    </header>
  )
}

function AdminSectionNav({
  activeSectionId,
  compact = false,
  navigate,
}: {
  activeSectionId: AdminDashboardSectionId | null
  compact?: boolean
  navigate: (path: string) => void
}) {
  return (
    <>
      {ADMIN_SECTIONS.map((section) => {
        const Icon = section.Icon
        const isActive = section.id === activeSectionId

        return (
          <button
            className={`flex min-w-44 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors focus:bg-muted/45 focus:outline-none ${
              compact ? "shrink-0" : "w-full"
            } ${
              isActive
                ? "border border-sky-300/30 bg-accent text-foreground"
                : "border border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground"
            }`}
            key={section.id}
            type="button"
            onClick={() => navigate(section.path)}
          >
            <Icon
              className={`size-4 shrink-0 ${
                isActive ? "text-sky-300" : "text-muted-foreground"
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {section.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {section.description}
              </span>
            </span>
          </button>
        )
      })}
    </>
  )
}

function AdminUsersSection({
  currentUserId,
  onSessionChanged,
}: {
  currentUserId: string
  onSessionChanged: () => Promise<void> | void
}) {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [totalLlmRunCostUsd, setTotalLlmRunCostUsd] = useState(0)
  const [recentLlmRunCostUsd, setRecentLlmRunCostUsd] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openUserMenuId, setOpenUserMenuId] = useState<string | null>(null)
  const [userToManageAdminTier, setUserToManageAdminTier] =
    useState<AdminUser | null>(null)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)
  const [userToDemote, setUserToDemote] = useState<AdminUser | null>(null)
  const [userToPromote, setUserToPromote] = useState<AdminUser | null>(null)
  const [adminTierGrantError, setAdminTierGrantError] = useState<string | null>(
    null
  )
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null)
  const [demoteUserError, setDemoteUserError] = useState<string | null>(null)
  const [promoteUserError, setPromoteUserError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [demotingUserId, setDemotingUserId] = useState<string | null>(null)
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null)
  const [savingAdminTierGrantUserId, setSavingAdminTierGrantUserId] = useState<
    string | null
  >(null)
  const [revokingAdminTierGrantUserId, setRevokingAdminTierGrantUserId] =
    useState<string | null>(null)
  const [impersonateUserError, setImpersonateUserError] = useState<
    string | null
  >(null)
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(
    null
  )

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setAdminTierGrantError(null)
    setDemoteUserError(null)
    setImpersonateUserError(null)
    setPromoteUserError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/admin/users`)

      if (!response.ok) {
        setLoadError(await readApiError(response, "Users could not be loaded."))
        return
      }

      const data = (await response.json()) as AdminUsersResponse
      setUsers(data.users)
      setTotal(data.total)
      setTotalLlmRunCostUsd(data.totalLlmRunCostUsd ?? 0)
      setRecentLlmRunCostUsd(data.recentLlmRunCostUsd ?? 0)
    } catch {
      setLoadError("Users could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function handleDeleteUser() {
    if (!userToDelete) {
      return
    }

    setDeletingUserId(userToDelete.id)
    setDeleteUserError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(userToDelete.id)}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setDeleteUserError(
          await readApiError(response, "User could not be deleted.")
        )
        return
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== userToDelete.id)
      )
      setTotal((currentTotal) => Math.max(0, currentTotal - 1))
      setTotalLlmRunCostUsd((currentCost) =>
        Math.max(0, currentCost - userToDelete.totalLlmRunCostUsd)
      )
      setRecentLlmRunCostUsd((currentCost) =>
        Math.max(0, currentCost - userToDelete.recentLlmRunCostUsd)
      )
      setUserToDelete(null)
    } catch {
      setDeleteUserError("User could not be deleted.")
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleDemoteUser() {
    if (!userToDemote || !canDemoteUser(userToDemote)) {
      return
    }

    setDemotingUserId(userToDemote.id)
    setDemoteUserError(null)

    try {
      const result = await authClient.admin.setRole({
        userId: userToDemote.id,
        role: "user",
      })

      if (result.error) {
        setDemoteUserError(
          getAuthClientErrorMessage(
            result.error,
            `Could not demote ${userToDemote.email}.`
          )
        )
        return
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userToDemote.id ? { ...user, role: "user" } : user
        )
      )
      setUserToDemote(null)

      if (userToDemote.id === currentUserId) {
        await onSessionChanged()
        navigate("/")
      }
    } catch {
      setDemoteUserError(`Could not demote ${userToDemote.email}.`)
    } finally {
      setDemotingUserId(null)
    }
  }

  async function handlePromoteUser() {
    if (!userToPromote || !canPromoteUser(userToPromote, currentUserId)) {
      return
    }

    setPromotingUserId(userToPromote.id)
    setPromoteUserError(null)

    try {
      const result = await authClient.admin.setRole({
        userId: userToPromote.id,
        role: "admin",
      })

      if (result.error) {
        setPromoteUserError(
          getAuthClientErrorMessage(
            result.error,
            `Could not promote ${userToPromote.email}.`
          )
        )
        return
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userToPromote.id ? { ...user, role: "admin" } : user
        )
      )
      setUserToPromote(null)
    } catch {
      setPromoteUserError(`Could not promote ${userToPromote.email}.`)
    } finally {
      setPromotingUserId(null)
    }
  }

  async function handleSaveAdminTierGrant({
    days,
    tier,
  }: {
    days: number
    tier: AdminGrantBillingTier
  }) {
    if (!userToManageAdminTier) {
      return
    }

    setSavingAdminTierGrantUserId(userToManageAdminTier.id)
    setAdminTierGrantError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(
          userToManageAdminTier.id
        )}/admin-tier-grant`,
        {
          body: JSON.stringify({
            days,
            tier,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PUT",
        }
      )

      if (!response.ok) {
        setAdminTierGrantError(
          await readApiError(
            response,
            `Could not update admin tier for ${userToManageAdminTier.email}.`
          )
        )
        return
      }

      applyBillingTierSummaryToUser(
        userToManageAdminTier.id,
        (await response.json()) as BillingTierSummary
      )
      setUserToManageAdminTier(null)
    } catch {
      setAdminTierGrantError(
        `Could not update admin tier for ${userToManageAdminTier.email}.`
      )
    } finally {
      setSavingAdminTierGrantUserId(null)
    }
  }

  async function handleRevokeAdminTierGrant() {
    if (!userToManageAdminTier) {
      return
    }

    setRevokingAdminTierGrantUserId(userToManageAdminTier.id)
    setAdminTierGrantError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(
          userToManageAdminTier.id
        )}/admin-tier-grant`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setAdminTierGrantError(
          await readApiError(
            response,
            `Could not revoke admin tier for ${userToManageAdminTier.email}.`
          )
        )
        return
      }

      applyBillingTierSummaryToUser(
        userToManageAdminTier.id,
        (await response.json()) as BillingTierSummary
      )
      setUserToManageAdminTier(null)
    } catch {
      setAdminTierGrantError(
        `Could not revoke admin tier for ${userToManageAdminTier.email}.`
      )
    } finally {
      setRevokingAdminTierGrantUserId(null)
    }
  }

  function applyBillingTierSummaryToUser(
    userId: string,
    summary: BillingTierSummary
  ) {
    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              activeAdminTierGrant: summary.adminGrant,
              effectiveTier: summary.effectiveTier,
              stripeTier: summary.stripeTier,
            }
          : user
      )
    )
  }

  async function handleImpersonateUser(user: AdminUser) {
    if (!canImpersonateUser(user, currentUserId)) {
      return
    }

    setImpersonatingUserId(user.id)
    setImpersonateUserError(null)

    try {
      const result = await authClient.admin.impersonateUser({
        userId: user.id,
      })

      if (result.error) {
        setImpersonateUserError(
          getAuthClientErrorMessage(
            result.error,
            `Could not impersonate ${user.email}.`
          )
        )
        return
      }

      await onSessionChanged()
      navigate("/")
    } catch {
      setImpersonateUserError(`Could not impersonate ${user.email}.`)
    } finally {
      setImpersonatingUserId(null)
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <UsersRound className="size-5 shrink-0 text-sky-300" aria-hidden />
            <h2 className="text-xl font-semibold">Users</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading accounts..."
              : `${total} ${total === 1 ? "account" : "accounts"}`}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <AdminCostSummary label="Last hour">
              {formatUsdCost(recentLlmRunCostUsd)}
            </AdminCostSummary>
            <AdminCostSummary label="All time">
              {formatUsdCost(totalLlmRunCostUsd)}
            </AdminCostSummary>
          </dl>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadUsers()}
            disabled={isLoading}
          >
            <RefreshCw
              data-icon="inline-start"
              className={isLoading ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        </div>
      </div>

      {impersonateUserError ? (
        <p
          className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {impersonateUserError}
        </p>
      ) : null}

      {isLoading ? (
        <AdminPanelMessage>Loading users...</AdminPanelMessage>
      ) : loadError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadUsers()}
          >
            Try again
          </Button>
        </div>
      ) : users.length > 0 ? (
        <>
          <div className="debug-scrollbar-neutral hidden overflow-x-auto rounded-lg border border-border bg-card/70 md:block">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead className="border-b border-border bg-muted/25 text-xs text-muted-foreground">
                <tr>
                  <TableHeader>Account</TableHeader>
                  <TableHeader>Verified</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Last hour</TableHeader>
                  <TableHeader>Total cost</TableHeader>
                  <TableHeader>
                    <span className="sr-only">Actions</span>
                  </TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr
                    className="transition-colors hover:bg-muted/25"
                    key={user.id}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {user.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {getDisplayName(user)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <VerificationBadge isVerified={user.emailVerified} />
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <CostText>
                        {formatUsdCost(user.recentLlmRunCostUsd)}
                      </CostText>
                    </TableCell>
                    <TableCell>
                      <CostText>
                        {formatUsdCost(user.totalLlmRunCostUsd)}
                      </CostText>
                    </TableCell>
                    <TableCell>
                      <AdminUserActionsMenu
                        currentUserId={currentUserId}
                        deletingUserId={deletingUserId}
                        demotingUserId={demotingUserId}
                        impersonatingUserId={impersonatingUserId}
                        menuId={`desktop-${user.id}`}
                        openUserMenuId={openUserMenuId}
                        promotingUserId={promotingUserId}
                        revokingAdminTierGrantUserId={
                          revokingAdminTierGrantUserId
                        }
                        savingAdminTierGrantUserId={savingAdminTierGrantUserId}
                        setOpenUserMenuId={setOpenUserMenuId}
                        user={user}
                        onDeleteUser={(selectedUser) => {
                          setDeleteUserError(null)
                          setUserToDelete(selectedUser)
                        }}
                        onDemoteUser={(selectedUser) => {
                          setDemoteUserError(null)
                          setUserToDemote(selectedUser)
                        }}
                        onImpersonateUser={(selectedUser) =>
                          void handleImpersonateUser(selectedUser)
                        }
                        onManageAdminTier={(selectedUser) => {
                          setAdminTierGrantError(null)
                          setUserToManageAdminTier(selectedUser)
                        }}
                        onPromoteUser={(selectedUser) => {
                          setPromoteUserError(null)
                          setUserToPromote(selectedUser)
                        }}
                      />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {users.map((user) => (
              <li
                className="rounded-lg border border-border bg-card/70 p-4"
                key={user.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {user.email}
                    </p>
                    <p className="text-xs break-words text-muted-foreground">
                      {getDisplayName(user)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RoleBadge role={user.role} />
                    <AdminUserActionsMenu
                      currentUserId={currentUserId}
                      deletingUserId={deletingUserId}
                      demotingUserId={demotingUserId}
                      impersonatingUserId={impersonatingUserId}
                      menuId={`mobile-${user.id}`}
                      openUserMenuId={openUserMenuId}
                      promotingUserId={promotingUserId}
                      revokingAdminTierGrantUserId={
                        revokingAdminTierGrantUserId
                      }
                      savingAdminTierGrantUserId={savingAdminTierGrantUserId}
                      setOpenUserMenuId={setOpenUserMenuId}
                      user={user}
                      onDeleteUser={(selectedUser) => {
                        setDeleteUserError(null)
                        setUserToDelete(selectedUser)
                      }}
                      onDemoteUser={(selectedUser) => {
                        setDemoteUserError(null)
                        setUserToDemote(selectedUser)
                      }}
                      onImpersonateUser={(selectedUser) =>
                        void handleImpersonateUser(selectedUser)
                      }
                      onManageAdminTier={(selectedUser) => {
                        setAdminTierGrantError(null)
                        setUserToManageAdminTier(selectedUser)
                      }}
                      onPromoteUser={(selectedUser) => {
                        setPromoteUserError(null)
                        setUserToPromote(selectedUser)
                      }}
                    />
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-sm">
                  <AdminUserDetail label="Verified">
                    <VerificationBadge isVerified={user.emailVerified} />
                  </AdminUserDetail>
                  <AdminUserDetail label="Last hour">
                    <CostText>
                      {formatUsdCost(user.recentLlmRunCostUsd)}
                    </CostText>
                  </AdminUserDetail>
                  <AdminUserDetail label="Total cost">
                    <CostText>
                      {formatUsdCost(user.totalLlmRunCostUsd)}
                    </CostText>
                  </AdminUserDetail>
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <AdminPanelMessage>No users found.</AdminPanelMessage>
      )}

      {userToManageAdminTier ? (
        <ManageAdminTierGrantModal
          error={adminTierGrantError}
          isRevoking={revokingAdminTierGrantUserId === userToManageAdminTier.id}
          isSaving={savingAdminTierGrantUserId === userToManageAdminTier.id}
          user={userToManageAdminTier}
          onClose={() => {
            setUserToManageAdminTier(null)
            setAdminTierGrantError(null)
          }}
          onRevoke={() => void handleRevokeAdminTierGrant()}
          onSave={(input) => void handleSaveAdminTierGrant(input)}
        />
      ) : null}

      {userToDelete ? (
        <DeleteAdminUserModal
          error={deleteUserError}
          isDeleting={deletingUserId === userToDelete.id}
          user={userToDelete}
          onClose={() => {
            setUserToDelete(null)
            setDeleteUserError(null)
          }}
          onConfirm={() => void handleDeleteUser()}
        />
      ) : null}

      {userToDemote ? (
        <DemoteAdminUserModal
          currentUserId={currentUserId}
          error={demoteUserError}
          isDemoting={demotingUserId === userToDemote.id}
          user={userToDemote}
          onClose={() => {
            setUserToDemote(null)
            setDemoteUserError(null)
          }}
          onConfirm={() => void handleDemoteUser()}
        />
      ) : null}

      {userToPromote ? (
        <PromoteAdminUserModal
          error={promoteUserError}
          isPromoting={promotingUserId === userToPromote.id}
          user={userToPromote}
          onClose={() => {
            setUserToPromote(null)
            setPromoteUserError(null)
          }}
          onConfirm={() => void handlePromoteUser()}
        />
      ) : null}
    </section>
  )
}

function AdminModelPresetsSection() {
  const [presets, setPresets] = useState<AdminLlmModelPreset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [openPresetMenuId, setOpenPresetMenuId] = useState<string | null>(null)
  const [workingPresetId, setWorkingPresetId] = useState<string | null>(null)
  const [presetToEdit, setPresetToEdit] = useState<AdminLlmModelPreset | null>(
    null
  )
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editPresetError, setEditPresetError] = useState<string | null>(null)
  const [presetToDelete, setPresetToDelete] =
    useState<AdminLlmModelPreset | null>(null)
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null)
  const [deletePresetError, setDeletePresetError] = useState<string | null>(
    null
  )
  const [form, setForm] = useState({
    name: "",
    provider: "openai" as LlmProvider,
    model: "",
    reasoningEffort: "medium" as ReasoningEffort,
    openrouterModelProvider: "",
    supportsFlex: false,
    isFreeTier: false,
    inputTokenCostUsdPerMillion: "",
    cachedInputTokenCostUsdPerMillion: "",
    cacheWriteInputTokenCostUsdPerMillion: "",
    outputTokenCostUsdPerMillion: "",
    isEnabled: true,
    isDefault: false,
  })

  const loadPresets = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/admin/llm-model-presets`)

      if (!response.ok) {
        setLoadError(
          await readApiError(response, "Model presets could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as AdminLlmModelPresetsResponse
      setPresets(data.presets)
    } catch {
      setLoadError("Model presets could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  async function handleCreatePreset() {
    const model = form.model.trim()

    if (!model) {
      setActionError("Model is required.")
      return
    }

    setIsCreating(true)
    setActionError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/llm-model-presets`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: form.provider,
            name: form.name.trim() || null,
            model,
            reasoningEffort: form.reasoningEffort,
            openrouterModelProvider:
              form.provider === "openrouter"
                ? form.openrouterModelProvider.trim() || null
                : null,
            supportsFlex: supportsProviderFlex(form.provider)
              ? form.supportsFlex
              : false,
            isFreeTier: form.isFreeTier,
            inputTokenCostUsdPerMillion: parseOptionalCost(
              form.inputTokenCostUsdPerMillion
            ),
            cachedInputTokenCostUsdPerMillion: parseOptionalCost(
              form.cachedInputTokenCostUsdPerMillion
            ),
            cacheWriteInputTokenCostUsdPerMillion: parseOptionalCost(
              form.cacheWriteInputTokenCostUsdPerMillion
            ),
            outputTokenCostUsdPerMillion: parseOptionalCost(
              form.outputTokenCostUsdPerMillion
            ),
            isEnabled: form.isEnabled,
            isDefault: form.isDefault,
          }),
        }
      )

      if (!response.ok) {
        setActionError(
          await readApiError(response, "Model preset could not be created.")
        )
        return
      }

      await response.json()
      setForm((currentForm) => ({
        ...currentForm,
        name: "",
        model: "",
        openrouterModelProvider: "",
        supportsFlex: false,
        isFreeTier: false,
        inputTokenCostUsdPerMillion: "",
        cachedInputTokenCostUsdPerMillion: "",
        cacheWriteInputTokenCostUsdPerMillion: "",
        outputTokenCostUsdPerMillion: "",
        isDefault: false,
      }))
      await loadPresets()
    } catch {
      setActionError("Model preset could not be created.")
    } finally {
      setIsCreating(false)
    }
  }

  async function handleUpdatePreset(payload: UpdateLlmModelPresetPayload) {
    if (!presetToEdit) {
      return
    }

    setEditingPresetId(presetToEdit.id)
    setEditPresetError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/llm-model-presets/${presetToEdit.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        setEditPresetError(
          await readApiError(response, "Model preset could not be updated.")
        )
        return
      }

      setPresetToEdit(null)
      await loadPresets()
    } catch {
      setEditPresetError("Model preset could not be updated.")
    } finally {
      setEditingPresetId(null)
    }
  }

  async function updatePresetAction(
    presetId: string,
    action: () => Promise<Response>,
    fallbackMessage: string
  ) {
    setWorkingPresetId(presetId)
    setActionError(null)

    try {
      const response = await action()

      if (!response.ok) {
        setActionError(await readApiError(response, fallbackMessage))
        return
      }

      await loadPresets()
    } catch {
      setActionError(fallbackMessage)
    } finally {
      setWorkingPresetId(null)
    }
  }

  async function handleDeletePreset() {
    if (!presetToDelete || !presetToDelete.canDelete) {
      return
    }

    setDeletingPresetId(presetToDelete.id)
    setDeletePresetError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/llm-model-presets/${presetToDelete.id}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setDeletePresetError(
          await readApiError(response, "Model preset could not be deleted.")
        )
        return
      }

      setPresetToDelete(null)
      await loadPresets()
    } catch {
      setDeletePresetError("Model preset could not be deleted.")
    } finally {
      setDeletingPresetId(null)
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <BrainCircuit
              className="size-5 shrink-0 text-sky-300"
              aria-hidden
            />
            <h2 className="text-xl font-semibold">Model presets</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading presets..."
              : `${presets.length} ${
                  presets.length === 1 ? "preset" : "presets"
                }`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadPresets()}
          disabled={isLoading}
        >
          <RefreshCw
            data-icon="inline-start"
            className={isLoading ? "animate-spin" : undefined}
          />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card/70 p-4">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreatePreset()
          }}
        >
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-sky-300" aria-hidden />
            <h3 className="text-sm font-semibold">Add preset</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdminFormField label="Name">
              <input
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={form.name}
                placeholder="optional"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Provider">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={form.provider}
                onChange={(event) =>
                  setForm((currentForm) => {
                    const provider = event.target.value as LlmProvider

                    return {
                      ...currentForm,
                      provider,
                      reasoningEffort: normalizeReasoningEffortForProvider(
                        provider,
                        currentForm.reasoningEffort
                      ),
                      supportsFlex: supportsProviderFlex(provider)
                        ? currentForm.supportsFlex
                        : false,
                    }
                  })
                }
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
                <option value="llamacpp">llama.cpp</option>
              </select>
            </AdminFormField>
            <AdminFormField label="Model">
              <input
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={form.model}
                placeholder="gpt-5.4-nano"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    model: event.target.value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Reasoning">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={form.reasoningEffort}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    reasoningEffort: event.target.value as ReasoningEffort,
                  }))
                }
              >
                {getReasoningEffortOptions(form.provider).map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="OpenRouter provider">
              <input
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                value={form.openrouterModelProvider}
                placeholder="openai"
                disabled={form.provider !== "openrouter"}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    openrouterModelProvider: event.target.value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Flex">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={
                    form.supportsFlex && supportsProviderFlex(form.provider)
                  }
                  disabled={!supportsProviderFlex(form.provider)}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      supportsFlex: event.target.checked,
                    }))
                  }
                />
                Supports flex
              </label>
            </AdminFormField>
            <AdminFormField label="Free tier">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={form.isFreeTier}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      isFreeTier: event.target.checked,
                    }))
                  }
                />
                Free tier
              </label>
            </AdminFormField>
            <AdminFormField label="Input $/M">
              <CostInput
                value={form.inputTokenCostUsdPerMillion}
                onChange={(value) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    inputTokenCostUsdPerMillion: value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Cached input $/M">
              <CostInput
                value={form.cachedInputTokenCostUsdPerMillion}
                onChange={(value) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    cachedInputTokenCostUsdPerMillion: value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Cache write $/M">
              <CostInput
                value={form.cacheWriteInputTokenCostUsdPerMillion}
                onChange={(value) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    cacheWriteInputTokenCostUsdPerMillion: value,
                  }))
                }
              />
            </AdminFormField>
            <AdminFormField label="Output $/M">
              <CostInput
                value={form.outputTokenCostUsdPerMillion}
                onChange={(value) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    outputTokenCostUsdPerMillion: value,
                  }))
                }
              />
            </AdminFormField>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      isEnabled: event.target.checked,
                      isDefault: event.target.checked && currentForm.isDefault,
                    }))
                  }
                />
                Enabled
              </label>
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={form.isDefault}
                  disabled={!form.isEnabled}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      isDefault: event.target.checked,
                    }))
                  }
                />
                Default
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {actionError ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {actionError}
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isCreating}>
              <Plus data-icon="inline-start" />
              {isCreating ? "Adding..." : "Add preset"}
            </Button>
          </div>
        </form>
      </div>

      {isLoading ? (
        <AdminPanelMessage>Loading model presets...</AdminPanelMessage>
      ) : loadError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPresets()}
          >
            Try again
          </Button>
        </div>
      ) : presets.length > 0 ? (
        <div className="rounded-lg border border-border bg-card/70">
          <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/25 text-xs text-muted-foreground">
              <tr>
                <TableHeader>Preset</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Default</TableHeader>
                <TableHeader>Costs</TableHeader>
                <TableHeader>Refs</TableHeader>
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {presets.map((preset) => (
                <tr
                  className="transition-colors hover:bg-muted/25"
                  key={preset.id}
                >
                  <TableCell>
                    <div className="min-w-0">
                      <p className="font-medium break-words text-foreground">
                        {getLlmModelPresetLabel(preset)}
                      </p>
                      <p className="text-xs break-words text-muted-foreground">
                        {getLlmModelPresetTechnicalLabel(preset)}
                        {preset.supportsFlex ? " / supports flex" : ""}
                        {preset.isFreeTier ? " / free tier" : ""}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-pressed={preset.isEnabled}
                      aria-label={
                        preset.isEnabled
                          ? "Disable model preset"
                          : "Enable model preset"
                      }
                      title={
                        preset.isEnabled
                          ? "Disable model preset"
                          : "Enable model preset"
                      }
                      className={
                        preset.isEnabled
                          ? "w-full min-w-0 border-emerald-300/35 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15 hover:text-emerald-100"
                          : "w-full min-w-0 border-border bg-muted/35 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }
                      disabled={workingPresetId === preset.id}
                      onClick={() =>
                        void updatePresetAction(
                          preset.id,
                          () =>
                            apiFetch(
                              `${API_BASE_URL}/admin/llm-model-presets/${preset.id}/enabled`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  isEnabled: !preset.isEnabled,
                                }),
                              }
                            ),
                          "Model preset could not be updated."
                        )
                      }
                    >
                      {preset.isEnabled ? <Power /> : <CircleOff />}
                      <span className="hidden xl:inline">
                        {preset.isEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    {preset.isDefault ? (
                      <StatusBadge
                        className="border-sky-300/35 bg-sky-400/10 text-sky-200"
                        icon={<Star className="size-3.5" aria-hidden />}
                      >
                        Default
                      </StatusBadge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="w-full min-w-0"
                        aria-label="Set default model preset"
                        title={
                          preset.isEnabled
                            ? "Set default model preset"
                            : "Enable preset before making it default"
                        }
                        disabled={
                          workingPresetId === preset.id || !preset.isEnabled
                        }
                        onClick={() =>
                          void updatePresetAction(
                            preset.id,
                            () =>
                              apiFetch(
                                `${API_BASE_URL}/admin/llm-model-presets/default`,
                                {
                                  method: "PUT",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    presetId: preset.id,
                                  }),
                                }
                              ),
                            "Default model preset could not be changed."
                          )
                        }
                      >
                        <Star data-icon="inline-start" />
                        <span className="hidden xl:inline">Make default</span>
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <CompactMetricList
                      items={[
                        [
                          "in",
                          formatOptionalCost(
                            preset.inputTokenCostUsdPerMillion
                          ),
                        ],
                        [
                          "cached",
                          formatOptionalCost(
                            preset.cachedInputTokenCostUsdPerMillion
                          ),
                        ],
                        [
                          "write",
                          formatOptionalCost(
                            preset.cacheWriteInputTokenCostUsdPerMillion
                          ),
                        ],
                        [
                          "out",
                          formatOptionalCost(
                            preset.outputTokenCostUsdPerMillion
                          ),
                        ],
                      ]}
                    />
                  </TableCell>
                  <TableCell>
                    <CompactMetricList
                      items={[
                        ["sims", String(preset.simulationReferenceCount)],
                        ["runs", String(preset.llmRunReferenceCount)],
                      ]}
                    />
                  </TableCell>
                  <TableCell>
                    <AdminModelPresetActionsMenu
                      deletingPresetId={deletingPresetId}
                      editingPresetId={editingPresetId}
                      menuId={`preset-${preset.id}`}
                      openPresetMenuId={openPresetMenuId}
                      preset={preset}
                      setOpenPresetMenuId={setOpenPresetMenuId}
                      workingPresetId={workingPresetId}
                      onDeletePreset={(selectedPreset) => {
                        setPresetToDelete(selectedPreset)
                        setDeletePresetError(null)
                      }}
                      onEditPreset={(selectedPreset) => {
                        setPresetToEdit(selectedPreset)
                        setEditPresetError(null)
                      }}
                    />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminPanelMessage>No model presets found.</AdminPanelMessage>
      )}

      {presetToEdit ? (
        <EditLlmModelPresetModal
          error={editPresetError}
          isSaving={editingPresetId === presetToEdit.id}
          preset={presetToEdit}
          onClose={() => {
            setPresetToEdit(null)
            setEditPresetError(null)
          }}
          onSave={(payload) => void handleUpdatePreset(payload)}
        />
      ) : null}

      {presetToDelete ? (
        <DeleteLlmModelPresetModal
          error={deletePresetError}
          isDeleting={deletingPresetId === presetToDelete.id}
          preset={presetToDelete}
          onClose={() => {
            setPresetToDelete(null)
            setDeletePresetError(null)
          }}
          onConfirm={() => void handleDeletePreset()}
        />
      ) : null}
    </section>
  )
}

function AdminBenchmarksSection() {
  const [benchmarks, setBenchmarks] = useState<AdminBenchmark[]>([])
  const [decks, setDecks] = useState<Deck[]>([])
  const [modelPresets, setModelPresets] = useState<LlmModelPreset[]>([])
  const [isLoadingBenchmarks, setIsLoadingBenchmarks] = useState(true)
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [benchmarkLoadError, setBenchmarkLoadError] = useState<string | null>(
    null
  )
  const [optionLoadError, setOptionLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCreatingBenchmark, setIsCreatingBenchmark] = useState(false)
  const [exportingBenchmarkId, setExportingBenchmarkId] = useState<
    string | null
  >(null)
  const [stoppingBenchmarkId, setStoppingBenchmarkId] = useState<string | null>(
    null
  )
  const [openBenchmarkMenuId, setOpenBenchmarkMenuId] = useState<string | null>(
    null
  )
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([])
  const [selectedModelPresetId, setSelectedModelPresetId] = useState("")
  const [simulationsPerDeck, setSimulationsPerDeck] = useState("1")
  const [turnsToSimulate, setTurnsToSimulate] = useState("1")
  const [llmProcessingMode, setLlmProcessingMode] =
    useState<LlmProcessingMode>("realtime")
  const [useFlexServiceTier, setUseFlexServiceTier] = useState(false)

  const selectedModelPreset = useMemo(
    () =>
      modelPresets.find((preset) => preset.id === selectedModelPresetId) ??
      null,
    [modelPresets, selectedModelPresetId]
  )
  const isBatchMode = llmProcessingMode === "openai_batch"
  const supportsSelectedPresetBatch = selectedModelPreset?.provider === "openai"
  const supportsSelectedPresetFlex = Boolean(selectedModelPreset?.supportsFlex)
  const totalBenchmarkSimulationCount =
    selectedDeckIds.length * (Number(simulationsPerDeck) || 0)

  const loadBenchmarks = useCallback(async () => {
    setIsLoadingBenchmarks(true)
    setBenchmarkLoadError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/admin/benchmarks`)

      if (!response.ok) {
        setBenchmarkLoadError(
          await readApiError(response, "Benchmarks could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as AdminBenchmarksResponse
      setBenchmarks(data.benchmarks)
    } catch {
      setBenchmarkLoadError("Benchmarks could not be loaded.")
    } finally {
      setIsLoadingBenchmarks(false)
    }
  }, [])

  const loadBenchmarkOptions = useCallback(async () => {
    setIsLoadingOptions(true)
    setOptionLoadError(null)

    try {
      const [decksResponse, presetsResponse] = await Promise.all([
        apiFetch(`${API_BASE_URL}/decks`),
        apiFetch(`${API_BASE_URL}/llm-model-presets`),
      ])

      if (!decksResponse.ok) {
        setOptionLoadError(
          await readApiError(decksResponse, "Decks could not be loaded.")
        )
        return
      }

      if (!presetsResponse.ok) {
        setOptionLoadError(
          await readApiError(
            presetsResponse,
            "Model presets could not be loaded."
          )
        )
        return
      }

      const decksData = (await decksResponse.json()) as DecksResponse
      const presetsData =
        (await presetsResponse.json()) as LlmModelPresetsResponse
      setDecks(decksData.decks)
      setModelPresets(presetsData.presets)
      setSelectedDeckIds((currentDeckIds) =>
        currentDeckIds.filter((deckId) =>
          decksData.decks.some((deck) => deck.id === deckId)
        )
      )
      setSelectedModelPresetId((currentPresetId) => {
        if (
          presetsData.presets.some((preset) => preset.id === currentPresetId)
        ) {
          return currentPresetId
        }

        return presetsData.defaultPresetId ?? presetsData.presets[0]?.id ?? ""
      })
    } catch {
      setOptionLoadError("Benchmark options could not be loaded.")
    } finally {
      setIsLoadingOptions(false)
    }
  }, [])

  useEffect(() => {
    void loadBenchmarks()
  }, [loadBenchmarks])

  useEffect(() => {
    void loadBenchmarkOptions()
  }, [loadBenchmarkOptions])

  useEffect(() => {
    if (isBatchMode && selectedModelPreset?.provider !== "openai") {
      setLlmProcessingMode("realtime")
    }

    if (useFlexServiceTier && !selectedModelPreset?.supportsFlex) {
      setUseFlexServiceTier(false)
    }
  }, [isBatchMode, selectedModelPreset, useFlexServiceTier])

  function toggleSelectedDeck(deckId: string) {
    setSelectedDeckIds((currentDeckIds) =>
      currentDeckIds.includes(deckId)
        ? currentDeckIds.filter((currentDeckId) => currentDeckId !== deckId)
        : [...currentDeckIds, deckId]
    )
    setActionError(null)
  }

  function handleBatchModeChange(checked: boolean) {
    setLlmProcessingMode(checked ? "openai_batch" : "realtime")

    if (checked) {
      setUseFlexServiceTier(false)
    }

    setActionError(null)
  }

  function handleFlexServiceTierChange(checked: boolean) {
    setUseFlexServiceTier(checked)

    if (checked) {
      setLlmProcessingMode("realtime")
    }

    setActionError(null)
  }

  async function handleCreateBenchmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isCreatingBenchmark) {
      return
    }

    const parsedSimulationsPerDeck = Number(simulationsPerDeck)
    const parsedTurnsToSimulate = Number(turnsToSimulate)

    if (selectedDeckIds.length === 0) {
      setActionError("Choose at least one deck.")
      return
    }

    if (!selectedModelPreset) {
      setActionError("Choose a model preset.")
      return
    }

    if (
      !Number.isInteger(parsedSimulationsPerDeck) ||
      parsedSimulationsPerDeck < 1 ||
      parsedSimulationsPerDeck > 100
    ) {
      setActionError(
        "Simulations per deck must be a whole number from 1 to 100."
      )
      return
    }

    if (!Number.isInteger(parsedTurnsToSimulate) || parsedTurnsToSimulate < 0) {
      setActionError("Turns to simulate must be a non-negative integer.")
      return
    }

    if (isBatchMode && selectedModelPreset.provider !== "openai") {
      setActionError("Batch mode requires an OpenAI model preset.")
      return
    }

    if (useFlexServiceTier && !selectedModelPreset.supportsFlex) {
      setActionError("Flex requires a model preset that supports flex.")
      return
    }

    setIsCreatingBenchmark(true)
    setActionError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/admin/benchmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deckIds: selectedDeckIds,
          llmModelPresetId: selectedModelPreset.id,
          llmProcessingMode,
          simulationsPerDeck: parsedSimulationsPerDeck,
          turnsToSimulate: parsedTurnsToSimulate,
          useFlexServiceTier,
        }),
      })

      if (!response.ok) {
        setActionError(
          await readApiError(response, "Benchmark could not be created.")
        )
        return
      }

      const data = (await response.json()) as CreateAdminBenchmarkResponse
      setBenchmarks((currentBenchmarks) => [
        data.benchmark,
        ...currentBenchmarks.filter(
          (benchmark) => benchmark.id !== data.benchmark.id
        ),
      ])
      await loadBenchmarks()
    } catch {
      setActionError("Benchmark could not be created.")
    } finally {
      setIsCreatingBenchmark(false)
    }
  }

  async function handleExportBenchmark(benchmark: AdminBenchmark) {
    if (exportingBenchmarkId) {
      return
    }

    setExportingBenchmarkId(benchmark.id)
    setActionError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/benchmarks/${benchmark.id}/export`
      )

      if (!response.ok) {
        setActionError(
          await readApiError(response, "Benchmark ZIP could not be exported.")
        )
        return
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = `benchmark-${benchmark.id}.zip`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      setActionError("Benchmark ZIP could not be exported.")
    } finally {
      setExportingBenchmarkId(null)
    }
  }

  async function handleCopyBenchmarkId(benchmark: AdminBenchmark) {
    setActionError(null)

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable.")
      }

      await navigator.clipboard.writeText(benchmark.id)
    } catch {
      setActionError("Benchmark ID could not be copied.")
    }
  }

  async function handleStopBenchmark(benchmark: AdminBenchmark) {
    if (stoppingBenchmarkId) {
      return
    }

    setStoppingBenchmarkId(benchmark.id)
    setActionError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/admin/benchmarks/${benchmark.id}/stop`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        setActionError(
          await readApiError(response, "Benchmark could not be stopped.")
        )
        return
      }

      const data = (await response.json()) as StopAdminBenchmarkResponse

      if (data.benchmark) {
        setBenchmarks((currentBenchmarks) =>
          currentBenchmarks.map((currentBenchmark) =>
            currentBenchmark.id === data.benchmark?.id
              ? data.benchmark
              : currentBenchmark
          )
        )
      }

      if (data.errors.length > 0) {
        setActionError(
          `${data.errors.length} ${
            data.errors.length === 1 ? "simulation" : "simulations"
          } could not be stopped.`
        )
      }

      await loadBenchmarks()
    } catch {
      setActionError("Benchmark could not be stopped.")
    } finally {
      setStoppingBenchmarkId(null)
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 shrink-0 text-sky-300" aria-hidden />
            <h2 className="text-xl font-semibold">Benchmarks</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoadingBenchmarks
              ? "Loading benchmarks..."
              : `${benchmarks.length} ${
                  benchmarks.length === 1 ? "benchmark" : "benchmarks"
                }`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadBenchmarks()}
          disabled={isLoadingBenchmarks}
        >
          <RefreshCw
            data-icon="inline-start"
            className={isLoadingBenchmarks ? "animate-spin" : undefined}
          />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card/70 p-4">
        <form className="grid gap-4" onSubmit={handleCreateBenchmark}>
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-sky-300" aria-hidden />
            <h3 className="text-sm font-semibold">New benchmark</h3>
          </div>

          {optionLoadError ? (
            <div className="flex flex-col gap-3 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive" role="alert">
                {optionLoadError}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadBenchmarkOptions()}
              >
                Try again
              </Button>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-5">
            <div className="grid min-w-0 content-start gap-3">
              <p className="text-sm font-medium">Decks</p>
              {isLoadingOptions ? (
                <div className="rounded-md border border-border bg-background/35 px-3 py-6 text-sm text-muted-foreground">
                  Loading decks...
                </div>
              ) : decks.length > 0 ? (
                <div className="grid max-h-56 auto-rows-min gap-2 overflow-y-auto rounded-md border border-border bg-background/25 p-2">
                  {decks.map((deck) => {
                    const isSelected = selectedDeckIds.includes(deck.id)

                    return (
                      <label
                        className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "border-sky-300/45 bg-sky-400/10 text-foreground"
                            : "border-border bg-background/35 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                        }`}
                        key={deck.id}
                      >
                        <input
                          className="mt-0.5 size-4 accent-sky-300"
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectedDeck(deck.id)}
                        />
                        <span className="min-w-0 truncate font-medium">
                          {deck.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background/35 px-3 py-6 text-sm text-muted-foreground">
                  No owned decks found.
                </div>
              )}
            </div>

            <div className="grid min-w-0 content-start gap-3">
              <AdminFormField label="Model preset">
                <select
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                  value={selectedModelPresetId}
                  disabled={isLoadingOptions || modelPresets.length === 0}
                  onChange={(event) => {
                    setSelectedModelPresetId(event.target.value)
                    setActionError(null)
                  }}
                >
                  {modelPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {getLlmModelPresetLabel(preset)}
                    </option>
                  ))}
                </select>
              </AdminFormField>

              <div className="grid gap-3 sm:grid-cols-2">
                <AdminFormField label="Simulations per deck">
                  <input
                    className="no-number-spinner h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={simulationsPerDeck}
                    onChange={(event) => {
                      setSimulationsPerDeck(event.target.value)
                      setActionError(null)
                    }}
                  />
                </AdminFormField>
                <AdminFormField label="Turns">
                  <input
                    className="no-number-spinner h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    type="number"
                    min="0"
                    step="1"
                    value={turnsToSimulate}
                    onChange={(event) => {
                      setTurnsToSimulate(event.target.value)
                      setActionError(null)
                    }}
                  />
                </AdminFormField>
              </div>

              <label
                className={`flex min-h-14 items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
                  isBatchMode
                    ? "border-ring bg-accent text-accent-foreground"
                    : "border-border bg-background/35 text-muted-foreground"
                } ${
                  !supportsSelectedPresetBatch || useFlexServiceTier
                    ? "cursor-not-allowed opacity-60"
                    : ""
                }`}
              >
                <input
                  className="mt-1 size-4 accent-sky-300"
                  type="checkbox"
                  checked={isBatchMode}
                  disabled={!supportsSelectedPresetBatch || useFlexServiceTier}
                  onChange={(event) =>
                    handleBatchModeChange(event.target.checked)
                  }
                />
                <span className="grid min-w-0 gap-1">
                  <span className="font-medium">Use batch mode</span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    OpenAI batch processing
                  </span>
                </span>
              </label>

              <FlexServiceTierSwitch
                checked={useFlexServiceTier}
                disabled={!supportsSelectedPresetFlex || isBatchMode}
                activeWarning={
                  isBatchMode
                    ? "Batch mode and flex processing are mutually exclusive."
                    : undefined
                }
                onCheckedChange={handleFlexServiceTierChange}
              />

              <div className="rounded-md border border-border bg-background/35 px-3 py-3">
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <AdminCostSummary label="Decks">
                    {selectedDeckIds.length}
                  </AdminCostSummary>
                  <AdminCostSummary label="Simulations">
                    {Number.isFinite(totalBenchmarkSimulationCount)
                      ? totalBenchmarkSimulationCount
                      : 0}
                  </AdminCostSummary>
                  <AdminCostSummary label="Mode">
                    {formatBenchmarkProcessingMode(
                      llmProcessingMode,
                      useFlexServiceTier
                    )}
                  </AdminCostSummary>
                </dl>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {actionError ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {actionError}
              </p>
            ) : (
              <span />
            )}
            <Button
              type="submit"
              disabled={
                isCreatingBenchmark ||
                isLoadingOptions ||
                selectedDeckIds.length === 0 ||
                !selectedModelPreset
              }
            >
              <Plus data-icon="inline-start" />
              {isCreatingBenchmark ? "Starting..." : "Start benchmark"}
            </Button>
          </div>
        </form>
      </div>

      {isLoadingBenchmarks ? (
        <AdminPanelMessage>Loading benchmarks...</AdminPanelMessage>
      ) : benchmarkLoadError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive" role="alert">
            {benchmarkLoadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadBenchmarks()}
          >
            Try again
          </Button>
        </div>
      ) : benchmarks.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card/70">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/25 text-xs text-muted-foreground">
              <tr>
                <TableHeader>Benchmark</TableHeader>
                <TableHeader>Decks</TableHeader>
                <TableHeader>Settings</TableHeader>
                <TableHeader>Progress</TableHeader>
                <TableHeader>Metrics</TableHeader>
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {benchmarks.map((benchmark) => {
                return (
                  <tr
                    className="transition-colors hover:bg-muted/25"
                    key={benchmark.id}
                  >
                    <TableCell>
                      <div className="grid gap-2">
                        <div className="min-w-0">
                          <p className="font-medium break-words text-foreground">
                            {getBenchmarkPresetLabel(benchmark)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(benchmark.createdAt)}
                          </p>
                        </div>
                        <BenchmarkStatusBadge status={benchmark.status} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1 text-xs text-muted-foreground">
                        {benchmark.decks.slice(0, 3).map((deck) => (
                          <span className="break-words" key={deck.id}>
                            {deck.name}
                          </span>
                        ))}
                        {benchmark.decks.length > 3 ? (
                          <span>+{benchmark.decks.length - 3} more</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CompactMetricList
                        items={[
                          [
                            "mode",
                            formatBenchmarkProcessingMode(
                              benchmark.llmProcessingMode,
                              benchmark.useFlexServiceTier
                            ),
                          ],
                          ["turns", String(benchmark.turnsToSimulate)],
                          ["per deck", String(benchmark.simulationsPerDeck)],
                        ]}
                      />
                    </TableCell>
                    <TableCell>
                      <CompactMetricList
                        items={[
                          ["total", String(benchmark.totalSimulationCount)],
                          ["active", String(benchmark.activeSimulationCount)],
                          ["done", String(benchmark.completedSimulationCount)],
                          ["failed", String(benchmark.failedSimulationCount)],
                          [
                            "stopped",
                            String(benchmark.cancelledSimulationCount),
                          ],
                        ]}
                      />
                    </TableCell>
                    <TableCell>
                      <CompactMetricList
                        items={[
                          [
                            "avg turns",
                            benchmark.averageSimulatedTurnCount.toFixed(1),
                          ],
                          [
                            "cost",
                            formatUsdCost(benchmark.totalEstimatedCostUsd),
                          ],
                        ]}
                      />
                    </TableCell>
                    <TableCell className="px-2">
                      <AdminBenchmarkActionsMenu
                        benchmark={benchmark}
                        exportingBenchmarkId={exportingBenchmarkId}
                        menuId={benchmark.id}
                        onCopyBenchmarkId={handleCopyBenchmarkId}
                        onExportBenchmark={handleExportBenchmark}
                        onStopBenchmark={handleStopBenchmark}
                        openBenchmarkMenuId={openBenchmarkMenuId}
                        setOpenBenchmarkMenuId={setOpenBenchmarkMenuId}
                        stoppingBenchmarkId={stoppingBenchmarkId}
                      />
                    </TableCell>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminPanelMessage>No benchmarks found.</AdminPanelMessage>
      )}
    </section>
  )
}

function AdminBenchmarkActionsMenu({
  benchmark,
  exportingBenchmarkId,
  menuId,
  onCopyBenchmarkId,
  onExportBenchmark,
  onStopBenchmark,
  openBenchmarkMenuId,
  setOpenBenchmarkMenuId,
  stoppingBenchmarkId,
}: {
  benchmark: AdminBenchmark
  exportingBenchmarkId: string | null
  menuId: string
  onCopyBenchmarkId: (benchmark: AdminBenchmark) => void
  onExportBenchmark: (benchmark: AdminBenchmark) => void
  onStopBenchmark: (benchmark: AdminBenchmark) => void
  openBenchmarkMenuId: string | null
  setOpenBenchmarkMenuId: Dispatch<SetStateAction<string | null>>
  stoppingBenchmarkId: string | null
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(
    null
  )
  const isOpen = openBenchmarkMenuId === menuId
  const isExporting = exportingBenchmarkId === benchmark.id
  const isStopping = stoppingBenchmarkId === benchmark.id
  const isStopDisabled =
    benchmark.status !== "running" ||
    Boolean(stoppingBenchmarkId) ||
    Boolean(exportingBenchmarkId)
  const isExportDisabled =
    Boolean(exportingBenchmarkId) || Boolean(stoppingBenchmarkId)

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current

    if (!trigger || trigger.getClientRects().length === 0) {
      setOpenBenchmarkMenuId(null)
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth =
      menuRef.current?.offsetWidth ?? ADMIN_BENCHMARK_ACTIONS_MENU_WIDTH
    const menuHeight = menuRef.current?.offsetHeight ?? 0
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const minimumLeft = ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN
    const maximumLeft = Math.max(
      minimumLeft,
      viewportWidth - menuWidth - ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const left = Math.min(
      Math.max(triggerRect.right - menuWidth, minimumLeft),
      maximumLeft
    )
    const belowTop = triggerRect.bottom + ADMIN_BENCHMARK_ACTIONS_MENU_GAP
    const aboveTop =
      triggerRect.top - menuHeight - ADMIN_BENCHMARK_ACTIONS_MENU_GAP
    const shouldOpenBelow =
      belowTop + menuHeight <=
      viewportHeight - ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN
    const preferredTop = shouldOpenBelow ? belowTop : aboveTop
    const maximumTop = Math.max(
      ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN,
      viewportHeight - menuHeight - ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const top = Math.min(
      Math.max(preferredTop, ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN),
      maximumTop
    )
    const maxHeight = Math.max(
      80,
      Math.floor(
        viewportHeight - top - ADMIN_BENCHMARK_ACTIONS_MENU_VIEWPORT_MARGIN
      )
    )
    const nextPosition = {
      left: Math.round(left),
      maxHeight,
      top: Math.round(top),
    }

    setMenuPosition((currentPosition) =>
      currentPosition?.left === nextPosition.left &&
      currentPosition.maxHeight === nextPosition.maxHeight &&
      currentPosition.top === nextPosition.top
        ? currentPosition
        : nextPosition
    )
  }, [setOpenBenchmarkMenuId])

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition()
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenBenchmarkMenuId(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setOpenBenchmarkMenuId])

  const menuStyle: CSSProperties = menuPosition
    ? {
        left: menuPosition.left,
        maxHeight: menuPosition.maxHeight,
        top: menuPosition.top,
      }
    : {
        left: 0,
        top: 0,
        visibility: "hidden",
      }

  return (
    <div className="flex justify-end">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Open actions for benchmark ${getBenchmarkPresetLabel(
          benchmark
        )}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title="Benchmark actions"
        disabled={isExporting || isStopping}
        onClick={() =>
          setOpenBenchmarkMenuId((currentBenchmarkMenuId) =>
            currentBenchmarkMenuId === menuId ? null : menuId
          )
        }
      >
        <MoreVertical />
      </Button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                type="button"
                aria-label="Close benchmark actions"
                onClick={() => setOpenBenchmarkMenuId(null)}
              />
              <div
                ref={menuRef}
                className="fixed z-20 w-48 max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-2xl shadow-black/40"
                role="menu"
                style={menuStyle}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-100 transition-colors hover:bg-sky-400/10 hover:text-sky-100 focus:bg-sky-400/10 focus:outline-none"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenBenchmarkMenuId(null)
                    onCopyBenchmarkId(benchmark)
                  }}
                >
                  <Copy data-icon="inline-start" />
                  Copy ID
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-100 transition-colors hover:bg-sky-400/10 hover:text-sky-100 focus:bg-sky-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  role="menuitem"
                  disabled={isExportDisabled}
                  onClick={() => {
                    setOpenBenchmarkMenuId(null)
                    onExportBenchmark(benchmark)
                  }}
                >
                  <Download data-icon="inline-start" />
                  {isExporting ? "Exporting..." : "Export"}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  role="menuitem"
                  disabled={isStopDisabled}
                  onClick={() => {
                    setOpenBenchmarkMenuId(null)
                    onStopBenchmark(benchmark)
                  }}
                >
                  <Square data-icon="inline-start" />
                  {isStopping ? "Stopping..." : "Stop"}
                </button>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}

function UnknownAdminSection() {
  const navigate = useNavigate()

  return (
    <section className="rounded-lg border border-border bg-card/70 px-5 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/35 text-muted-foreground">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Admin section not found</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              This admin section is not available.
            </p>
          </div>
          <Button type="button" onClick={() => navigate("/admin/users")}>
            <UsersRound data-icon="inline-start" />
            Users
          </Button>
        </div>
      </div>
    </section>
  )
}

function AdminModelPresetActionsMenu({
  deletingPresetId,
  editingPresetId,
  menuId,
  onDeletePreset,
  onEditPreset,
  openPresetMenuId,
  preset,
  setOpenPresetMenuId,
  workingPresetId,
}: {
  deletingPresetId: string | null
  editingPresetId: string | null
  menuId: string
  onDeletePreset: (preset: AdminLlmModelPreset) => void
  onEditPreset: (preset: AdminLlmModelPreset) => void
  openPresetMenuId: string | null
  preset: AdminLlmModelPreset
  setOpenPresetMenuId: Dispatch<SetStateAction<string | null>>
  workingPresetId: string | null
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(
    null
  )
  const isDeleting = deletingPresetId === preset.id
  const isEditing = editingPresetId === preset.id
  const isUpdatingStatus = workingPresetId === preset.id
  const isOpen = openPresetMenuId === menuId
  const isWorking = isDeleting || isEditing || isUpdatingStatus

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current

    if (!trigger || trigger.getClientRects().length === 0) {
      setOpenPresetMenuId(null)
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth =
      menuRef.current?.offsetWidth ?? ADMIN_MODEL_PRESET_ACTIONS_MENU_WIDTH
    const menuHeight = menuRef.current?.offsetHeight ?? 0
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const minimumLeft = ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN
    const maximumLeft = Math.max(
      minimumLeft,
      viewportWidth -
        menuWidth -
        ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const left = Math.min(
      Math.max(triggerRect.right - menuWidth, minimumLeft),
      maximumLeft
    )
    const belowTop = triggerRect.bottom + ADMIN_MODEL_PRESET_ACTIONS_MENU_GAP
    const aboveTop =
      triggerRect.top - menuHeight - ADMIN_MODEL_PRESET_ACTIONS_MENU_GAP
    const shouldOpenBelow =
      belowTop + menuHeight <=
      viewportHeight - ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN
    const preferredTop = shouldOpenBelow ? belowTop : aboveTop
    const maximumTop = Math.max(
      ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN,
      viewportHeight -
        menuHeight -
        ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const top = Math.min(
      Math.max(preferredTop, ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN),
      maximumTop
    )
    const maxHeight = Math.max(
      80,
      Math.floor(
        viewportHeight - top - ADMIN_MODEL_PRESET_ACTIONS_MENU_VIEWPORT_MARGIN
      )
    )
    const nextPosition = {
      left: Math.round(left),
      maxHeight,
      top: Math.round(top),
    }

    setMenuPosition((currentPosition) =>
      currentPosition?.left === nextPosition.left &&
      currentPosition.maxHeight === nextPosition.maxHeight &&
      currentPosition.top === nextPosition.top
        ? currentPosition
        : nextPosition
    )
  }, [setOpenPresetMenuId])

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition()
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPresetMenuId(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setOpenPresetMenuId])

  const menuStyle: CSSProperties = menuPosition
    ? {
        left: menuPosition.left,
        maxHeight: menuPosition.maxHeight,
        top: menuPosition.top,
      }
    : {
        left: 0,
        top: 0,
        visibility: "hidden",
      }

  return (
    <div className="flex justify-end">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Open actions for ${getLlmModelPresetLabel(preset)}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title="Preset actions"
        disabled={isWorking}
        onClick={() =>
          setOpenPresetMenuId((currentPresetMenuId) =>
            currentPresetMenuId === menuId ? null : menuId
          )
        }
      >
        <MoreVertical />
      </Button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                type="button"
                aria-label="Close preset actions"
                onClick={() => setOpenPresetMenuId(null)}
              />
              <div
                ref={menuRef}
                className="fixed z-20 w-48 max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-2xl shadow-black/40"
                role="menu"
                style={menuStyle}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-100 transition-colors hover:bg-sky-400/10 hover:text-sky-100 focus:bg-sky-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  role="menuitem"
                  disabled={isWorking}
                  onClick={() => {
                    setOpenPresetMenuId(null)
                    onEditPreset(preset)
                  }}
                >
                  <Edit3 data-icon="inline-start" />
                  {isEditing ? "Editing..." : "Edit preset"}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  role="menuitem"
                  disabled={isWorking}
                  onClick={() => {
                    setOpenPresetMenuId(null)
                    onDeletePreset(preset)
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  {isDeleting ? "Deleting..." : "Delete preset"}
                </button>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}

function EditLlmModelPresetModal({
  error,
  isSaving,
  onClose,
  onSave,
  preset,
}: {
  error: string | null
  isSaving: boolean
  onClose: () => void
  onSave: (payload: UpdateLlmModelPresetPayload) => void
  preset: AdminLlmModelPreset
}) {
  const [name, setName] = useState(preset.name ?? "")
  const [model, setModel] = useState(preset.model)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    preset.reasoningEffort
  )
  const [openrouterModelProvider, setOpenrouterModelProvider] = useState(
    preset.openrouterModelProvider ?? ""
  )
  const [supportsFlex, setSupportsFlex] = useState(preset.supportsFlex)
  const [isFreeTier, setIsFreeTier] = useState(preset.isFreeTier)
  const [inputTokenCostUsdPerMillion, setInputTokenCostUsdPerMillion] =
    useState(formatCostInputValue(preset.inputTokenCostUsdPerMillion))
  const [
    cachedInputTokenCostUsdPerMillion,
    setCachedInputTokenCostUsdPerMillion,
  ] = useState(formatCostInputValue(preset.cachedInputTokenCostUsdPerMillion))
  const [
    cacheWriteInputTokenCostUsdPerMillion,
    setCacheWriteInputTokenCostUsdPerMillion,
  ] = useState(
    formatCostInputValue(preset.cacheWriteInputTokenCostUsdPerMillion)
  )
  const [outputTokenCostUsdPerMillion, setOutputTokenCostUsdPerMillion] =
    useState(formatCostInputValue(preset.outputTokenCostUsdPerMillion))
  const [localError, setLocalError] = useState<string | null>(null)
  const isOpenRouterPreset = preset.provider === "openrouter"
  const isFlexEditable = supportsProviderFlex(preset.provider)
  const closeIfAllowed = () => {
    if (!isSaving) {
      onClose()
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const trimmedModel = model.trim()

    if (!trimmedModel) {
      setLocalError("Model is required.")
      return
    }

    setLocalError(null)
    onSave({
      name: name.trim() || null,
      model: trimmedModel,
      reasoningEffort,
      openrouterModelProvider: isOpenRouterPreset
        ? openrouterModelProvider.trim() || null
        : null,
      supportsFlex: isFlexEditable ? supportsFlex : false,
      isFreeTier,
      inputTokenCostUsdPerMillion: parseOptionalCost(
        inputTokenCostUsdPerMillion
      ),
      cachedInputTokenCostUsdPerMillion: parseOptionalCost(
        cachedInputTokenCostUsdPerMillion
      ),
      cacheWriteInputTokenCostUsdPerMillion: parseOptionalCost(
        cacheWriteInputTokenCostUsdPerMillion
      ),
      outputTokenCostUsdPerMillion: parseOptionalCost(
        outputTokenCostUsdPerMillion
      ),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={closeIfAllowed}
    >
      <section
        aria-labelledby="edit-model-preset-title"
        className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/30 bg-sky-400/10 text-sky-300">
              <Edit3 className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <h2
                id="edit-model-preset-title"
                className="text-xl font-semibold"
              >
                Edit model preset
              </h2>
              <p className="text-sm break-words text-muted-foreground">
                {formatProviderLabel(preset.provider)}
                {preset.isDefault ? " / default" : ""}
                {preset.isEnabled ? " / enabled" : " / disabled"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            disabled={isSaving}
            onClick={onClose}
          >
            <X />
          </Button>
        </header>

        <form className="grid gap-4 px-5 py-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminFormField label="Name">
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                value={name}
                placeholder="optional"
                disabled={isSaving}
                onChange={(event) => setName(event.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Model">
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                value={model}
                disabled={isSaving}
                onChange={(event) => setModel(event.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Reasoning">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                value={reasoningEffort}
                disabled={isSaving}
                onChange={(event) =>
                  setReasoningEffort(event.target.value as ReasoningEffort)
                }
              >
                {getReasoningEffortOptions(preset.provider).map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </AdminFormField>
            {isOpenRouterPreset ? (
              <AdminFormField label="OpenRouter provider">
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
                  value={openrouterModelProvider}
                  placeholder="openai"
                  disabled={isSaving}
                  onChange={(event) =>
                    setOpenrouterModelProvider(event.target.value)
                  }
                />
              </AdminFormField>
            ) : null}
            <AdminFormField label="Flex">
              <label className="flex h-10 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={supportsFlex && isFlexEditable}
                  disabled={isSaving || !isFlexEditable}
                  onChange={(event) => setSupportsFlex(event.target.checked)}
                />
                Supports flex
              </label>
            </AdminFormField>
            <AdminFormField label="Free tier">
              <label className="flex h-10 items-center gap-2 rounded-md border border-border bg-background/35 px-3 text-sm">
                <input
                  className="size-4 accent-sky-300"
                  type="checkbox"
                  checked={isFreeTier}
                  disabled={isSaving}
                  onChange={(event) => setIsFreeTier(event.target.checked)}
                />
                Free tier
              </label>
            </AdminFormField>
            <AdminFormField label="Input $/M">
              <CostInput
                value={inputTokenCostUsdPerMillion}
                disabled={isSaving}
                onChange={setInputTokenCostUsdPerMillion}
              />
            </AdminFormField>
            <AdminFormField label="Cached input $/M">
              <CostInput
                value={cachedInputTokenCostUsdPerMillion}
                disabled={isSaving}
                onChange={setCachedInputTokenCostUsdPerMillion}
              />
            </AdminFormField>
            <AdminFormField label="Cache write $/M">
              <CostInput
                value={cacheWriteInputTokenCostUsdPerMillion}
                disabled={isSaving}
                onChange={setCacheWriteInputTokenCostUsdPerMillion}
              />
            </AdminFormField>
            <AdminFormField label="Output $/M">
              <CostInput
                value={outputTokenCostUsdPerMillion}
                disabled={isSaving}
                onChange={setOutputTokenCostUsdPerMillion}
              />
            </AdminFormField>
          </div>

          {localError || error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {localError ?? error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <CheckCircle2 data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save preset"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DeleteLlmModelPresetModal({
  error,
  isDeleting,
  onClose,
  onConfirm,
  preset,
}: {
  error: string | null
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
  preset: AdminLlmModelPreset
}) {
  const canDelete = preset.canDelete
  const title = canDelete ? "Delete model preset" : "Cannot delete preset"
  const closeIfAllowed = () => {
    if (!isDeleting) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={closeIfAllowed}
    >
      <section
        aria-labelledby="delete-model-preset-title"
        className="w-full max-w-lg rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div
              className={
                canDelete
                  ? "flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive"
                  : "flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-400/10 text-amber-200"
              }
            >
              {canDelete ? (
                <Trash2 className="size-4" aria-hidden />
              ) : (
                <ShieldAlert className="size-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <h2
                id="delete-model-preset-title"
                className="text-xl font-semibold"
              >
                {title}
              </h2>
              <p className="text-sm break-words text-muted-foreground">
                {getLlmModelPresetLabel(preset)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            disabled={isDeleting}
            onClick={onClose}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          {canDelete ? (
            <p className="text-sm leading-6 text-muted-foreground">
              This preset has no references and can be permanently deleted.
              Disable presets instead when you want to retire a model that has
              already been used.
            </p>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                This preset is already referenced, so it cannot be deleted.
                Disable it instead to keep historical simulations and runs
                intact while preventing future use.
              </p>
              <div className="rounded-md border border-border bg-background/35 px-3 py-2">
                <CompactMetricList
                  items={[
                    ["sims", String(preset.simulationReferenceCount)],
                    ["runs", String(preset.llmRunReferenceCount)],
                  ]}
                />
              </div>
            </>
          )}

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={onClose}
            >
              {canDelete ? "Cancel" : "Close"}
            </Button>
            {canDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={onConfirm}
              >
                <Trash2 data-icon="inline-start" />
                {isDeleting ? "Deleting..." : "Delete preset"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function AdminUserActionsMenu({
  currentUserId,
  deletingUserId,
  demotingUserId,
  impersonatingUserId,
  menuId,
  onDeleteUser,
  onDemoteUser,
  onImpersonateUser,
  onManageAdminTier,
  onPromoteUser,
  openUserMenuId,
  promotingUserId,
  revokingAdminTierGrantUserId,
  savingAdminTierGrantUserId,
  setOpenUserMenuId,
  user,
}: {
  currentUserId: string
  deletingUserId: string | null
  demotingUserId: string | null
  impersonatingUserId: string | null
  menuId: string
  onDeleteUser: (user: AdminUser) => void
  onDemoteUser: (user: AdminUser) => void
  onImpersonateUser: (user: AdminUser) => void
  onManageAdminTier: (user: AdminUser) => void
  onPromoteUser: (user: AdminUser) => void
  openUserMenuId: string | null
  promotingUserId: string | null
  revokingAdminTierGrantUserId: string | null
  savingAdminTierGrantUserId: string | null
  setOpenUserMenuId: Dispatch<SetStateAction<string | null>>
  user: AdminUser
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(
    null
  )
  const isCurrentUser = user.id === currentUserId
  const isDeleting = deletingUserId === user.id
  const isDemotingUser = demotingUserId === user.id
  const isImpersonatingUser = impersonatingUserId === user.id
  const isPromotingUser = promotingUserId === user.id
  const isManagingAdminTier =
    savingAdminTierGrantUserId === user.id ||
    revokingAdminTierGrantUserId === user.id
  const isOpen = openUserMenuId === menuId
  const canDemote = canDemoteUser(user)
  const canImpersonate = canImpersonateUser(user, currentUserId)
  const canPromote = canPromoteUser(user, currentUserId)
  const isWorking =
    isDeleting ||
    isDemotingUser ||
    isImpersonatingUser ||
    isManagingAdminTier ||
    isPromotingUser

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current

    if (!trigger || trigger.getClientRects().length === 0) {
      setOpenUserMenuId(null)
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth =
      menuRef.current?.offsetWidth ?? ADMIN_USER_ACTIONS_MENU_WIDTH
    const menuHeight = menuRef.current?.offsetHeight ?? 0
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const minimumLeft = ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN
    const maximumLeft = Math.max(
      minimumLeft,
      viewportWidth - menuWidth - ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const left = Math.min(
      Math.max(triggerRect.right - menuWidth, minimumLeft),
      maximumLeft
    )
    const belowTop = triggerRect.bottom + ADMIN_USER_ACTIONS_MENU_GAP
    const aboveTop = triggerRect.top - menuHeight - ADMIN_USER_ACTIONS_MENU_GAP
    const shouldOpenBelow =
      belowTop + menuHeight <=
      viewportHeight - ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN
    const preferredTop = shouldOpenBelow ? belowTop : aboveTop
    const maximumTop = Math.max(
      ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN,
      viewportHeight - menuHeight - ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN
    )
    const top = Math.min(
      Math.max(preferredTop, ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN),
      maximumTop
    )
    const maxHeight = Math.max(
      80,
      Math.floor(viewportHeight - top - ADMIN_USER_ACTIONS_MENU_VIEWPORT_MARGIN)
    )
    const nextPosition = {
      left: Math.round(left),
      maxHeight,
      top: Math.round(top),
    }

    setMenuPosition((currentPosition) =>
      currentPosition?.left === nextPosition.left &&
      currentPosition.maxHeight === nextPosition.maxHeight &&
      currentPosition.top === nextPosition.top
        ? currentPosition
        : nextPosition
    )
  }, [setOpenUserMenuId])

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition()
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenUserMenuId(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setOpenUserMenuId])

  const menuStyle: CSSProperties = menuPosition
    ? {
        left: menuPosition.left,
        maxHeight: menuPosition.maxHeight,
        top: menuPosition.top,
      }
    : {
        left: 0,
        top: 0,
        visibility: "hidden",
      }

  return (
    <div className="flex justify-end">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Open actions for ${user.email}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title="User actions"
        disabled={isWorking}
        onClick={() =>
          setOpenUserMenuId((currentUserMenuId) =>
            currentUserMenuId === menuId ? null : menuId
          )
        }
      >
        <MoreVertical />
      </Button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                type="button"
                aria-label="Close user actions"
                onClick={() => setOpenUserMenuId(null)}
              />
              <div
                ref={menuRef}
                className="fixed z-20 w-52 max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-2xl shadow-black/40"
                role="menu"
                style={menuStyle}
              >
                {isCurrentUser ? (
                  <button
                    className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground opacity-70"
                    type="button"
                    role="menuitem"
                    disabled
                  >
                    <UserRound data-icon="inline-start" />
                    Current account
                  </button>
                ) : null}
                {canImpersonate ? (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-100 transition-colors hover:bg-sky-400/10 hover:text-sky-100 focus:bg-sky-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                    role="menuitem"
                    disabled={isWorking}
                    onClick={() => {
                      setOpenUserMenuId(null)
                      onImpersonateUser(user)
                    }}
                  >
                    <LogIn data-icon="inline-start" />
                    {isImpersonatingUser ? "Impersonating..." : "Impersonate"}
                  </button>
                ) : null}
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sky-100 transition-colors hover:bg-sky-400/10 hover:text-sky-100 focus:bg-sky-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  type="button"
                  role="menuitem"
                  disabled={isWorking}
                  onClick={() => {
                    setOpenUserMenuId(null)
                    onManageAdminTier(user)
                  }}
                >
                  <Star data-icon="inline-start" />
                  {isManagingAdminTier ? "Saving tier..." : "Manage admin tier"}
                </button>
                {canPromote ? (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-100 transition-colors hover:bg-emerald-400/10 hover:text-emerald-100 focus:bg-emerald-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                    role="menuitem"
                    disabled={isWorking}
                    onClick={() => {
                      setOpenUserMenuId(null)
                      onPromoteUser(user)
                    }}
                  >
                    <ShieldCheck data-icon="inline-start" />
                    {isPromotingUser ? "Promoting..." : "Promote to admin"}
                  </button>
                ) : null}
                {canDemote ? (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-100 transition-colors hover:bg-amber-400/10 hover:text-amber-100 focus:bg-amber-400/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                    role="menuitem"
                    disabled={isWorking}
                    onClick={() => {
                      setOpenUserMenuId(null)
                      onDemoteUser(user)
                    }}
                  >
                    <ShieldMinus data-icon="inline-start" />
                    {isDemotingUser ? "Demoting..." : "Demote to user"}
                  </button>
                ) : null}
                {!isCurrentUser ? (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                    role="menuitem"
                    disabled={isWorking}
                    onClick={() => {
                      setOpenUserMenuId(null)
                      onDeleteUser(user)
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete user
                  </button>
                ) : null}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}

function ManageAdminTierGrantModal({
  error,
  isRevoking,
  isSaving,
  onClose,
  onRevoke,
  onSave,
  user,
}: {
  error: string | null
  isRevoking: boolean
  isSaving: boolean
  onClose: () => void
  onRevoke: () => void
  onSave: (input: { days: number; tier: AdminGrantBillingTier }) => void
  user: AdminUser
}) {
  const [days, setDays] = useState("30")
  const [localError, setLocalError] = useState<string | null>(null)
  const [tier, setTier] = useState<AdminGrantBillingTier>(
    user.activeAdminTierGrant?.tier ?? "plus"
  )
  const isWorking = isSaving || isRevoking
  const activeGrant = user.activeAdminTierGrant

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedDays = Number(days)

    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      setLocalError("Days must be a whole number from 1 to 3650.")
      return
    }

    setLocalError(null)
    onSave({
      days: parsedDays,
      tier,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isWorking ? undefined : onClose}
    >
      <section
        aria-labelledby="manage-admin-tier-title"
        className="max-h-[calc(100svh-3rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/30 bg-sky-400/10 text-sky-300">
                <Star className="size-4" aria-hidden="true" />
              </div>
              <h2
                id="manage-admin-tier-title"
                className="text-xl font-semibold"
              >
                Manage admin tier
              </h2>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isWorking}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-5 px-5 py-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <AdminTierMetric label="Stripe tier" tier={user.stripeTier} />
            <AdminTierMetric
              label="Admin grant"
              tier={activeGrant?.tier ?? null}
              detail={
                activeGrant
                  ? `Expires ${formatDateTime(activeGrant.expiresAt)}`
                  : "No active grant"
              }
            />
            <AdminTierMetric label="Effective tier" tier={user.effectiveTier} />
          </dl>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <AdminFormField label="Tier">
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                  value={tier}
                  disabled={isWorking}
                  onChange={(event) =>
                    setTier(event.target.value as AdminGrantBillingTier)
                  }
                >
                  {ADMIN_GRANT_TIER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {BILLING_TIER_LABELS[option]}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Days">
                <input
                  className="no-number-spinner h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  value={days}
                  disabled={isWorking}
                  onChange={(event) => setDays(event.target.value)}
                />
              </AdminFormField>
            </div>

            {localError || error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {localError ?? error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isWorking}
                onClick={onClose}
              >
                Cancel
              </Button>
              {activeGrant ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isWorking}
                  onClick={onRevoke}
                >
                  <ShieldMinus data-icon="inline-start" />
                  {isRevoking ? "Revoking..." : "Revoke grant"}
                </Button>
              ) : null}
              <Button type="submit" disabled={isWorking}>
                <ShieldCheck data-icon="inline-start" />
                {isSaving ? "Saving..." : "Save grant"}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

function AdminTierMetric({
  detail,
  label,
  tier,
}: {
  detail?: string
  label: string
  tier: BillingTier | null
}) {
  return (
    <div className="rounded-md border border-border bg-background/35 px-3 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">
        {tier ? BILLING_TIER_LABELS[tier] : "None"}
      </dd>
      {detail ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function DeleteAdminUserModal({
  error,
  isDeleting,
  onClose,
  onConfirm,
  user,
}: {
  error: string | null
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
  user: AdminUser
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isDeleting ? undefined : onClose}
    >
      <section
        aria-labelledby="delete-user-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
                <Trash2 className="size-4" aria-hidden="true" />
              </div>
              <h2 id="delete-user-title" className="text-xl font-semibold">
                Delete user
              </h2>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              This will permanently delete {user.email}.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isDeleting}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            Their decks, simulations, runs, saved seeds, and starting hands will
            be permanently removed.
          </p>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              <Trash2 data-icon="inline-start" />
              {isDeleting ? "Deleting..." : "Delete user"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function DemoteAdminUserModal({
  currentUserId,
  error,
  isDemoting,
  onClose,
  onConfirm,
  user,
}: {
  currentUserId: string
  error: string | null
  isDemoting: boolean
  onClose: () => void
  onConfirm: () => void
  user: AdminUser
}) {
  const isCurrentUser = user.id === currentUserId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isDemoting ? undefined : onClose}
    >
      <section
        aria-labelledby="demote-user-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-400/10 text-amber-200">
                <ShieldMinus className="size-4" aria-hidden="true" />
              </div>
              <h2 id="demote-user-title" className="text-xl font-semibold">
                Demote to user
              </h2>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              This will remove admin access from {user.email}.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isDemoting}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm leading-6 text-amber-100">
            {isCurrentUser
              ? "You will lose access to the admin dashboard after this change."
              : "They will lose access to the admin dashboard and admin account controls."}
          </p>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDemoting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isDemoting}
            >
              <ShieldMinus data-icon="inline-start" />
              {isDemoting ? "Demoting..." : "Demote user"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function PromoteAdminUserModal({
  error,
  isPromoting,
  onClose,
  onConfirm,
  user,
}: {
  error: string | null
  isPromoting: boolean
  onClose: () => void
  onConfirm: () => void
  user: AdminUser
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isPromoting ? undefined : onClose}
    >
      <section
        aria-labelledby="promote-user-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-400/10 text-emerald-200">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </div>
              <h2 id="promote-user-title" className="text-xl font-semibold">
                Promote to admin
              </h2>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              This will give {user.email} full admin access.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isPromoting}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          <p className="rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm leading-6 text-emerald-100">
            Admins can view this dashboard, manage model presets, impersonate
            eligible users, and manage accounts.
          </p>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPromoting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isPromoting}>
              <ShieldCheck data-icon="inline-start" />
              {isPromoting ? "Promoting..." : "Promote user"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function BenchmarkStatusBadge({
  status,
}: {
  status: AdminBenchmark["status"]
}) {
  if (status === "completed") {
    return (
      <StatusBadge
        className="w-fit border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
        icon={<CheckCircle2 className="size-3.5" aria-hidden />}
      >
        Completed
      </StatusBadge>
    )
  }

  if (status === "stopped") {
    return (
      <StatusBadge
        className="w-fit border-amber-300/35 bg-amber-400/10 text-amber-200"
        icon={<Square className="size-3.5" aria-hidden />}
      >
        Stopped
      </StatusBadge>
    )
  }

  if (status === "failed") {
    return (
      <StatusBadge
        className="w-fit border-destructive/40 bg-destructive/10 text-destructive"
        icon={<XCircle className="size-3.5" aria-hidden />}
      >
        Failed
      </StatusBadge>
    )
  }

  return (
    <StatusBadge
      className="w-fit border-sky-300/35 bg-sky-400/10 text-sky-200"
      icon={<RefreshCw className="size-3.5" aria-hidden />}
    >
      Running
    </StatusBadge>
  )
}

function getBenchmarkPresetLabel(benchmark: AdminBenchmark) {
  const name = benchmark.llmModelPresetName?.trim()

  if (name) {
    return name
  }

  return (
    [
      benchmark.llmModelPresetProvider
        ? formatProviderLabel(benchmark.llmModelPresetProvider)
        : null,
      benchmark.llmModelPresetModel,
      benchmark.llmModelPresetOpenrouterModelProvider,
      benchmark.llmModelPresetReasoningEffort,
    ]
      .filter(Boolean)
      .join(" / ") || "Unknown preset"
  )
}

function formatBenchmarkProcessingMode(
  llmProcessingMode: LlmProcessingMode,
  useFlexServiceTier: boolean
) {
  if (llmProcessingMode === "openai_batch") {
    return "Batch"
  }

  return useFlexServiceTier ? "Realtime flex" : "Realtime"
}

function AdminFormField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  )
}

function CostInput({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean
  onChange: (value: string) => void
  value: string
}) {
  return (
    <input
      className="no-number-spinner h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-50"
      type="number"
      min="0"
      step="0.000001"
      value={value}
      placeholder="optional"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function CompactMetricList({
  items,
}: {
  items: readonly (readonly [label: string, value: string])[]
}) {
  return (
    <dl className="grid gap-0.5 text-xs text-muted-foreground">
      {items.map(([label, value]) => (
        <div
          className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-1"
          key={label}
        >
          <dt>{label}</dt>
          <dd className="min-w-0 break-words text-foreground/85">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function parseOptionalCost(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const parsedValue = Number(trimmedValue)

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null
}

function formatOptionalCost(value: number | null) {
  return value === null
    ? "n/a"
    : `$${value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "")}`
}

function formatCostInputValue(value: number | null) {
  return value === null ? "" : String(value)
}

function formatUsdCost(value: number) {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "unknown"
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function AdminCostSummary({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-foreground">
        {children}
      </dd>
    </div>
  )
}

function CostText({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-sm font-medium text-foreground">
      {children}
    </span>
  )
}

function TableHeader({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <th
      className={`overflow-hidden px-4 py-3 text-left font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  )
}

function TableCell({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <td className={`overflow-hidden px-4 py-3 align-middle ${className}`}>
      {children}
    </td>
  )
}

function AdminPanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 px-4 py-8 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function AdminUserDetail({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

function VerificationBadge({ isVerified }: { isVerified: boolean }) {
  return isVerified ? (
    <StatusBadge
      className="border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
      icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}
    >
      Verified
    </StatusBadge>
  ) : (
    <StatusBadge
      className="border-amber-300/35 bg-amber-400/10 text-amber-200"
      icon={<XCircle className="size-3.5" aria-hidden="true" />}
    >
      Unverified
    </StatusBadge>
  )
}

function RoleBadge({ role }: { role: string | null }) {
  const roleLabel = getRoleLabel(role)
  const isAdmin = isAdminRole(role)

  return (
    <StatusBadge
      className={
        isAdmin
          ? "border-sky-300/35 bg-sky-400/10 text-sky-200"
          : "border-border bg-muted/35 text-muted-foreground"
      }
      icon={<UserRound className="size-3.5" aria-hidden="true" />}
    >
      {roleLabel}
    </StatusBadge>
  )
}

function StatusBadge({
  children,
  className,
  icon,
}: {
  children: ReactNode
  className: string
  icon: ReactNode
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

function getDisplayName(user: AdminUser) {
  return user.name && user.name !== user.email ? user.name : user.id
}

function getRoleLabel(role: string | null) {
  return role?.trim() || "user"
}

function isAdminRole(role: string | null) {
  return getRoleLabel(role)
    .split(",")
    .map((rolePart) => rolePart.trim().toLowerCase())
    .includes("admin")
}

function canImpersonateUser(user: AdminUser, currentUserId: string) {
  return user.id !== currentUserId && !isAdminRole(user.role)
}

function canDemoteUser(user: AdminUser) {
  return isAdminRole(user.role)
}

function canPromoteUser(user: AdminUser, currentUserId: string) {
  return user.id !== currentUserId && !isAdminRole(user.role)
}

function getAuthClientErrorMessage(error: unknown, fallbackMessage: string) {
  if (!error || typeof error !== "object") {
    return fallbackMessage
  }

  const message = (error as Record<string, unknown>).message

  return typeof message === "string" && message.trim()
    ? message
    : fallbackMessage
}
