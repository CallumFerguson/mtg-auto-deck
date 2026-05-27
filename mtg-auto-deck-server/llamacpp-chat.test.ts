import assert from "node:assert/strict"
import test from "node:test"
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions"
import { z } from "zod/v4"
import { isAbortError } from "./llm-run-events.js"
import {
  collectLlamaCppChatCompletionNonStreaming,
  createLlamaCppChatCompletionTools,
  getLlamaCppChatCompletionToolCalls,
  type LlamaCppChatCompletionRequestPayload,
  type LlamaCppToolDefinition,
} from "./llamacpp-chat.js"

const openingHandToolDefinitions: LlamaCppToolDefinition[] = [
  {
    name: "draw_starting_hand",
    description: "Draw the starting hand.",
    inputSchema: z.object({
      llmRunId: z.string().trim().min(1),
    }),
  },
]

const turnToolDefinitions: LlamaCppToolDefinition[] = [
  {
    name: "draw_card_from_top",
    description: "Draw cards from the top.",
    inputSchema: z.object({
      llmRunId: z.string().trim().min(1),
      count: z.number().int().positive(),
    }),
  },
]

test("collects a non-streaming llama.cpp opening-hand tool loop", async () => {
  const chatRequests: ChatCompletionCreateParamsNonStreaming[] = []
  const toolCalls: Array<{ args: Record<string, unknown>; name: string }> = []
  const responses = [
    createChatCompletion({
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "draw_starting_hand",
            arguments: '{"llmRunId":"run_1"}',
          },
        },
      ],
    }),
    createChatCompletion({
      content: '{"keptHand":["Sol Ring"]}',
      finishReason: "stop",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 25,
        total_tokens: 125,
      },
    }),
  ]

  const result = await collectLlamaCppChatCompletionNonStreaming({
    callTool: async (name, args) => {
      toolCalls.push({ name, args })
      return { cards: ["Sol Ring"] }
    },
    createChatCompletion: async (body) => {
      chatRequests.push(body)
      const response = responses.shift()

      assert.ok(response)
      return response
    },
    requestPayload: createRequestPayload(openingHandToolDefinitions),
    signal: new AbortController().signal,
    toolDefinitions: openingHandToolDefinitions,
  })

  assert.deepEqual(toolCalls, [
    {
      name: "draw_starting_hand",
      args: {
        llmRunId: "run_1",
      },
    },
  ])
  assert.equal(result.outputText, '{"keptHand":["Sol Ring"]}')
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 25,
    total_tokens: 125,
  })
  assert.deepEqual(
    chatRequests.map((request) => request.stream),
    [false, false]
  )
  assert.equal(chatRequests[0]?.max_tokens, 2000)
  assert.equal(chatRequests[1]?.messages.length, 3)
  const rawResponse = result.rawResponse as { responses?: unknown[] }

  assert.equal(Array.isArray(rawResponse.responses), true)
  assert.equal(rawResponse.responses?.length, 2)
})

test("collects a non-streaming llama.cpp turn tool loop with shorthand calls", async () => {
  const toolCalls: Array<{ args: Record<string, unknown>; name: string }> = []
  const finalOutput =
    '{"gameState":{"zones":{"hand":[{"name":"Sol Ring","tapped":null,"notes":null}],"command":[],"battlefield":[],"graveyard":[],"exile":[]},"yourLife":40,"opponentA":{"life":40,"commanderDamage":{}},"opponentB":{"life":40,"commanderDamage":{}},"opponentC":{"life":40,"commanderDamage":{}},"other":""},"error":null}'
  const responses = [
    createChatCompletion({
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          name: "draw_card_from_top",
          arguments: '{"llmRunId":"run_1","count":1}',
        },
      ],
    }),
    createChatCompletion({
      content: finalOutput,
      finishReason: "stop",
    }),
  ]

  const result = await collectLlamaCppChatCompletionNonStreaming({
    callTool: async (name, args) => {
      toolCalls.push({ name, args })
      return { cards: ["Sol Ring"] }
    },
    createChatCompletion: async () => {
      const response = responses.shift()

      assert.ok(response)
      return response
    },
    requestPayload: createRequestPayload(turnToolDefinitions),
    signal: new AbortController().signal,
    toolDefinitions: turnToolDefinitions,
  })

  assert.equal(result.outputText, finalOutput)
  assert.deepEqual(toolCalls, [
    {
      name: "draw_card_from_top",
      args: {
        llmRunId: "run_1",
        count: 1,
      },
    },
  ])
})

