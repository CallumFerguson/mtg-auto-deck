export const API_BASE_URL = getApiBaseUrl()

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: "include",
  })
}

function getApiBaseUrl() {
  if (typeof window !== "undefined" && isLoopbackHost(window.location.hostname)) {
    return `http://${window.location.hostname}:3001`
  }

  return "http://127.0.0.1:3001"
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1"
}
