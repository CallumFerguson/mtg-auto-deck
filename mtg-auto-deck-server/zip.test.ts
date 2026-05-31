import assert from "node:assert/strict"
import test from "node:test"
import { createJsonZipArchive } from "./zip.js"

test("creates a standard ZIP archive containing JSON files", () => {
  const archive = createJsonZipArchive(
    [
      {
        path: "index.json",
        value: {
          schemaVersion: 1,
          simulations: [
            {
              simulationId: "simulation-one",
              filePath: "simulations/simulation-one.json",
            },
          ],
        },
      },
      {
        path: "simulations/simulation-one.json",
        value: {
          schemaVersion: 1,
          simulation: {
            id: "simulation-one",
          },
        },
      },
    ],
    new Date("2026-01-01T00:00:00.000Z")
  )
  const entries = readStoredZipEntries(archive)

  assert.deepEqual([...entries.keys()], [
    "index.json",
    "simulations/simulation-one.json",
  ])
  assert.equal(
    JSON.parse(entries.get("index.json") ?? "{}").simulations[0].simulationId,
    "simulation-one"
  )
  assert.equal(
    JSON.parse(entries.get("simulations/simulation-one.json") ?? "{}")
      .simulation.id,
    "simulation-one"
  )
})

test("rejects unsafe ZIP paths", () => {
  assert.throws(
    () =>
      createJsonZipArchive([
        {
          path: "../index.json",
          value: {},
        },
      ]),
    /Invalid ZIP file path/
  )
})

function readStoredZipEntries(archive: Buffer) {
  const endOfCentralDirectoryOffset = archive.lastIndexOf(
    Buffer.from([0x50, 0x4b, 0x05, 0x06])
  )

  assert.notEqual(endOfCentralDirectoryOffset, -1)

  const entryCount = archive.readUInt16LE(endOfCentralDirectoryOffset + 10)
  const centralDirectoryOffset = archive.readUInt32LE(
    endOfCentralDirectoryOffset + 16
  )
  const entries = new Map<string, string>()
  let centralDirectoryCursor = centralDirectoryOffset

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    assert.equal(archive.readUInt32LE(centralDirectoryCursor), 0x02014b50)

    const compressionMethod = archive.readUInt16LE(centralDirectoryCursor + 10)
    const compressedSize = archive.readUInt32LE(centralDirectoryCursor + 20)
    const fileNameLength = archive.readUInt16LE(centralDirectoryCursor + 28)
    const extraLength = archive.readUInt16LE(centralDirectoryCursor + 30)
    const commentLength = archive.readUInt16LE(centralDirectoryCursor + 32)
    const localHeaderOffset = archive.readUInt32LE(centralDirectoryCursor + 42)
    const fileNameStart = centralDirectoryCursor + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const fileName = archive.toString("utf8", fileNameStart, fileNameEnd)

    assert.equal(compressionMethod, 0)
    assert.equal(archive.readUInt32LE(localHeaderOffset), 0x04034b50)

    const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28)
    const fileDataStart =
      localHeaderOffset + 30 + localFileNameLength + localExtraLength
    const fileDataEnd = fileDataStart + compressedSize

    entries.set(fileName, archive.toString("utf8", fileDataStart, fileDataEnd))
    centralDirectoryCursor =
      fileNameEnd + extraLength + commentLength
  }

  return entries
}
