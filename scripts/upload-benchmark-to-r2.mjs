#!/usr/bin/env node

import { spawn } from "node:child_process"
import { constants as fsConstants } from "node:fs"
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inflateRawSync } from "node:zlib"

const DEFAULT_BUCKET = "mtg-auto-deck"
const DEFAULT_CACHE_CONTROL = "public, max-age=3600"
const DEFAULT_CONCURRENCY = 4
const DEFAULT_PREFIX = "benchmarks"
const JSON_CONTENT_TYPE = "application/json"
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_STORE_METHOD = 0
const ZIP_DEFLATE_METHOD = 8
const ZIP64_SENTINEL_16 = 0xffff
const ZIP64_SENTINEL_32 = 0xffffffff

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printUsage()
    return
  }

  if (options.zipPaths.length === 0) {
    printUsage()
    throw new Error("Pass at least one benchmark ZIP path.")
  }

  const bucket = options.bucket || DEFAULT_BUCKET

  const zipPaths = options.zipPaths.map((zipPath) => path.resolve(zipPath))
  await Promise.all(
    zipPaths.map((zipPath) => access(zipPath, fsConstants.R_OK))
  )

  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "mtg-auto-deck-benchmark-")
  )

  try {
    const uploads = []

    for (let index = 0; index < zipPaths.length; index += 1) {
      const zipPath = zipPaths[index]
      const extractDirectory = path.join(
        tempDirectory,
        `archive-${String(index + 1).padStart(4, "0")}`
      )

      await mkdir(extractDirectory, { recursive: true })
      console.log(
        `Extracting ${zipPath}${zipPaths.length === 1 ? "" : ` (${index + 1}/${zipPaths.length})`}`
      )
      await extractZip(zipPath, extractDirectory)

      const files = await listJsonFiles(extractDirectory)

      if (files.length === 0) {
        throw new Error(`No JSON files were found in ${zipPath}.`)
      }

      uploads.push(
        ...files.map((file) => ({
          file,
          objectKey: joinObjectPath(
            options.prefix,
            toObjectPath(path.relative(extractDirectory, file))
          ),
        }))
      )
    }

    assertUniqueObjectKeys(uploads)

    console.log(
      `${options.dryRun ? "Would upload" : "Uploading"} ${uploads.length} JSON file${
        uploads.length === 1 ? "" : "s"
      } from ${zipPaths.length} benchmark ZIP${
        zipPaths.length === 1 ? "" : "s"
      } to R2 bucket ${bucket} with concurrency ${options.concurrency}.`
    )

    await uploadFiles({
      bucket,
      cacheControl: options.cacheControl,
      concurrency: options.concurrency,
      dryRun: options.dryRun,
      uploads,
      remote: !options.local,
    })

    console.log(
      `${options.dryRun ? "Dry run complete" : "Upload complete"} with Cache-Control: ${options.cacheControl}`
    )
  } finally {
    if (options.keepTemp) {
      console.log(`Keeping extracted files in ${tempDirectory}`)
    } else {
      await rm(tempDirectory, { force: true, recursive: true })
    }
  }
}

function parseArgs(args) {
  const options = {
    bucket: "",
    cacheControl: DEFAULT_CACHE_CONTROL,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    help: false,
    keepTemp: false,
    local: false,
    prefix: DEFAULT_PREFIX,
    zipPaths: [],
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--help" || arg === "-h") {
      options.help = true
      continue
    }

    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }

    if (arg === "--keep-temp") {
      options.keepTemp = true
      continue
    }

    if (arg === "--local") {
      options.local = true
      continue
    }

    if (arg === "--bucket" || arg === "-b") {
      options.bucket = readOptionValue(args, ++index, arg)
      continue
    }

    if (arg === "--cache-control" || arg === "-c") {
      options.cacheControl = readOptionValue(args, ++index, arg)
      continue
    }

    if (arg === "--concurrency" || arg === "-j") {
      options.concurrency = parseConcurrency(
        readOptionValue(args, ++index, arg),
        arg
      )
      continue
    }

    if (arg === "--prefix" || arg === "-p") {
      options.prefix = normalizeObjectPathPrefix(
        readOptionValue(args, ++index, arg)
      )
      continue
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    }

    options.zipPaths.push(...parseZipPathArgument(arg))
  }

  return options
}

