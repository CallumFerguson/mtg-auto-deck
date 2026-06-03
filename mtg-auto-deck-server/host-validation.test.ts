import assert from "node:assert/strict"
import test from "node:test"
import {
  buildAllowedHostnames,
  SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE,
} from "./host-validation.js"

test("builds the legacy host allowlist when no extra hostnames are configured", () => {
  assert.deepEqual(
    buildAllowedHostnames({
      betterAuthUrl: "https://api.example.com",
    }),
    ["localhost", "127.0.0.1", "[::1]", "api.example.com"]
  )
})

test("adds configured server hostnames", () => {
  assert.deepEqual(
    buildAllowedHostnames({
      betterAuthUrl: "https://api.example.com",
      serverAllowedHostnames: "dev-api.mtgautodeck.com",
    }),
    [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "api.example.com",
      "dev-api.mtgautodeck.com",
    ]
  )
})

test("trims, normalizes, ignores empty segments, and dedupes hostnames", () => {
  assert.deepEqual(
    buildAllowedHostnames({
      betterAuthUrl: "https://API.EXAMPLE.COM",
      serverAllowedHostnames:
        " dev-api.mtgautodeck.com, api.example.com, , DEV-API.MTGAUTODECK.COM ",
    }),
    [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "api.example.com",
      "dev-api.mtgautodeck.com",
    ]
  )
})

test("rejects malformed configured hostnames with a clear env var name", () => {
  assert.throws(
    () =>
      buildAllowedHostnames({
        betterAuthUrl: "https://api.example.com",
        serverAllowedHostnames: "https://dev-api.mtgautodeck.com",
      }),
    {
      message: new RegExp(SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE),
    }
  )

  assert.throws(
    () =>
      buildAllowedHostnames({
        betterAuthUrl: "https://api.example.com",
        serverAllowedHostnames: "*.mtgautodeck.com",
      }),
    {
      message: new RegExp(SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE),
    }
  )
})
