import { useEffect, useState } from "react"

import {
  getDeckIdFromPathname,
  getDeckPageTabFromSearch,
} from "@/lib/navigation"
import { DeckListPage } from "@/pages/DeckListPage"
import { DeckPage } from "@/pages/DeckPage"

export function App() {
  const location = useLocation()
  const deckId = getDeckIdFromPathname(location.pathname)

  return deckId ? (
    <DeckPage
      deckId={deckId}
      initialTab={getDeckPageTabFromSearch(location.search)}
    />
  ) : (
    <DeckListPage />
  )
}

function useLocation() {
  const [location, setLocation] = useState({
    pathname: window.location.pathname,
    search: window.location.search,
  })

  useEffect(() => {
    function handleLocationChange() {
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }

    window.addEventListener("popstate", handleLocationChange)
    window.addEventListener("app:navigate", handleLocationChange)

    return () => {
      window.removeEventListener("popstate", handleLocationChange)
      window.removeEventListener("app:navigate", handleLocationChange)
    }
  }, [])

  return location
}

export default App
