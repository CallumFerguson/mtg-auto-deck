import { useEffect, useState } from "react"

import { getDeckIdFromPathname } from "@/lib/navigation"
import { DeckListPage } from "@/pages/DeckListPage"
import { DeckPage } from "@/pages/DeckPage"

export function App() {
  const pathname = usePathname()
  const deckId = getDeckIdFromPathname(pathname)

  return deckId ? <DeckPage deckId={deckId} /> : <DeckListPage />
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    function handleLocationChange() {
      setPathname(window.location.pathname)
    }

    window.addEventListener("popstate", handleLocationChange)
    window.addEventListener("app:navigate", handleLocationChange)

    return () => {
      window.removeEventListener("popstate", handleLocationChange)
      window.removeEventListener("app:navigate", handleLocationChange)
    }
  }, [])

  return pathname
}

export default App
