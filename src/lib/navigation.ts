export function navigateTo(pathname: string) {
  window.history.pushState(null, "", pathname)
  window.dispatchEvent(new Event("app:navigate"))
}

export function getDeckIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/decks\/([^/]+)$/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}