test("rejects malformed llama.cpp tool arguments", async () => {
  await assert.rejects(
    collectLlamaCppChatCompletionNonStreaming({
      callTool: async () => {
        throw new Error("Tool should not be called.")
      },
      createChatCompletion: async () =>
        createChatCompletion({
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "draw_starting_hand",
                arguments: '{"llmRunId":',
              },
            },
          ],
        }),
      requestPayload: createRequestPayload(openingHandToolDefinitions),
      signal: new AbortController().signal,
      toolDefinitions: openingHandToolDefinitions,
    }),
    /llama\.cpp tool draw_starting_hand arguments were not valid JSON\./
  )
})

test("stops runaway llama.cpp tool loops at the step limit", async () => {
  await assert.rejects(
    collectLlamaCppChatCompletionNonStreaming({
      callTool: async () => ({ cards: ["Sol Ring"] }),
      createChatCompletion: async () =>
        createChatCompletion({
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "draw_starting_hand",
                arguments: '{"llmRunId":"run_1"}',
              },
            },
          ],
        }),
      requestPayload: {
        ...createRequestPayload(openingHandToolDefinitions),
        stopWhenStepCount: 1,
      },
      signal: new AbortController().signal,
      toolDefinitions: openingHandToolDefinitions,
    }),
    /LLAMACPP_STOP_WHEN_STEP_COUNT \(1\)/
  )
})

test("does not start llama.cpp requests after cancellation", async () => {
  const abortController = new AbortController()
  let requestCount = 0

  abortController.abort()

  await assert.rejects(
    collectLlamaCppChatCompletionNonStreaming({
      callTool: async () => ({ cards: ["Sol Ring"] }),
      createChatCompletion: async () => {
        requestCount += 1
        return createChatCompletion({
          content: '{"keptHand":["Sol Ring"]}',
          finishReason: "stop",
        })
      },
      requestPayload: createRequestPayload(openingHandToolDefinitions),
      signal: abortController.signal,
      toolDefinitions: openingHandToolDefinitions,
    }),
    (error: unknown) => isAbortError(error)
  )

  assert.equal(requestCount, 0)
})

test("surfaces llama.cpp chat completion request failures", async () => {
  await assert.rejects(
    collectLlamaCppChatCompletionNonStreaming({
      callTool: async () => ({ cards: ["Sol Ring"] }),
      createChatCompletion: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8080")
      },
      requestPayload: createRequestPayload(openingHandToolDefinitions),
      signal: new AbortController().signal,
      toolDefinitions: openingHandToolDefinitions,
    }),
    /connect ECONNREFUSED/
  )
})

test("normalizes OpenAI-style and shorthand llama.cpp tool calls", () => {
  assert.deepEqual(
    getLlamaCppChatCompletionToolCalls(
      {
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "draw_starting_hand",
              arguments: '{"llmRunId":"run_1"}',
            },
          },
          {
            name: "draw_card_from_top",
            arguments: '{"llmRunId":"run_1","count":1}',
          },
        ],
      },
      2
    ).map(({ argumentsText, id, name }) => ({ argumentsText, id, name })),
    [
      {
        argumentsText: '{"llmRunId":"run_1"}',
        id: "call_1",
        name: "draw_starting_hand",
      },
      {
        argumentsText: '{"llmRunId":"run_1","count":1}',
        id: "llamacpp_call_2_2",
        name: "draw_card_from_top",
      },
    ]
  )
})

function createRequestPayload(
  toolDefinitions: readonly LlamaCppToolDefinition[]
): LlamaCppChatCompletionRequestPayload {
  return {
    providerType: "llamacpp",
    model: "local-model",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: "prompt",
      },
    ],
    metadata: {
      phase: "opening_hand",
      simulationId: "simulation_1",
    },
    parallel_tool_calls: false,
    tools: createLlamaCppChatCompletionTools(toolDefinitions),
    stopWhenStepCount: 5,
  }
}

function createChatCompletion({
  content = null,
  finishReason = null,
  toolCalls,
  usage = null,
}: {
  content?: string | null
  finishReason?: ChatCompletion["choices"][number]["finish_reason"] | null
  toolCalls?: unknown[]
  usage?: unknown
}): ChatCompletion {
  return {
    id: "chatcmpl_1",
    choices: [
      {
        finish_reason: finishReason,
        index: 0,
        logprobs: null,
        message: {
          role: "assistant",
          content,
          refusal: null,
          tool_calls: toolCalls,
        },
      },
    ],
    created: 0,
    model: "local-model",
    object: "chat.completion",
    usage,
  } as ChatCompletion
}
