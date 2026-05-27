import type {
  SimulationDebugLlmRun,
  SimulationResultsInfo,
  SimulationSummary,
} from "./simulations-postgres.js"

export type SimulationResultsStreamRun = SimulationDebugLlmRun

export type SimulationResultsStreamInfo = Omit<
  SimulationResultsInfo,
  "openingHandLlmRuns" | "turnLlmRuns"
> & {
  openingHandLlmRuns: SimulationResultsStreamRun[]
  turnLlmRuns: SimulationResultsStreamRun[]
}

export type SimulationResultsStreamEvent =
  | {
      type: "snapshot"
      simulation: SimulationSummary
      results: SimulationResultsStreamInfo
    }
  | {
      type: "llm_run_started"
      run: SimulationResultsStreamRun
    }
  | {
      type: "llm_run_updated"
      run: SimulationResultsStreamRun
    }
  | {
      type: "simulation_updated"
      simulation: SimulationSummary
    }
  | {
      type: "done"
      simulation: SimulationSummary
      results: SimulationResultsStreamInfo
    }
  | {
      type: "error"
      message: string
    }

export type SimulationResultsStreamWriter = {
  write: (data: string) => unknown
  end: () => unknown
}

type SimulationResultsSubscriber = {
  id: symbol
  writer: SimulationResultsStreamWriter
}

export class SimulationResultsBroadcaster {
  private readonly subscribersBySimulationId = new Map<
    string,
    Set<SimulationResultsSubscriber>
  >()

  subscribe(simulationId: string, writer: SimulationResultsStreamWriter) {
    const subscriber = {
      id: Symbol(simulationId),
      writer,
    }
    let subscribers = this.subscribersBySimulationId.get(simulationId)

    if (!subscribers) {
      subscribers = new Set()
      this.subscribersBySimulationId.set(simulationId, subscribers)
    }

    subscribers.add(subscriber)

    return () => {
      this.unsubscribe(simulationId, subscriber)
    }
  }

  publish(simulationId: string, event: SimulationResultsStreamEvent) {
    const subscribers = this.subscribersBySimulationId.get(simulationId)

    if (!subscribers) {
      return
    }

    for (const subscriber of [...subscribers]) {
      try {
        subscriber.writer.write(formatSseEvent(event))
      } catch {
        this.unsubscribe(simulationId, subscriber)
      }
    }
  }

  closeSimulation(simulationId: string) {
    const subscribers = this.subscribersBySimulationId.get(simulationId)

    if (!subscribers) {
      return
    }

    this.subscribersBySimulationId.delete(simulationId)

    for (const subscriber of subscribers) {
      subscriber.writer.end()
    }
  }

  getSubscriberCount(simulationId: string) {
    return this.subscribersBySimulationId.get(simulationId)?.size ?? 0
  }

  private unsubscribe(
    simulationId: string,
    subscriber: SimulationResultsSubscriber
  ) {
    const subscribers = this.subscribersBySimulationId.get(simulationId)

    if (!subscribers) {
      return
    }

    subscribers.delete(subscriber)

    if (subscribers.size === 0) {
      this.subscribersBySimulationId.delete(simulationId)
    }
  }
}

export function formatSseEvent(event: SimulationResultsStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function formatSseComment(comment: string) {
  return `: ${comment}\n\n`
}
