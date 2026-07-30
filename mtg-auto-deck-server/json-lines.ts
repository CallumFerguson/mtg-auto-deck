import { Transform, type TransformCallback } from "node:stream"
import { StringDecoder } from "node:string_decoder"

export function createJsonLinesToJsonArrayTransform() {
  const decoder = new StringDecoder("utf8")
  let pendingText = ""
  let hasValues = false

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      pendingText += decoder.write(chunk)
      const lines = pendingText.split("\n")
      pendingText = lines.pop() ?? ""

      for (const line of lines) {
        appendJsonLine(this, line)
      }

      callback()
    },
    flush(callback: TransformCallback) {
      pendingText += decoder.end()
      appendJsonLine(this, pendingText)
      this.push(hasValues ? "]" : "[]")
      callback()
    },
  })

  function appendJsonLine(transform: Transform, line: string) {
    const json = line.trim()

    if (!json) {
      return
    }

    transform.push(`${hasValues ? "," : "["}${json}`)
    hasValues = true
  }
}
