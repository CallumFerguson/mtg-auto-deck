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

type SimulationResultsSubscriptionOptions = {
  includeRunCosts: boolean
}

type SimulationResultsSubscriber = {
  id: symbol
  options: SimulationResultsSubscriptionOptions
  writer: SimulationResultsStreamWriter
}

export class SimulationResultsBroadcaster {
  private readonly subscribersBySimulationId = new Map<
    string,
    Set<SimulationResultsSubscriber>
  >()

  subscribe(
    simulationId: string,
    writer: SimulationResultsStreamWriter,
    options: SimulationResultsSubscriptionOptions = {
      includeRunCosts: true,
    }
  ) {
    const subscriber = {
      id: Symbol(simulationId),
      options,
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
        subscriber.writer.write(
          formatSseEvent(
            redactSimulationResultsStreamEventCosts(
              event,
              subscriber.options.includeRunCosts
            )
          )
        )
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

export function redactSimulationResultsStreamEventCosts(
  event: SimulationResultsStreamEvent,
  includeRunCosts: boolean
): SimulationResultsStreamEvent {
  if (includeRunCosts) {
    return event
  }

  if (event.type === "snapshot" || event.type === "done") {
    return {
      ...event,
      results: redactSimulationResultsInfoCosts(event.results),
    }
  }

  if (event.type === "llm_run_started" || event.type === "llm_run_updated") {
    return {
      ...event,
      run: redactSimulationResultsRunCost(event.run),
    }
  }

  return event
}

export function redactSimulationResultsInfoCosts(
  results: SimulationResultsStreamInfo
): SimulationResultsStreamInfo {
  return {
    ...results,
    openingHandLlmRuns: results.openingHandLlmRuns.map(
      redactSimulationResultsRunCost
    ),
    turnLlmRuns: results.turnLlmRuns.map(redactSimulationResultsRunCost),
  }
}

function redactSimulationResultsRunCost(
  run: SimulationResultsStreamRun
): SimulationResultsStreamRun {
  return {
    ...run,
    estimatedPriceCents: null,
  }
}
