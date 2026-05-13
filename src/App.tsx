import { useState, type ReactNode } from "react"
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom"

import {
  getAdminDashboardSectionIdFromPathname,
  getDeckPageTabFromSearchParams,
  getDeckSimulationIdFromSearchParams,
} from "@/lib/navigation"
import { authClient, type AuthUser } from "@/lib/auth-client"
import {
  AdminAccessDeniedPage,
  AdminDashboardPage,
} from "@/pages/AdminDashboardPage"
import { AuthPage, type AuthMode } from "@/pages/AuthPage"
import { DeckListPage } from "@/pages/DeckListPage"
import { DeckPage } from "@/pages/DeckPage"
import { SettingsPage } from "@/pages/SettingsPage"

const ADMIN_OPTIONS_ENABLED_STORAGE_KEY = "mtg-auto-deck.admin-options-enabled"

type SessionUser = {
  email: string
  emailVerified: boolean
  id: string
  name?: string | null
  role?: string | null
}

type VerifiedPageProps = {
  adminOptionsEnabled: boolean
  onAdminOptionsEnabledChange: (isEnabled: boolean) => void
  onSignedOut: () => void
  user: AuthUser
}

export function App() {
  const session = authClient.useSession()
  const [adminOptionsEnabled, setAdminOptionsEnabled] = useState(
    getStoredAdminOptionsEnabled
  )
  const sessionUser = session.data?.user ?? null
  const user = sessionUser ? toAuthUser(sessionUser) : null
  const handleAuthenticated = async () => {
    await session.refetch()
  }
  const handleSignedOut = () => {
    void session.refetch()
  }
  const handleAdminOptionsEnabledChange = (isEnabled: boolean) => {
    setAdminOptionsEnabled(isEnabled)
    storeAdminOptionsEnabled(isEnabled)
  }
  const verifiedPageProps = user
    ? {
        adminOptionsEnabled,
        onAdminOptionsEnabledChange: handleAdminOptionsEnabledChange,
        onSignedOut: handleSignedOut,
        user,
      }
    : null

  if (session.isPending) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Loading account...
      </main>
    )
  }

  return (
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
            sessionUser={sessionUser}
            onAuthenticated={handleAuthenticated}
            onSignedOut={handleSignedOut}
          />
        }
      />
      <Route
        path="/"
        element={
          <RequireVerifiedUser sessionUser={sessionUser}>
            {verifiedPageProps ? <DeckListPage {...verifiedPageProps} /> : null}
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
            {verifiedPageProps ? <SettingsPage {...verifiedPageProps} /> : null}
          </RequireVerifiedUser>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireVerifiedUser sessionUser={sessionUser}>
            {verifiedPageProps ? (
              <AdminDashboardRoute {...verifiedPageProps} />
            ) : null}
          </RequireVerifiedUser>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireVerifiedUser sessionUser={sessionUser}>
            {verifiedPageProps ? (
              <AdminDashboardRoute {...verifiedPageProps} />
            ) : null}
          </RequireVerifiedUser>
        }
      />
      <Route path="*" element={<UnknownRoute sessionUser={sessionUser} />} />
    </Routes>
  )
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
  onAuthenticated,
  onSignedOut,
  sessionUser,
}: {
  onAuthenticated: () => Promise<void> | void
  onSignedOut: () => Promise<void> | void
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
      isVerificationWall={Boolean(sessionUser)}
      onAuthenticated={onAuthenticated}
      onSignedOut={onSignedOut}
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
  onAdminOptionsEnabledChange,
  onSignedOut,
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
      initialTab={getDeckPageTabFromSearchParams(searchParams)}
      initialSimulationId={getDeckSimulationIdFromSearchParams(searchParams)}
      onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
      user={user}
      onSignedOut={onSignedOut}
    />
  )
}

function AdminDashboardRoute({
  adminOptionsEnabled,
  onAdminOptionsEnabledChange,
  onSignedOut,
  user,
}: VerifiedPageProps) {
  const location = useLocation()

  if (user.role !== "admin") {
    return (
      <AdminAccessDeniedPage
        adminOptionsEnabled={adminOptionsEnabled}
        onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
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
      onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
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

export default App
