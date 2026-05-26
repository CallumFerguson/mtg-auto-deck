import { useState, type ReactNode } from "react"
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { LogOut, ShieldCheck } from "lucide-react"

import {
  getAdminDashboardSectionIdFromPathname,
  getDeckPageTabFromSearchParams,
  getDeckSimulationIdFromSearchParams,
} from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import { authClient, type AuthSession, type AuthUser } from "@/lib/auth-client"
import {
  AdminAccessDeniedPage,
  AdminDashboardPage,
} from "@/pages/AdminDashboardPage"
import { BillingTierProvider } from "@/lib/billing-tier-provider"
import { UsageLimitsProvider } from "@/lib/usage-limits-provider"
import { AuthPage, type AuthMode } from "@/pages/AuthPage"
import { DeckListPage } from "@/pages/DeckListPage"
import { DeckPage } from "@/pages/DeckPage"
import { PublicSimulationPage } from "@/pages/DeckSimulation"
import { SettingsPage } from "@/pages/SettingsPage"

const ADMIN_OPTIONS_ENABLED_STORAGE_KEY = "mtg-auto-deck.admin-options-enabled"

type SessionUser = {
  email: string
  emailVerified: boolean
  id: string
  name?: string | null
  role?: string | null
}

type SessionData = {
  session?: AuthSession | null
  user?: SessionUser | null
}

type ImpersonationProps = {
  impersonatedUserLabel: string
  isImpersonating: boolean
  onStopImpersonating: () => Promise<void> | void
}

type VerifiedPageProps = {
  adminOptionsEnabled: boolean
  onAdminOptionsEnabledChange: (isEnabled: boolean) => void
  onSignedOut: () => void
  user: AuthUser
} & ImpersonationProps

export function App() {
  const session = authClient.useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [adminOptionsEnabled, setAdminOptionsEnabled] = useState(
    getStoredAdminOptionsEnabled
  )
  const sessionData = (session.data ?? null) as SessionData | null
  const sessionUser = sessionData?.user ?? null
  const sessionInfo = sessionData?.session ?? null
  const user = sessionUser ? toAuthUser(sessionUser) : null
  const verifiedUserId = user?.emailVerified ? user.id : null
  const isImpersonating = Boolean(sessionInfo?.impersonatedBy)
  const impersonatedUserLabel = user ? getUserDisplayLabel(user) : "this user"
  const handleAuthenticated = async () => {
    await session.refetch()
  }
  const handleSignedOut = () => {
    void session.refetch()
  }
  const handleStopImpersonating = async () => {
    const result = await authClient.admin.stopImpersonating()

    if (result.error) {
      throw new Error(
        getAuthClientErrorMessage(
          result.error,
          "Impersonation could not be stopped."
        )
      )
    }

    await session.refetch()
  }
  const handleAdminOptionsEnabledChange = (isEnabled: boolean) => {
    setAdminOptionsEnabled(isEnabled)
    storeAdminOptionsEnabled(isEnabled)
  }
  const verifiedPageProps = user
    ? {
        adminOptionsEnabled,
        onAdminOptionsEnabledChange: handleAdminOptionsEnabledChange,
        impersonatedUserLabel,
        isImpersonating,
        onStopImpersonating: handleStopImpersonating,
        onSignedOut: handleSignedOut,
        user,
      }
    : null

  const isPublicSimulationRoute = location.pathname.startsWith(
    "/public/simulations/"
  )

  if (session.isPending && !isPublicSimulationRoute) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Loading account...
      </main>
    )
  }

  return (
    <BillingTierProvider userId={verifiedUserId}>
      <UsageLimitsProvider userId={verifiedUserId}>
        {isImpersonating && user ? (
          <ImpersonationBanner
            impersonatedUserLabel={impersonatedUserLabel}
            onStopImpersonating={handleStopImpersonating}
          />
        ) : null}

        <Routes>
          <Route
            path="/sign-in"
            element={
              <AuthRoute
                mode="sign-in"
                sessionUser={sessionUser}
                onAuthenticated={handleAuthenticated}
              />
            }
          />
          <Route
            path="/sign-up"
            element={
              <AuthRoute
                mode="sign-up"
                sessionUser={sessionUser}
                onAuthenticated={handleAuthenticated}
              />
            }
          />
          <Route
            path="/forgot-password"
            element={
              <AuthRoute
                mode="forgot-password"
                sessionUser={sessionUser}
                onAuthenticated={handleAuthenticated}
              />
            }
          />
          <Route
            path="/reset-password"
            element={
              <AuthRoute
                mode="reset-password"
                sessionUser={sessionUser}
                onAuthenticated={handleAuthenticated}
              />
            }
          />
          <Route
            path="/verify-email"
            element={
              <VerifyEmailRoute
                impersonatedUserLabel={impersonatedUserLabel}
                isImpersonating={isImpersonating}
                sessionUser={sessionUser}
                onAuthenticated={handleAuthenticated}
                onSignedOut={handleSignedOut}
                onStopImpersonating={handleStopImpersonating}
              />
            }
          />
          <Route
            path="/public/simulations/:simulationId"
            element={<PublicSimulationRoute />}
          />
          <Route
            path="/"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <DeckListPage {...verifiedPageProps} />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="/decks/:deckId"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <DeckPageRoute {...verifiedPageProps} />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <SettingsPage {...verifiedPageProps} />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <AdminDashboardRoute
                    {...verifiedPageProps}
                    onSessionChanged={async () => {
                      await session.refetch()
                      navigate("/")
                    }}
                  />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <AdminDashboardRoute
                    {...verifiedPageProps}
                    onSessionChanged={async () => {
                      await session.refetch()
                      navigate("/")
                    }}
                  />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="/admin/model-presets"
            element={
              <RequireVerifiedUser sessionUser={sessionUser}>
                {verifiedPageProps ? (
                  <AdminDashboardRoute
                    {...verifiedPageProps}
                    onSessionChanged={async () => {
                      await session.refetch()
                      navigate("/")
                    }}
                  />
                ) : null}
              </RequireVerifiedUser>
            }
          />
          <Route
            path="*"
            element={<UnknownRoute sessionUser={sessionUser} />}
          />
        </Routes>
      </UsageLimitsProvider>
    </BillingTierProvider>
  )
}

