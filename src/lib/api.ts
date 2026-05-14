export const API_BASE_URL = getApiBaseUrl()

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: "include",
  })
}

function getApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL

  if (configuredApiBaseUrl) {
    return stripTrailingSlash(configuredApiBaseUrl)
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3001"
  }

  throw new Error("Missing VITE_API_BASE_URL for production builds.")
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "")
}
