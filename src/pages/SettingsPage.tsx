import { useState, type FormEvent } from "react"
import { ArrowLeft, KeyRound, LogOut, Mail, Settings, X } from "lucide-react"

import { AccountMenu } from "@/components/AccountMenu"
import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { authClient, type AuthUser } from "@/lib/auth-client"
import { navigateTo } from "@/lib/navigation"
import { getPasswordRangeError } from "@/lib/password-validation"

type SettingsPageProps = {
  adminOptionsEnabled: boolean
  onAdminOptionsEnabledChange: (isEnabled: boolean) => void
  onSignedOut: () => void
  user: AuthUser
}

type ChangePasswordStep = "current-password" | "new-password"

export function SettingsPage({
  adminOptionsEnabled,
  onAdminOptionsEnabledChange,
  onSignedOut,
  user,
}: SettingsPageProps) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      await authClient.signOut()
      onSignedOut()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="default"
              className="w-fit"
              onClick={() => navigateTo("/")}
            >
              <ArrowLeft data-icon="inline-start" />
              Decks
            </Button>
            <div className="space-y-1">
              <p className="text-sm font-medium text-sky-300">MTG Auto Deck</p>
              <div className="flex items-center gap-2">
                <Settings className="size-6 text-sky-300" aria-hidden />
                <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Settings
                </h1>
              </div>
            </div>
          </div>

          <AccountMenu
            adminOptionsEnabled={adminOptionsEnabled}
            onAdminOptionsEnabledChange={onAdminOptionsEnabledChange}
            onSignedOut={onSignedOut}
            user={user}
          />
        </header>

        <div className="grid gap-4">
          <section
            className="overflow-hidden rounded-lg border border-border bg-card/55 shadow-2xl shadow-black/20"
            aria-label="Account settings"
          >
            <div className="flex items-start gap-4 border-b border-border px-5 py-5">
              <Mail
                className="mt-1 size-6 shrink-0 text-foreground"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Email</p>
                <p className="mt-1 text-xs break-all text-sky-100">
                  {user.email}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <KeyRound
                  className="mt-1 size-6 shrink-0 text-foreground"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Password
                  </p>
                  <PasswordDots />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-fit sm:self-center"
                onClick={() => {
                  setPasswordNotice(null)
                  setIsChangePasswordOpen(true)
                }}
              >
                Change password
              </Button>
            </div>
          </section>

          {passwordNotice ? (
            <p
              className="rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100"
              role="status"
            >
              {passwordNotice}
            </p>
          ) : null}

          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
            >
              <LogOut data-icon="inline-start" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>
      </div>

      {isChangePasswordOpen ? (
        <ChangePasswordModal
          onClose={() => setIsChangePasswordOpen(false)}
          onPasswordChanged={() => {
            setIsChangePasswordOpen(false)
            setPasswordNotice("Password changed.")
          }}
        />
      ) : null}
    </main>
  )
}

function PasswordDots() {
  return (
    <div
      className="mt-2 flex h-3 items-center gap-0.5"
      aria-label="Saved password"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className="size-1 rounded-full bg-sky-100"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function ChangePasswordModal({
  onClose,
  onPasswordChanged,
}: {
  onClose: () => void
  onPasswordChanged: () => void
}) {
  const [step, setStep] = useState<ChangePasswordStep>("current-password")
  const [verifiedCurrentPassword, setVerifiedCurrentPassword] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isBusy = isVerifying || isSaving

  async function handleCurrentPasswordSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!currentPassword) {
      setError("Current password is required.")
      return
    }

    setError(null)
    setIsVerifying(true)

    try {
      const result = await verifyCurrentPassword(currentPassword)

      if (result.error) {
        setError(result.error)
        return
      }

      setVerifiedCurrentPassword(currentPassword)
      setCurrentPassword("")
      setStep("new-password")
    } catch {
      setError("Current password could not be verified.")
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleNewPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let shouldCloseAfterSave = false

    const passwordError = getPasswordRangeError(newPassword, "New password")

    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.")
      return
    }

    if (!verifiedCurrentPassword) {
      resetPasswordFlow()
      setError("Current password must be verified again.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const result = await authClient.changePassword({
        currentPassword: verifiedCurrentPassword,
        newPassword,
        revokeOtherSessions: true,
      })

      if (result.error) {
        const message = getAuthErrorMessage(
          result.error,
          "Password could not be changed."
        )

        if (isInvalidPasswordError(result.error)) {
          resetPasswordFlow()
        }

        setError(message)
        return
      }

      resetPasswordFlow()
      shouldCloseAfterSave = true
    } catch {
      setError("Password could not be changed.")
    } finally {
      setIsSaving(false)
    }

    if (shouldCloseAfterSave) {
      onPasswordChanged()
    }
  }

  function resetPasswordFlow() {
    setStep("current-password")
    setVerifiedCurrentPassword("")
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setError(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isBusy ? undefined : onClose}
    >
      <section
        aria-labelledby="change-password-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/30 bg-sky-400/10 text-sky-300">
              <KeyRound className="size-4" aria-hidden />
            </div>
            <h2
              id="change-password-title"
              className="truncate text-xl font-semibold"
            >
              Change password
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isBusy}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-5 px-5 py-5">
          {step === "current-password" ? (
            <form className="grid gap-4" onSubmit={handleCurrentPasswordSubmit}>
              <label className="grid gap-2 text-sm font-medium">
                <span>Current password</span>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={isVerifying}
                />
              </label>

              <ErrorMessage error={error} />

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isVerifying}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isVerifying}>
                  {isVerifying ? "Verifying..." : "Continue"}
                </Button>
              </div>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={handleNewPasswordSubmit}>
              <label className="grid gap-2 text-sm font-medium">
                <span>New password</span>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={isSaving}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>Confirm new password</span>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSaving}
                />
              </label>

              <ErrorMessage error={error} />

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save password"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? (
    <p
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {error}
    </p>
  ) : null
}

async function verifyCurrentPassword(password: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/verify-password`, {
    body: JSON.stringify({ password }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  if (response.ok) {
    return { error: null }
  }

  return {
    error: await getApiErrorMessage(
      response,
      "Current password could not be verified."
    ),
  }
}

async function getApiErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as unknown
    const message = getStringErrorProperty(body, "message")

    return message?.trim() ? message : fallbackMessage
  } catch {
    return fallbackMessage
  }
}

function getAuthErrorMessage(error: unknown, fallbackMessage: string) {
  const message = getStringErrorProperty(error, "message")

  return message?.trim() ? message : fallbackMessage
}

function isInvalidPasswordError(error: unknown) {
  const code = getStringErrorProperty(error, "code")
  const message = getStringErrorProperty(error, "message")

  return (
    code === "INVALID_PASSWORD" ||
    message?.toLowerCase().includes("invalid password") === true ||
    message?.toLowerCase().includes("current password") === true
  )
}

function getStringErrorProperty(error: unknown, property: string) {
  if (error && typeof error === "object") {
    const value = (error as Record<string, unknown>)[property]

    if (typeof value === "string") {
      return value
    }
  }

  return null
}
