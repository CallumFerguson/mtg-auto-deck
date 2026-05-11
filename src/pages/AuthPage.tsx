import { useState, type FormEvent } from "react"
import { KeyRound, LogIn, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { navigateTo } from "@/lib/navigation"

export type AuthMode =
  | "forgot-password"
  | "reset-password"
  | "sign-in"
  | "sign-up"

export function AuthPage({
  initialMode = "sign-in",
  onAuthenticated,
}: {
  initialMode?: AuthMode
  onAuthenticated: () => Promise<void> | void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [error, setError] = useState<string | null>(getInitialError())
  const [notice, setNotice] = useState<string | null>(getInitialNotice())
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email,
          password,
          rememberMe: true,
        })

        if (result.error) {
          setError(getAuthErrorMessage(result.error, "Sign in failed."))
          return
        }

        const session = await waitForSession()

        if (!session) {
          setError(
            "Sign in worked, but the browser did not keep the session cookie. Open the app using the same host as APP_PUBLIC_URL, then try again."
          )
          return
        }

        await onAuthenticated()
        return
      }

      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: email,
          email,
          password,
        })

        if (result.error) {
          setError(
            getAuthErrorMessage(result.error, "Account could not be created.")
          )
          return
        }

        const session = await waitForSession()

        if (!session) {
          setError(
            "Account created, but the browser did not keep the session cookie. Open the app using the same host as APP_PUBLIC_URL, then sign in."
          )
          setMode("sign-in")
          return
        }

        await onAuthenticated()
        return
      }

      if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        })

        if (result.error) {
          setError(
            getAuthErrorMessage(result.error, "Reset email could not be sent.")
          )
          return
        }

        setNotice("If that account exists, a reset link has been sent.")
        return
      }

      const token = new URLSearchParams(window.location.search).get("token")

      if (!token) {
        setError("Password reset token is missing or invalid.")
        return
      }

      const result = await authClient.resetPassword({
        token,
        newPassword: password,
      })

      if (result.error) {
        setError(
          getAuthErrorMessage(result.error, "Password could not be reset.")
        )
        return
      }

      setMode("sign-in")
      navigateTo("/sign-in?reset=success")
    } catch {
      setError("Authentication request failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isSignIn = mode === "sign-in"
  const isSignUp = mode === "sign-up"
  const isForgotPassword = mode === "forgot-password"
  const isResetPassword = mode === "reset-password"

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card/80 shadow-2xl shadow-black/40">
        <header className="border-b border-border px-6 py-5">
          <p className="text-sm font-medium tracking-[0.18em] text-sky-300 uppercase">
            MTG Auto Deck
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {isSignIn
              ? "Sign in"
              : isSignUp
                ? "Create account"
                : isForgotPassword
                  ? "Reset password"
                  : "Choose a new password"}
          </h1>
        </header>

        <form className="grid gap-4 px-6 py-6" onSubmit={handleSubmit}>
          {!isResetPassword ? (
            <label className="grid gap-2 text-sm font-medium">
              <span>Email</span>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
                name="email"
                type="email"
                autoComplete="email"
                disabled={isSubmitting}
              />
            </label>
          ) : null}

          {!isForgotPassword ? (
            <label className="grid gap-2 text-sm font-medium">
              <span>{isResetPassword ? "New password" : "Password"}</span>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/25"
                name="password"
                type="password"
                autoComplete={isSignIn ? "current-password" : "new-password"}
                disabled={isSubmitting}
              />
            </label>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              className="rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSignIn ? (
              <LogIn data-icon="inline-start" />
            ) : isSignUp ? (
              <UserPlus data-icon="inline-start" />
            ) : (
              <KeyRound data-icon="inline-start" />
            )}
            {isSubmitting
              ? "Working..."
              : isSignIn
                ? "Sign in"
                : isSignUp
                  ? "Create account"
                  : isForgotPassword
                    ? "Send reset link"
                    : "Reset password"}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
            <button
              className="text-sky-300 transition hover:text-sky-200 focus:ring-2 focus:ring-ring/40 focus:outline-none"
              type="button"
              onClick={() => {
                setError(null)
                setNotice(null)
                setMode(isSignIn ? "sign-up" : "sign-in")
              }}
            >
              {isSignIn ? "Create account" : "Sign in"}
            </button>
            {!isResetPassword ? (
              <button
                className="text-muted-foreground transition hover:text-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
                type="button"
                onClick={() => {
                  setError(null)
                  setNotice(null)
                  setMode(isForgotPassword ? "sign-in" : "forgot-password")
                }}
              >
                {isForgotPassword ? "Back to sign in" : "Forgot password"}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  )
}

function getInitialError() {
  const error = new URLSearchParams(window.location.search).get("error")

  return error ? "Password reset link is invalid or expired." : null
}

function getInitialNotice() {
  const reset = new URLSearchParams(window.location.search).get("reset")

  return reset === "success"
    ? "Password reset. Sign in with your new password."
    : null
}

function getAuthErrorMessage(error: unknown, fallbackMessage: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message
  }

  return fallbackMessage
}

async function waitForSession() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await authClient.getSession()

    if (session.data) {
      return session.data
    }

    await new Promise((resolve) => window.setTimeout(resolve, 150))
  }

  return null
}
