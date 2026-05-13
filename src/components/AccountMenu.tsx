import { useState } from "react"
import {
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { SignOutConfirmModal } from "@/components/SignOutConfirmModal"
import { authClient, type AuthUser } from "@/lib/auth-client"

export function AccountMenu({
  adminOptionsEnabled,
  onAdminOptionsEnabledChange,
  onSignedOut,
  user,
}: {
  adminOptionsEnabled: boolean
  onAdminOptionsEnabledChange: (isEnabled: boolean) => void
  onSignedOut: () => void
  user: AuthUser
}) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const accountLabel =
    user.name && user.name !== user.email ? user.name : "MTG Auto Deck"

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      await authClient.signOut()
      onSignedOut()
      setIsSignOutConfirmOpen(false)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Account menu for ${user.email}`}
        aria-expanded={isOpen}
        title={user.email}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <UserRound />
      </Button>

      {isOpen ? (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            type="button"
            aria-label="Close account menu"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-11 right-0 z-20 w-64 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-2xl shadow-black/40">
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="truncate text-xs text-muted-foreground">
                {accountLabel}
              </p>
            </div>
            {user.role === "admin" ? (
              <div className="border-b border-border py-1">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/45 hover:text-foreground focus:bg-muted/45 focus:outline-none"
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    navigate("/admin")
                  }}
                >
                  <LayoutDashboard data-icon="inline-start" />
                  Admin dashboard
                </button>
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ShieldCheck
                        className="size-4 shrink-0 text-sky-300"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          Admin options
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {adminOptionsEnabled ? "Visible" : "Hidden"}
                        </p>
                      </div>
                    </div>
                    <button
                      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:ring-3 focus:ring-ring/25 focus:outline-none ${
                        adminOptionsEnabled
                          ? "border-sky-300/70 bg-sky-500/70"
                          : "border-border bg-muted/55"
                      }`}
                      type="button"
                      role="switch"
                      aria-checked={adminOptionsEnabled}
                      aria-label="Show admin options"
                      title="Show admin options"
                      onClick={() =>
                        onAdminOptionsEnabledChange(!adminOptionsEnabled)
                      }
                    >
                      <span
                        className={`absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm shadow-black/30 transition-transform ${
                          adminOptionsEnabled
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/45 hover:text-foreground focus:bg-muted/45 focus:outline-none"
              type="button"
              onClick={() => {
                setIsOpen(false)
                navigate("/settings")
              }}
            >
              <Settings data-icon="inline-start" />
              Settings
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              onClick={() => {
                setIsOpen(false)
                setIsSignOutConfirmOpen(true)
              }}
              disabled={isSigningOut}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </button>
          </div>
        </>
      ) : null}
      {isSignOutConfirmOpen ? (
        <SignOutConfirmModal
          isSigningOut={isSigningOut}
          onClose={() => setIsSignOutConfirmOpen(false)}
          onConfirm={() => void handleSignOut()}
        />
      ) : null}
    </div>
  )
}
