import { createClaudePromptProcessor } from "./claude-provider.js"
import { createGeminiPromptProcessor } from "./gemini-provider.js"
import { createLlamaCppPromptProcessor } from "./llama-cpp-provider.js"
import { createLmStudioPromptProcessor } from "./lm-studio-provider.js"
import { createOpenAiPromptProcessor } from "./openai-provider.js"

export type PromptProcessorProvider =
  | "lm-studio"
  | "llama.cpp"
  | "openai"
  | "claude"
  | "gemini"

export type PromptProcessorOptions = {
  provider?: PromptProcessorProvider | string
  baseUrl?: string
  apiToken?: string
  apiKey?: string
  model?: string
  maxOutputTokens?: number
  reasoningEffort?: string
  reasoningSummary?: string
  fetchImpl?: typeof fetch
  mcpServerUrl?: string
  mcpServerLabel?: string
}

export type LoadedTextModel = {
  key: string
  displayName: string
  sizeBytes: number
  instanceIds: string[]
}

export type PromptTokenUsage = {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export type PromptProcessingResult = {
  result: string
  provider: PromptProcessorProvider
  model: LoadedTextModel
  usage?: PromptTokenUsage
  durationMs: number
}

export type PromptStreamEvent =
  | {
      type: "start"
      model: LoadedTextModel
    }
  | {
      type: "status"
      event: string
      progress?: number
      modelInstanceId?: string
    }
  | {
      type: "reasoning"
      delta: string
    }
  | {
      type: "message"
      delta: string
    }
  | {
      type: "tool"
      event: string
      tool?: string
      provider?: string
      argumentsText?: string
      output?: string
      structuredContent?: Record<string, unknown>
      uiMetadata?: Record<string, unknown>
      error?: string
    }
  | {
      type: "error"
      error: string
    }
  | {
      type: "done"
      result: string
      reasoning: string
      model: LoadedTextModel
    }

export interface PromptProcessor {
  processPrompt(prompt: string): Promise<PromptProcessingResult>
  processPromptStream(
    prompt: string,
    onEvent: (event: PromptStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<PromptProcessingResult>
}

export function createPromptProcessor(
  options: PromptProcessorOptions = {}
): PromptProcessor {
  switch (normalizePromptProcessorProvider(options.provider)) {
    case "llama.cpp":
      return createLlamaCppPromptProcessor(options)
    case "openai":
      return createOpenAiPromptProcessor(options)
    case "claude":
      return createClaudePromptProcessor(options)
    case "gemini":
      return createGeminiPromptProcessor(options)
    case "lm-studio":
    default:
      return createLmStudioPromptProcessor(options)
  }
}

export function normalizePromptProcessorProvider(
  rawProvider: PromptProcessorOptions["provider"]
): PromptProcessorProvider {
  const normalizedProvider = rawProvider?.trim().toLowerCase()

  switch (normalizedProvider) {
    case "llama.cpp":
    case "llama-cpp":
    case "llamacpp":
    case "llama":
    case "llama-server":
      return "llama.cpp"
    case "openai":
      return "openai"
    case "anthropic":
    case "claude":
      return "claude"
    case "google":
    case "google-gemini":
    case "gemini":
      return "gemini"
    case "lmstudio":
    case "lm-studio":
    case "local":
    case undefined:
    case "":
      return "lm-studio"
    default:
      throw new Error(
        `Unsupported LLM_PROVIDER value: ${rawProvider}. Expected lm-studio, llama.cpp, openai, claude, or gemini.`
      )
  }
}

