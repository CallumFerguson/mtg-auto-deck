import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"
import { createJsonLinesToJsonArrayTransform } from "./json-lines.js"

test("converts chunked UTF-8 JSON Lines into a JSON array", async () => {
  const jsonLines = Buffer.from(
    '{"name":"Black Lotus"}\r\n{"name":"Marit Lagé"}\n\n',
    "utf8"
  )
  const accentedCharacterOffset = jsonLines.indexOf(Buffer.from("é"))
  const chunks = [
    jsonLines.subarray(0, 10),
    jsonLines.subarray(10, accentedCharacterOffset + 1),
    jsonLines.subarray(accentedCharacterOffset + 1),
  ]
  const outputChunks: Buffer[] = []

  for await (const chunk of Readable.from(chunks).pipe(
    createJsonLinesToJsonArrayTransform()
  )) {
    outputChunks.push(Buffer.from(chunk))
  }

  assert.deepEqual(JSON.parse(Buffer.concat(outputChunks).toString("utf8")), [
    { name: "Black Lotus" },
    { name: "Marit Lagé" },
  ])
})

test("converts empty JSON Lines into an empty JSON array", async () => {
  const outputChunks: Buffer[] = []

  for await (const chunk of Readable.from(["\n\r\n"]).pipe(
    createJsonLinesToJsonArrayTransform()
  )) {
    outputChunks.push(Buffer.from(chunk))
  }

  assert.equal(Buffer.concat(outputChunks).toString("utf8"), "[]")
})
