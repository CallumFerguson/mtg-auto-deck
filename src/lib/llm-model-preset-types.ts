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
  name: string | null
  provider: LlmProvider
  model: string
  reasoningEffort: ReasoningEffort
  openrouterModelProvider: string | null
  supportsFlex: boolean
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

export function getLlmModelPresetLabel(
  preset: Pick<
    LlmModelPreset,
    "model" | "name" | "openrouterModelProvider" | "provider" | "reasoningEffort"
  >
) {
  const name = preset.name?.trim()

  if (name) {
    return name
  }

  return getLlmModelPresetTechnicalLabel(preset)
}

export function getLlmModelPresetTechnicalLabel(
  preset: Pick<
    LlmModelPreset,
    "model" | "openrouterModelProvider" | "provider" | "reasoningEffort"
  >
) {
  return [
    formatProviderLabel(preset.provider),
    preset.model,
    preset.openrouterModelProvider,
    preset.reasoningEffort,
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
