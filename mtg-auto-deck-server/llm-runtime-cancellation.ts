const DEFAULT_RUNTIME_ABORT_MESSAGE = "LLM run was cancelled."

class RuntimeAbortError extends Error {
  constructor(message = DEFAULT_RUNTIME_ABORT_MESSAGE) {
    super(message)
    this.name = "AbortError"
  }
}

export function createRuntimeAbortError(message?: string) {
  return new RuntimeAbortError(message)
}

export function throwIfRuntimeAborted(signal: AbortSignal, message?: string) {
  if (signal.aborted) {
    throw createRuntimeAbortError(message)
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
      throw createRuntimeAbortError(message)
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
      throw createRuntimeAbortError(message)
    }

    throw error
  }
}