function PublicSimulationRoute() {
  const { simulationId } = useParams()

  if (!simulationId) {
    return <Navigate to="/" replace />
  }

  return <PublicSimulationPage simulationId={simulationId} />
}

function AuthRoute({
  mode,
  onAuthenticated,
  sessionUser,
}: {
  mode: AuthMode
  onAuthenticated: () => Promise<void> | void
  sessionUser: SessionUser | null
}) {
  const location = useLocation()

  if (sessionUser?.emailVerified) {
    return <Navigate to="/" replace />
  }

  if (sessionUser) {
    return <Navigate to="/verify-email" replace />
  }

  return (
    <AuthPage
      key={`${mode}:${location.search}`}
      initialMode={mode}
      onAuthenticated={onAuthenticated}
    />
  )
}

function VerifyEmailRoute({
  impersonatedUserLabel,
  isImpersonating,
  onAuthenticated,
  onSignedOut,
  onStopImpersonating,
  sessionUser,
}: {
  impersonatedUserLabel: string
  isImpersonating: boolean
  onAuthenticated: () => Promise<void> | void
  onSignedOut: () => Promise<void> | void
  onStopImpersonating: () => Promise<void> | void
  sessionUser: SessionUser | null
}) {
  const location = useLocation()
  const routeState = getVerifyEmailRouteState(location.state)

  if (sessionUser?.emailVerified) {
    return <Navigate to="/" replace />
  }

  if (!sessionUser && !routeState.verificationEmail) {
    return <Navigate to="/sign-in" replace />
  }

  const initialEmail = sessionUser?.email ?? routeState.verificationEmail

  return (
    <AuthPage
      key={`verify-email:${initialEmail}`}
      initialEmail={initialEmail}
      initialMode="verify-email"
      initialNotice={
        routeState.notice ?? "Enter the verification code we emailed you."
      }
      impersonatedUserLabel={impersonatedUserLabel}
      isVerificationWall={Boolean(sessionUser)}
      isImpersonating={isImpersonating}
      onAuthenticated={onAuthenticated}
      onSignedOut={onSignedOut}
      onStopImpersonating={onStopImpersonating}
    />
  )
}

function RequireVerifiedUser({
  children,
  sessionUser,
}: {
  children: ReactNode
  sessionUser: SessionUser | null
}) {
  if (!sessionUser) {
    return <Navigate to="/sign-in" replace />
  }

  if (!sessionUser.emailVerified) {
    return <Navigate to="/verify-email" replace />
  }

  return <>{children}</>
}

function UnknownRoute({ sessionUser }: { sessionUser: SessionUser | null }) {
  if (!sessionUser) {
    return <Navigate to="/sign-in" replace />
  }

  if (!sessionUser.emailVerified) {
    return <Navigate to="/verify-email" replace />
  }

  return <Navigate to="/" replace />
}

