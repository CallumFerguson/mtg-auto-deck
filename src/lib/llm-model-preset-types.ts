export type LlmProvider = "openai" | "openrouter" | "llamacpp"

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"

export type LlmModelPreset = {
  id: string
  provider: LlmProvider
  model: string
  reasoningEffort: ReasoningEffort
  openrouterModelProvider: string | null
  serviceTier: string | null
  inputTokenCostUsdPerMillion: number | null
  cachedInputTokenCostUsdPerMillion: number | null
  outputTokenCostUsdPerMillion: number | null
  isEnabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type AdminLlmModelPreset = LlmModelPreset & {
  simulationReferenceCount: number
  llmRunReferenceCount: number
  evaluationReferenceCount: number
  canDelete: boolean
}

export type LlmModelPresetsResponse = {
  presets: LlmModelPreset[]
  defaultPresetId: string | null
}

export type AdminLlmModelPresetsResponse = {
  presets: AdminLlmModelPreset[]
  total: number
}

export type CreateLlmModelPresetResponse = {
  preset: LlmModelPreset
}

export type UpdateLlmModelPresetResponse = {
  preset: LlmModelPreset | null
}

export function getLlmModelPresetLabel(
  preset: Pick<
    LlmModelPreset,
    | "model"
    | "openrouterModelProvider"
    | "provider"
    | "reasoningEffort"
    | "serviceTier"
  >
) {
  return [
    formatProviderLabel(preset.provider),
    preset.model,
    preset.openrouterModelProvider,
    preset.reasoningEffort,
    preset.serviceTier,
  ]
    .filter(Boolean)
    .join(" / ")
}

export function formatProviderLabel(provider: LlmProvider | string) {
  if (provider === "openai") {
    return "OpenAI"
  }

  if (provider === "openrouter") {
    return "OpenRouter"
  }

  if (provider === "llamacpp") {
    return "llama.cpp"
  }

  return provider
}