function readOptionValue(args, index, optionName) {
  const value = args[index]

  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} needs a value.`)
  }

  return value
}

function parseConcurrency(value, optionName) {
  const concurrency = Number(value)

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`${optionName} needs a positive integer.`)
  }

  return concurrency
}

function parseZipPathArgument(arg) {
  const zipPaths = []
  const quotedSegmentPattern = /"([^"]*)"/g
  let cursor = 0
  let match

  while ((match = quotedSegmentPattern.exec(arg)) !== null) {
    zipPaths.push(...splitConcatenatedZipPaths(arg.slice(cursor, match.index)))
    zipPaths.push(...splitConcatenatedZipPaths(match[1]))
    cursor = quotedSegmentPattern.lastIndex
  }

  zipPaths.push(...splitConcatenatedZipPaths(arg.slice(cursor)))

  return zipPaths
}

function splitConcatenatedZipPaths(value) {
  const normalized = cleanZipPathSegment(value)

  if (!normalized) {
    return []
  }

  const zipPaths = []
  const nextWindowsPathPattern =
    /\.zip(?=\s*"*(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/]))/gi
  let cursor = 0
  let match

  while ((match = nextWindowsPathPattern.exec(normalized)) !== null) {
    const endIndex = match.index + match[0].length
    zipPaths.push(cleanZipPathSegment(normalized.slice(cursor, endIndex)))
    cursor = endIndex
  }

  zipPaths.push(cleanZipPathSegment(normalized.slice(cursor)))

  return zipPaths.filter(Boolean)
}

function cleanZipPathSegment(value) {
  return value
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim()
}

function printUsage() {
  console.log(`
Usage:
  npm run upload-benchmark -- <benchmark.zip> --bucket <r2-bucket>
  npm run upload-benchmark -- <benchmark.zip> [benchmark.zip...]

Options:
  -b, --bucket <name>           R2 bucket name. Defaults to "${DEFAULT_BUCKET}".
  -c, --cache-control <value>   Cache-Control header. Defaults to "${DEFAULT_CACHE_CONTROL}".
  -j, --concurrency <count>     Parallel uploads to run. Defaults to ${DEFAULT_CONCURRENCY}.
  -p, --prefix <path>           Prefix to prepend to every object key. Defaults to "${DEFAULT_PREFIX}".
      --dry-run                 Print wrangler commands without uploading.
      --local                   Upload to Wrangler's local R2 store instead of remote Cloudflare R2.
      --keep-temp               Keep the extracted temporary directory.
  -h, --help                    Show this help.

Examples:
  npm run upload-benchmark -- ./benchmark-abc.zip --bucket mtg-benchmarks
  npm run upload-benchmark -- ./benchmark-a.zip ./benchmark-b.zip
  npm run upload-benchmark -- ./benchmark-abc.zip --concurrency 8
  npm run upload-benchmark -- "C:\\Downloads\\benchmark-a.zip""C:\\Downloads\\benchmark-b.zip"
  npm run upload-benchmark -- ./benchmark-abc.zip --prefix public/benchmarks
  npm run upload-benchmark -- ./benchmark-abc.zip --bucket mtg-benchmarks --dry-run
