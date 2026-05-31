#!/usr/bin/env node

import { spawn } from "node:child_process"
import { constants as fsConstants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_BUCKET = "mtg-auto-deck"
const DEFAULT_CACHE_CONTROL = "public, max-age=3600"
const DEFAULT_PREFIX = "simulations"
const JSON_CONTENT_TYPE = "application/json"
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

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

  if (!options.jsonPath) {
    printUsage()
    throw new Error("Pass the simulation JSON file path.")
  }

  const bucket = options.bucket || DEFAULT_BUCKET
  const jsonPath = path.resolve(options.jsonPath)
  await access(jsonPath, fsConstants.R_OK)
  await validateJsonFile(jsonPath)

  const objectName =
    options.objectName || toSafeObjectFileName(path.basename(jsonPath))
  const objectKey = joinObjectPath(options.prefix, objectName)

  await putR2Object({
    bucket,
    cacheControl: options.cacheControl,
    contentType: JSON_CONTENT_TYPE,
    dryRun: options.dryRun,
    file: jsonPath,
    objectKey,
    remote: !options.local,
  })

  console.log(
    `${options.dryRun ? "Dry run complete" : "Upload complete"} with Cache-Control: ${options.cacheControl}`
  )
}

function parseArgs(args) {
  const options = {
    bucket: "",
    cacheControl: DEFAULT_CACHE_CONTROL,
    dryRun: false,
    help: false,
    local: false,
    objectName: "",
    prefix: DEFAULT_PREFIX,
    jsonPath: "",
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

    if (arg === "--name" || arg === "-n") {
      options.objectName = toSafeObjectFileName(
        readOptionValue(args, ++index, arg)
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

    if (options.jsonPath) {
      throw new Error(`Unexpected extra argument: ${arg}`)
    }

    options.jsonPath = arg
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

function printUsage() {
  console.log(`
Usage:
  npm run upload-simulation -- <simulation.json>

Options:
  -b, --bucket <name>           R2 bucket name. Defaults to "${DEFAULT_BUCKET}".
  -c, --cache-control <value>   Cache-Control header. Defaults to "${DEFAULT_CACHE_CONTROL}".
  -p, --prefix <path>           Prefix to prepend to the object key. Defaults to "${DEFAULT_PREFIX}".
  -n, --name <filename>         Object filename to use under the prefix. Defaults to the local JSON filename.
      --dry-run                 Print the wrangler command without uploading.
      --local                   Upload to Wrangler's local R2 store instead of remote Cloudflare R2.
  -h, --help                    Show this help.

Examples:
  npm run upload-simulation -- ./82ac8419-a190-466c-9298-e685c11977ac.json
  npm run upload-simulation -- ./simulation.json --name 82ac8419-a190-466c-9298-e685c11977ac.json
  npm run upload-simulation -- ./simulation.json --dry-run
`)
}

async function validateJsonFile(jsonPath) {
  if (path.extname(jsonPath).toLowerCase() !== ".json") {
    throw new Error("Simulation upload only accepts .json files.")
  }

  JSON.parse(await readFile(jsonPath, "utf8"))
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

function joinObjectPath(prefix, fileName) {
  return [normalizeObjectPathPrefix(prefix), fileName].filter(Boolean).join("/")
}

function toSafeObjectFileName(fileName) {
  const normalized = fileName.replaceAll("\\", "/")

  if (
    normalized.length === 0 ||
    normalized.includes("/") ||
    normalized.includes("\0") ||
    path.extname(normalized).toLowerCase() !== ".json"
  ) {
    throw new Error(`Invalid simulation JSON object filename: ${fileName}`)
  }

  return normalized
}

function quoteShellArg(value) {
  if (/^[\w./:=,-]+$/.test(value)) {
    return value
  }

  return JSON.stringify(value)
}
