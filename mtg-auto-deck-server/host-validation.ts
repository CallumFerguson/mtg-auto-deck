export const SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE =
  "SERVER_ALLOWED_HOSTNAMES"

export const LOOPBACK_ALLOWED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "[::1]",
]

type AllowedHostnamesInput = {
  betterAuthUrl: string
  serverAllowedHostnames?: string
}

export function buildAllowedHostnames({
  betterAuthUrl,
  serverAllowedHostnames,
}: AllowedHostnamesInput) {
  return Array.from(
    new Set([
      ...LOOPBACK_ALLOWED_HOSTNAMES,
      getHostnameFromUrl(betterAuthUrl, "BETTER_AUTH_URL"),
      ...parseServerAllowedHostnames(serverAllowedHostnames),
    ])
  )
}

export function getHostnameFromUrl(url: string, environmentVariable: string) {
  try {
    return new URL(url.trim()).hostname
  } catch {
    throw new Error(
      `${environmentVariable} must be a valid absolute URL for host validation.`
    )
  }
}

function parseServerAllowedHostnames(value: string | undefined) {
  if (!value?.trim()) {
    return []
  }

  return value
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean)
    .map(parseServerAllowedHostname)
}

function parseServerAllowedHostname(hostname: string) {
  if (hostname.includes("*")) {
    throw new Error(
      `${SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE} must contain exact hostnames without wildcards.`
    )
  }

  let parsedHostname: URL

  try {
    parsedHostname = new URL(`http://${hostname}`)
  } catch {
    throw createServerAllowedHostnamesError()
  }

  if (
    parsedHostname.port ||
    parsedHostname.pathname !== "/" ||
    parsedHostname.search ||
    parsedHostname.hash ||
    parsedHostname.username ||
    parsedHostname.password ||
    !parsedHostname.hostname
  ) {
    throw createServerAllowedHostnamesError()
  }

  return parsedHostname.hostname
}

function createServerAllowedHostnamesError() {
  return new Error(
    `${SERVER_ALLOWED_HOSTNAMES_ENVIRONMENT_VARIABLE} must contain a comma-separated list of valid hostnames without schemes, ports, paths, or wildcards.`
  )
}
