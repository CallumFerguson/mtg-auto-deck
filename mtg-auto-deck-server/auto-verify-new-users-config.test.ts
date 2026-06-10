import assert from "node:assert/strict"
import test from "node:test"
import {
  AUTO_VERIFY_NEW_USERS_ENVIRONMENT_VARIABLE,
  createAutoVerifyNewUsersDatabaseHooks,
  getAutoVerifyNewUsersEnabled,
} from "./auto-verify-new-users-config.js"

test("auto-verify new users is disabled by default", () => {
  assert.equal(getAutoVerifyNewUsersEnabled({}), false)
})

test("auto-verify new users accepts explicit enabled values", () => {
  for (const value of ["true", "1", "yes", " TRUE ", "Yes"]) {
    assert.equal(
      getAutoVerifyNewUsersEnabled({
        [AUTO_VERIFY_NEW_USERS_ENVIRONMENT_VARIABLE]: value,
      }),
      true,
      value
    )
  }
})

test("auto-verify new users leaves all other values disabled", () => {
  for (const value of ["false", "0", "no", "off", "enabled", ""]) {
    assert.equal(
      getAutoVerifyNewUsersEnabled({
        [AUTO_VERIFY_NEW_USERS_ENVIRONMENT_VARIABLE]: value,
      }),
      false,
      value
    )
  }
})

test("auto-verify user create hook returns no override when disabled", async () => {
  const hooks = createAutoVerifyNewUsersDatabaseHooks(false)
  const result = await hooks.user?.create?.before?.(
    {
      email: "player@example.com",
      emailVerified: false,
      id: "user-id",
      name: "player@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    null
  )

  assert.equal(result, undefined)
})

test("auto-verify user create hook marks new users verified when enabled", async () => {
  const hooks = createAutoVerifyNewUsersDatabaseHooks(true)
  const result = await hooks.user?.create?.before?.(
    {
      email: "player@example.com",
      emailVerified: false,
      id: "user-id",
      name: "player@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    null
  )

  assert.deepEqual(result, {
    data: {
      emailVerified: true,
    },
  })
})