function DeckPageRoute({
  adminOptionsEnabled,
  isImpersonating,
  onAdminOptionsEnabledChange,
  onSignedOut,
  onStopImpersonating,
  user,
}: VerifiedPageProps) {
  const { deckId } = useParams()
  const [searchParams] = useSearchParams()

  if (!deckId) {
    return <Navigate to="/" replace />
  }

  return (
    <DeckPage
      adminOptionsEnabled={adminOptionsEnabled}
      deckId={deckId}
      isImpersonating={isImpersonating}
      initialTab={getDeckPageTabFromSearchParams(searchParams)}
      initialSimulationId={getDeckSimulationIdFromSearchParams(searchParams)}
      onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
      onSignedOut={onSignedOut}
      onStopImpersonating={onStopImpersonating}
      user={user}
    />
  )
}

function AdminDashboardRoute({
  adminOptionsEnabled,
  isImpersonating,
  onAdminOptionsEnabledChange,
  onSessionChanged,
  onSignedOut,
  onStopImpersonating,
  user,
}: VerifiedPageProps & {
  onSessionChanged: () => Promise<void> | void
}) {
  const location = useLocation()

  if (user.role !== "admin") {
    return (
      <AdminAccessDeniedPage
        adminOptionsEnabled={adminOptionsEnabled}
        isImpersonating={isImpersonating}
        onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
        onStopImpersonating={onStopImpersonating}
        user={user}
        onSignedOut={onSignedOut}
      />
    )
  }

  return (
    <AdminDashboardPage
      activeSectionId={getAdminDashboardSectionIdFromPathname(
        location.pathname
      )}
      adminOptionsEnabled={adminOptionsEnabled}
      isImpersonating={isImpersonating}
      onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
      onSessionChanged={onSessionChanged}
      onStopImpersonating={onStopImpersonating}
      user={user}
      onSignedOut={onSignedOut}
    />
  )
}

function getVerifyEmailRouteState(state: unknown) {
  if (!state || typeof state !== "object") {
    return {
      notice: null,
      verificationEmail: "",
    }
  }

  const record = state as Record<string, unknown>
  const notice = typeof record.notice === "string" ? record.notice.trim() : ""
  const verificationEmail =
    typeof record.verificationEmail === "string"
      ? record.verificationEmail.trim()
      : ""

  return {
    notice: notice || null,
    verificationEmail,
  }
}

function getStoredAdminOptionsEnabled() {
  try {
    return (
      window.localStorage.getItem(ADMIN_OPTIONS_ENABLED_STORAGE_KEY) !== "false"
    )
  } catch {
    return true
  }
}

function storeAdminOptionsEnabled(isEnabled: boolean) {
  try {
    window.localStorage.setItem(
      ADMIN_OPTIONS_ENABLED_STORAGE_KEY,
      String(isEnabled)
    )
  } catch {
    // Local storage is only a convenience for this display preference.
  }
}

function toAuthUser(user: SessionUser) {
  return {
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    name: user.name ?? "",
    role: user.role ?? null,
  } satisfies AuthUser
}

function getUserDisplayLabel(user: AuthUser) {
  return user.name && user.name !== user.email ? user.name : user.email
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

function ImpersonationBanner({
  impersonatedUserLabel,
  onStopImpersonating,
}: {
  impersonatedUserLabel: string
  onStopImpersonating: () => Promise<void> | void
}) {
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  async function handleStopImpersonating() {
    setIsRestoring(true)
    setRestoreError(null)

    try {
      await onStopImpersonating()
    } catch (error) {
      setRestoreError(
        error instanceof Error
          ? error.message
          : "Impersonation could not be stopped."
      )
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="sticky top-0 z-50 border-b border-sky-300/25 bg-slate-950/95 px-4 py-2 text-sky-50 shadow-2xl shadow-black/30 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-sky-300" aria-hidden />
          <p className="min-w-0 text-sm">
            <span className="text-sky-200">Impersonating </span>
            <span className="font-medium break-words">
              {impersonatedUserLabel}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit border-sky-300/35 bg-sky-400/10 text-sky-50 hover:bg-sky-400/20"
          disabled={isRestoring}
          onClick={() => void handleStopImpersonating()}
        >
          <LogOut data-icon="inline-start" />
          {isRestoring ? "Restoring..." : "Stop impersonating"}
        </Button>
      </div>
      {restoreError ? (
        <p
          className="mx-auto mt-2 w-full max-w-7xl text-sm text-destructive"
          role="alert"
        >
          {restoreError}
        </p>
      ) : null}
    </div>
  )
}

export default App
