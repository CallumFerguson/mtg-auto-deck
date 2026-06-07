const DEFAULT_RUNTIME_ABORT_MESSAGE = "LLM run was cancelled."

class RuntimeAbortError extends Error {
  constructor(message = DEFAULT_RUNTIME_ABORT_MESSAGE) {
    super(message)
    this.name = "AbortError"
  }
}

export class RuntimeTimeoutError extends Error {
  readonly timeoutSeconds: number

  constructor(timeoutSeconds: number) {
    super(formatRuntimeTimeoutMessage(timeoutSeconds))
    this.name = "RuntimeTimeoutError"
    this.timeoutSeconds = timeoutSeconds
  }
}

export function createRuntimeAbortError(message?: string) {
  return new RuntimeAbortError(message)
}

export function createRuntimeAbortErrorForSignal(
  signal: AbortSignal,
  message?: string
) {
  return (
    getRuntimeTimeoutAbortError(undefined, signal) ??
    createRuntimeAbortError(message)
  )
}

export function createRuntimeTimeoutError(timeoutSeconds: number) {
  return new RuntimeTimeoutError(timeoutSeconds)
}

export function getRuntimeTimeoutAbortError(
  error: unknown,
  signal?: AbortSignal
): RuntimeTimeoutError | null {
  if (isRuntimeTimeoutError(error)) {
    return error
  }

  if (error instanceof Error) {
    const causeTimeoutError = getRuntimeTimeoutAbortError(error.cause)

    if (causeTimeoutError) {
      return causeTimeoutError
    }
  }

  if (signal) {
    const reason = getRuntimeAbortReason(signal)

    if (isRuntimeTimeoutError(reason)) {
      return reason
    }
  }

  return null
}

export function isRuntimeTimeoutError(
  error: unknown
): error is RuntimeTimeoutError {
  return error instanceof RuntimeTimeoutError
}

export function throwIfRuntimeAborted(signal: AbortSignal, message?: string) {
  if (signal.aborted) {
    throw createRuntimeAbortErrorForSignal(signal, message)
  }
}

export function registerRuntimeAbortHandler(
  signal: AbortSignal,
  onAbort: () => void | Promise<void>
) {
  let didRun = false

  const runAbortHandler = () => {
    if (didRun) {
      return
    }

    didRun = true
    void Promise.resolve(onAbort()).catch(() => {})
  }

  if (signal.aborted) {
    runAbortHandler()
    return () => {}
  }

  signal.addEventListener("abort", runAbortHandler, { once: true })

  return () => {
    signal.removeEventListener("abort", runAbortHandler)
  }
}

export async function callWithRuntimeAbortSignal<T>(
  signal: AbortSignal,
  callback: (options: { signal: AbortSignal }) => Promise<T>,
  message?: string
) {
  throwIfRuntimeAborted(signal, message)

  try {
    const result = await callback({ signal })

    throwIfRuntimeAborted(signal, message)

    return result
  } catch (error) {
    if (signal.aborted) {
      throw createRuntimeAbortErrorForSignal(signal, message)
    }

    throw error
  }
}

export async function forEachRuntimeAbortableAsync<T>(
  iterable: AsyncIterable<T>,
  signal: AbortSignal,
  callback: (item: T) => void | Promise<void>,
  message?: string
) {
  throwIfRuntimeAborted(signal, message)

  try {
    for await (const item of iterable) {
      throwIfRuntimeAborted(signal, message)
      await callback(item)
      throwIfRuntimeAborted(signal, message)
    }

    throwIfRuntimeAborted(signal, message)
  } catch (error) {
    if (signal.aborted) {
      throw createRuntimeAbortErrorForSignal(signal, message)
    }

    throw error
  }
}

function formatRuntimeTimeoutMessage(timeoutSeconds: number) {
  return `LLM run timed out after ${timeoutSeconds} seconds without producing a final response.`
}

function getRuntimeAbortReason(signal: AbortSignal) {
  return signal.reason
}
