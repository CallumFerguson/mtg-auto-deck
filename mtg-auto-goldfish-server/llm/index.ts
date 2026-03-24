import {
  type PromptProcessorOptions,
  createLmStudioPromptProcessor,
} from './lm-studio-provider.js'

export type LoadedTextModel = {
  key: string
  displayName: string
  sizeBytes: number
  instanceIds: string[]
}

export type PromptProcessingResult = {
  result: string
  model: LoadedTextModel
}

export interface PromptProcessor {
  processPrompt(prompt: string): Promise<PromptProcessingResult>
}

export function createPromptProcessor(
  options: PromptProcessorOptions = {},
): PromptProcessor {
  return createLmStudioPromptProcessor(options)
}
