import { useState } from "react"

import { Button } from "@/components/ui/button"

export function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <section className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium tracking-[0.18em] text-amber-300 uppercase">
            MTG Auto Goldfish
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            mtg auto goldfish
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="min-w-12 rounded-md border border-border bg-card px-3 py-2 text-lg font-semibold">
            {count}
          </span>
          <Button onClick={() => setCount((currentCount) => currentCount + 1)}>
            Increment
          </Button>
        </div>
      </section>
    </main>
  )
}

export default App