`)
}

async function extractZip(zipPath, destinationDirectory) {
  const data = await readFile(zipPath)
  const endOffset = findEndOfCentralDirectory(data)
  const totalEntries = data.readUInt16LE(endOffset + 10)
  const centralDirectorySize = data.readUInt32LE(endOffset + 12)
  const centralDirectoryOffset = data.readUInt32LE(endOffset + 16)

  if (
    totalEntries === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error("ZIP64 benchmark archives are not supported.")
  }

  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new Error("ZIP central directory is invalid.")
  }

  let offset = centralDirectoryOffset

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (data.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIP central directory entry is invalid.")
    }

    const compressionMethod = data.readUInt16LE(offset + 10)
    const compressedSize = data.readUInt32LE(offset + 20)
    const uncompressedSize = data.readUInt32LE(offset + 24)
    const fileNameLength = data.readUInt16LE(offset + 28)
    const extraFieldLength = data.readUInt16LE(offset + 30)
    const fileCommentLength = data.readUInt16LE(offset + 32)
    const localHeaderOffset = data.readUInt32LE(offset + 42)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const zipPathName = data
      .subarray(fileNameStart, fileNameEnd)
      .toString("utf8")

    offset = fileNameEnd + extraFieldLength + fileCommentLength

    if (zipPathName.endsWith("/")) {
      continue
    }

    const safeZipPath = normalizeZipPath(zipPathName)
    const localHeader = localHeaderOffset

    if (data.readUInt32LE(localHeader) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`ZIP local file header is invalid for ${safeZipPath}.`)
    }

    const localFileNameLength = data.readUInt16LE(localHeader + 26)
    const localExtraFieldLength = data.readUInt16LE(localHeader + 28)
    const fileDataStart =
      localHeader + 30 + localFileNameLength + localExtraFieldLength
    const fileDataEnd = fileDataStart + compressedSize

    if (fileDataEnd > data.length) {
      throw new Error(`ZIP file data is invalid for ${safeZipPath}.`)
    }

    const compressedData = data.subarray(fileDataStart, fileDataEnd)
    const outputData = inflateZipEntry(
      compressedData,
      compressionMethod,
      safeZipPath
    )

    if (outputData.length !== uncompressedSize) {
      throw new Error(`ZIP file size mismatch for ${safeZipPath}.`)
    }

    const outputPath = path.resolve(
      destinationDirectory,
      ...safeZipPath.split("/")
    )

    if (!isPathInside(destinationDirectory, outputPath)) {
      throw new Error(
        `ZIP file path escapes the extraction directory: ${zipPathName}`
      )
    }

    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, outputData)
  }
}

function findEndOfCentralDirectory(data) {
  const minimumOffset = Math.max(0, data.length - 22 - 0xffff)

  for (let offset = data.length - 22; offset >= minimumOffset; offset -= 1) {
    if (data.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }

  throw new Error("Could not find ZIP end of central directory.")
}

function inflateZipEntry(data, compressionMethod, zipPathName) {
  if (compressionMethod === ZIP_STORE_METHOD) {
    return data
  }

  if (compressionMethod === ZIP_DEFLATE_METHOD) {
    return inflateRawSync(data)
  }

  throw new Error(
    `Unsupported ZIP compression method ${compressionMethod} for ${zipPathName}.`
  )
}

function normalizeZipPath(zipPathName) {
  const normalized = zipPathName.replaceAll("\\", "/")
  const segments = normalized.split("/")

  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("\0") ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`Unsafe ZIP file path: ${zipPathName}`)
  }

  return normalized
}

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(entryPath)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(entryPath)
    }
  }

  return files.sort((left, right) =>
    toObjectPath(left).localeCompare(toObjectPath(right))
  )
}

function assertUniqueObjectKeys(uploads) {
  const seenObjectKeys = new Set()
  const duplicateObjectKeys = []

  for (const { objectKey } of uploads) {
    if (seenObjectKeys.has(objectKey)) {
      duplicateObjectKeys.push(objectKey)
      continue
    }

    seenObjectKeys.add(objectKey)
  }

  if (duplicateObjectKeys.length === 0) {
    return
  }

  const uniqueDuplicateObjectKeys = Array.from(new Set(duplicateObjectKeys))
  const lines = [
    "Multiple selected ZIP files contain JSON files that would upload to the same R2 object key.",
    ...uniqueDuplicateObjectKeys
      .slice(0, 5)
      .map((objectKey) => `- ${objectKey}`),
  ]

  if (uniqueDuplicateObjectKeys.length > 5) {
    lines.push(`- ...and ${uniqueDuplicateObjectKeys.length - 5} more.`)
  }

  throw new Error(lines.join("\n"))
}

async function uploadFiles({
  bucket,
  cacheControl,
  concurrency,
  dryRun,
  uploads,
  remote,
}) {
  const errors = []
  let nextIndex = 0

  async function uploadNextFile() {
    while (errors.length === 0) {
      const upload = uploads[nextIndex]
      nextIndex += 1

      if (!upload) {
        return
      }

      try {
        await putR2Object({
          bucket,
          cacheControl,
          contentType: JSON_CONTENT_TYPE,
          dryRun,
          file: upload.file,
          objectKey: upload.objectKey,
          remote,
        })
      } catch (error) {
        errors.push({
          error,
          objectKey: upload.objectKey,
        })
      }
    }
  }

  const workerCount = Math.min(concurrency, uploads.length)
  await Promise.all(Array.from({ length: workerCount }, () => uploadNextFile()))

  if (errors.length > 0) {
    throw new Error(formatUploadErrors(errors))
  }
}

function formatUploadErrors(errors) {
  const lines = [
    `${errors.length} upload${errors.length === 1 ? "" : "s"} failed.`,
  ]

  for (const { error, objectKey } of errors.slice(0, 5)) {
    lines.push(`- ${objectKey}: ${formatErrorMessage(error)}`)
  }

  if (errors.length > 5) {
    lines.push(`- ...and ${errors.length - 5} more.`)
  }

  return lines.join("\n")
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function putR2Object({
  bucket,
  cacheControl,
  contentType,
  dryRun,
  file,
  objectKey,
  remote,
}) {
  const objectPath = `${bucket}/${objectKey}`
  const args = [
    "r2",
    "object",
    "put",
    objectPath,
    ...(remote ? ["--remote"] : []),
    "--file",
    file,
    "--content-type",
    contentType,
    "--cache-control",
    cacheControl,
  ]

  if (dryRun) {
    console.log(`wrangler ${args.map(quoteShellArg).join(" ")}`)
    return
  }

  console.log(`Uploading ${objectKey}`)
  await runCommand(process.execPath, [getWranglerScriptPath(), ...args])
}

function getWranglerScriptPath() {
  return path.join(
    PROJECT_ROOT,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js"
  )
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawn(command, args, {
        stdio: "inherit",
        windowsHide: true,
      })
    } catch (error) {
      reject(error)
      return
    }

    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          signal
            ? `wrangler exited with signal ${signal}.`
            : `wrangler exited with code ${code}.`
        )
      )
    })
  })
}

function normalizeObjectPathPrefix(prefix) {
  return prefix.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
}

function joinObjectPath(prefix, relativePath) {
  return [normalizeObjectPathPrefix(prefix), relativePath]
    .filter(Boolean)
    .join("/")
}

function toObjectPath(filePath) {
  return filePath.split(path.sep).join("/")
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath)

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  )
}

function quoteShellArg(value) {
  if (/^[\w./:=,-]+$/.test(value)) {
    return value
  }

  return JSON.stringify(value)
}
