import type { BetterAuthOptions } from "better-auth"

export const AUTO_VERIFY_NEW_USERS_ENVIRONMENT_VARIABLE =
  "AUTO_VERIFY_NEW_USERS"

type Environment = Record<string, string | undefined>

const AUTO_VERIFY_NEW_USERS_ENABLED_VALUES = new Set(["true", "1", "yes"])

export function getAutoVerifyNewUsersEnabled(
  environment: Environment = process.env
) {
  const value = environment[AUTO_VERIFY_NEW_USERS_ENVIRONMENT_VARIABLE]
    ?.trim()
    .toLowerCase()

  return Boolean(value && AUTO_VERIFY_NEW_USERS_ENABLED_VALUES.has(value))
}

export function createAutoVerifyNewUsersDatabaseHooks(
  autoVerifyNewUsersEnabled: boolean
): NonNullable<BetterAuthOptions["databaseHooks"]> {
  return {
    user: {
      create: {
        before: async () => {
          if (!autoVerifyNewUsersEnabled) {
            return
          }

          return {
            data: {
              emailVerified: true,
            },
          }
        },
      },
    },
  }
}
