export async function loadApiHelpers() {
  const [{ API_BASE_URL, apiFetch }, { readApiError }] = await Promise.all([
    import("@/lib/api"),
    import("@/lib/api-error"),
  ])

  return {
    API_BASE_URL,
    apiFetch,
    readApiError,
  }
}
