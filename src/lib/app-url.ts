export const APP_PUBLIC_URL = getAppPublicUrl()

function getAppPublicUrl() {
  const configuredAppPublicUrl = import.meta.env.VITE_APP_PUBLIC_URL

  if (configuredAppPublicUrl) {
    return stripTrailingSlashes(configuredAppPublicUrl)
  }

  if (import.meta.env.DEV) {
    return window.location.origin
  }

  throw new Error("Missing VITE_APP_PUBLIC_URL for production builds.")
}

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "")
}
