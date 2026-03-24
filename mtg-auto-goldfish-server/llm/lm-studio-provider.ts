import type {
  LoadedTextModel,
  PromptProcessingResult,
  PromptProcessor,
} from './index.js'

export const LM_STUDIO_DEFAULT_BASE_URL = 'http://127.0.0.1:1234'

export type PromptProcessorOptions = {
  baseUrl?: string
  apiToken?: string
  fetchImpl?: typeof fetch
  mcpServerUrl?: string
  mcpServerLabel?: string
}

type LmStudioModelsResponse = {
  models: Array<{
    type: 'llm' | 'embedding'
    key: string
    display_name: string
    size_bytes: number
    loaded_instances: Array<{
      id: string
    }>
  }>
}

type LmStudioOutputItem =
  | {
    type: 'message'
    content: string
  }
  | {
    type: 'reasoning'
    content: string
  }
  | {
    type: string
    content?: string
  }

type LmStudioChatResponse = {
  output?: LmStudioOutputItem[]
}

export function createLmStudioPromptProcessor(
  options: PromptProcessorOptions = {},
): PromptProcessor {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? LM_STUDIO_DEFAULT_BASE_URL)
  const apiToken = options.apiToken?.trim() || undefined
  const fetchImpl = options.fetchImpl ?? fetch
  const mcpServerUrl = options.mcpServerUrl?.trim()
  const mcpServerLabel = options.mcpServerLabel?.trim() || 'mtg-auto-goldfish'

  return {
    async processPrompt(prompt: string): Promise<PromptProcessingResult> {
      const loadedModels = await listLoadedTextModels({
        apiToken,
        baseUrl,
        fetchImpl,
      })
      const selectedModel = pickLargestLoadedModel(loadedModels)

      if (!selectedModel) {
        throw new Error(
          'LM Studio has no loaded LLMs available. Load a model in LM Studio and try again.',
        )
      }

      const chatResponse = await requestJson<LmStudioChatResponse>(
        fetchImpl,
        `${baseUrl}/api/v1/chat`,
        {
          method: 'POST',
          headers: buildHeaders(apiToken),
          body: JSON.stringify({
            model: selectedModel.key,
            input: prompt,
            integrations: buildIntegrations({
              mcpServerLabel,
              mcpServerUrl,
            }),
            temperature: 0,
            stream: false,
            store: false,
          }),
        },
      )

      const result = extractMessageText(chatResponse)

      if (!result) {
        throw new Error('LM Studio returned no message content for this prompt.')
      }

      return {
        result,
        model: selectedModel,
      }
    },
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(apiToken: string | undefined) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  if (apiToken) {
    headers.set('Authorization', `Bearer ${apiToken}`)
  }

  return headers
}

function buildIntegrations(options: {
  mcpServerLabel: string
  mcpServerUrl?: string
}) {
  if (!options.mcpServerUrl) {
    return undefined
  }

  return [
    {
      type: 'ephemeral_mcp' as const,
      server_label: options.mcpServerLabel,
      server_url: options.mcpServerUrl,
    },
  ]
}

async function listLoadedTextModels(options: {
  baseUrl: string
  apiToken?: string
  fetchImpl: typeof fetch
}): Promise<LoadedTextModel[]> {
  const response = await requestJson<LmStudioModelsResponse>(
    options.fetchImpl,
    `${options.baseUrl}/api/v1/models`,
    {
      method: 'GET',
      headers: buildHeaders(options.apiToken),
    },
  )

  return response.models
    .filter((model) => model.type === 'llm' && model.loaded_instances.length > 0)
    .map((model) => ({
      key: model.key,
      displayName: model.display_name,
      sizeBytes: model.size_bytes,
      instanceIds: model.loaded_instances.map((instance) => instance.id),
    }))
}

function pickLargestLoadedModel(models: LoadedTextModel[]) {
  return [...models].sort((left, right) => right.sizeBytes - left.sizeBytes)[0]
}

function extractMessageText(response: LmStudioChatResponse) {
  return (response.output ?? [])
    .filter(isMessageOutput)
    .map((item) => item.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

function isMessageOutput(
  item: LmStudioOutputItem,
): item is Extract<LmStudioOutputItem, { type: 'message' }> {
  return item.type === 'message' && typeof item.content === 'string'
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchImpl(input, init)

  if (!response.ok) {
    throw new Error(await buildErrorMessage(response))
  }

  return (await response.json()) as T
}

async function buildErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      error?: string
      message?: string
    }

    if (payload.error || payload.message) {
      return (
        payload.error ??
        payload.message ??
        `LM Studio request failed with ${response.status}.`
      )
    }
  }

  const bodyText = (await response.text()).trim()

  if (bodyText) {
    return bodyText
  }

  return `LM Studio request failed with ${response.status}.`
}
