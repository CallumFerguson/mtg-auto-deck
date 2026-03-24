import {
  CheckCircle2,
  Eye,
  LoaderCircle,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"

type SimulationActivity = {
  id: string
  kind: "thinking" | "tool"
  title: string
  status: "active" | "done" | "error"
}

type GoldfishSimulationPanelProps = {
  canStart: boolean
  isStarting: boolean
  gameId: string
  result: string
  rawPromptStream: string
  activities: SimulationActivity[]
  errorMessage: string
  onOpenPromptStream: () => void
  onStart: () => void
}

function ActivityIcon({ status }: Pick<SimulationActivity, "status">) {
  if (status === "done") {
    return <CheckCircle2 className="size-5 text-emerald-300" />
  }

  if (status === "error") {
    return <XCircle className="size-5 text-red-300" />
  }

  return <LoaderCircle className="size-5 animate-spin text-amber-200" />
}

export function GoldfishSimulationPanel({
  canStart,
  isStarting,
  gameId,
  result,
  rawPromptStream,
  activities,
  errorMessage,
  onOpenPromptStream,
  onStart,
}: GoldfishSimulationPanelProps) {
  const hasStream = Boolean(rawPromptStream.trim())

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30 backdrop-blur sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium tracking-[0.18em] text-amber-100 uppercase">
            <Sparkles className="size-3.5" />
            Auto goldfish simulation
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-100">
              Start a simulation
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-stone-400">
              Once the full commander and deck package is resolved, create a
              game on the local goldfish server, then let the local model work
              through the prompt while you follow a higher-level activity trace.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-stone-200 hover:bg-white/10 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-stone-900 disabled:text-stone-500"
            disabled={!hasStream}
            onClick={onOpenPromptStream}
          >
            <Eye />
            View full prompt stream
          </Button>

          <Button
            type="button"
            size="lg"
            className="h-11 rounded-full bg-amber-500 px-5 text-stone-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-400"
            disabled={!canStart || isStarting}
            onClick={onStart}
          >
            {isStarting ? (
              <>
                <LoaderCircle className="animate-spin" />
                Running
              </>
            ) : (
              <>
                <Play />
                Start auto goldfish
              </>
            )}
          </Button>
        </div>
      </div>

      {gameId ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-stone-300">
          <div className="space-y-1">
            <p className="text-stone-400">Current game ID</p>
            <p className="font-mono text-sm text-emerald-300">{gameId}</p>
          </div>
        </div>
      ) : null}

      {activities.length ? (
        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-amber-200 uppercase">
                Prompt activity
              </p>
              <p className="mt-1 text-sm text-stone-400">
                Thinking and tool calls are summarized here as they happen.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <ActivityIcon status={activity.status} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-100">
                      {activity.title}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium tracking-[0.18em] text-emerald-200 uppercase">
            Final answer
          </p>
          <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-emerald-50">
            {result}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}
    </section>
  )
}
