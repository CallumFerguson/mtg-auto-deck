import { useEffect, type ReactNode } from "react"

type ThemeProviderProps = {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("dark")
  }, [])

  return <>{children}</>
}
