import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "mana-font/css/mana.css"
import "./index.css"
import { ModalInteractionLock } from "@/components/ModalInteractionLock.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

const root = createRoot(document.getElementById("root")!)

if (
  window.location.pathname.startsWith("/public/simulations/") ||
  window.location.pathname.startsWith("/public/benchmarks/")
) {
  const { PublicSimulationApp } = await import("./PublicSimulationApp.tsx")

  root.render(
    <StrictMode>
      <ThemeProvider>
        <ModalInteractionLock />
        <PublicSimulationApp />
      </ThemeProvider>
    </StrictMode>
  )
} else {
  const { default: App } = await import("./App.tsx")

  root.render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <ModalInteractionLock />
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>
  )
}
