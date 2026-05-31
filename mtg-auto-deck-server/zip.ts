type JsonZipFile = {
  path: string
  value: unknown
}

const ZIP_UTF8_FLAG = 0x0800
const ZIP_STORE_METHOD = 0
const ZIP_VERSION_NEEDED_TO_EXTRACT = 10
const ZIP_VERSION_MADE_BY = 20
const MAX_UINT16 = 0xffff
const MAX_UINT32 = 0xffffffff

const CRC32_TABLE = createCrc32Table()

export function createJsonZipArchive(
  files: readonly JsonZipFile[],
  modifiedAt = new Date()
) {
  const archiveFiles = files.map((file) => {
    const json = JSON.stringify(file.value)

    if (json === undefined) {
      throw new Error(`ZIP JSON file ${file.path} could not be serialized.`)
    }

    return {
      data: Buffer.from(`${json}\n`, "utf8"),
      path: normalizeZipPath(file.path),
    }
  })

  return createStoredZipArchive(archiveFiles, modifiedAt)
}

function createStoredZipArchive(
  files: readonly { path: string; data: Buffer }[],
  modifiedAt: Date
) {
  if (files.length > MAX_UINT16) {
    throw new Error("ZIP archive has too many files for standard ZIP format.")
  }

  const localFileParts: Buffer[] = []
  const centralDirectoryParts: Buffer[] = []
  let offset = 0
  const { dosDate, dosTime } = getDosDateTime(modifiedAt)

  for (const file of files) {
    const fileName = Buffer.from(file.path, "utf8")
    const crc32 = calculateCrc32(file.data)

    if (fileName.length > MAX_UINT16) {
      throw new Error(`ZIP file path is too long: ${file.path}`)
    }

    if (file.data.length > MAX_UINT32) {
      throw new Error(`ZIP file is too large for standard ZIP format: ${file.path}`)
    }

    if (offset > MAX_UINT32) {
      throw new Error("ZIP archive is too large for standard ZIP format.")
    }

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(ZIP_VERSION_NEEDED_TO_EXTRACT, 4)
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6)
    localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc32, 14)
    localHeader.writeUInt32LE(file.data.length, 18)
    localHeader.writeUInt32LE(file.data.length, 22)
    localHeader.writeUInt16LE(fileName.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localFileParts.push(localHeader, fileName, file.data)

    const centralDirectoryHeader = Buffer.alloc(46)
    centralDirectoryHeader.writeUInt32LE(0x02014b50, 0)
    centralDirectoryHeader.writeUInt16LE(ZIP_VERSION_MADE_BY, 4)
    centralDirectoryHeader.writeUInt16LE(ZIP_VERSION_NEEDED_TO_EXTRACT, 6)
    centralDirectoryHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8)
    centralDirectoryHeader.writeUInt16LE(ZIP_STORE_METHOD, 10)
    centralDirectoryHeader.writeUInt16LE(dosTime, 12)
    centralDirectoryHeader.writeUInt16LE(dosDate, 14)
    centralDirectoryHeader.writeUInt32LE(crc32, 16)
    centralDirectoryHeader.writeUInt32LE(file.data.length, 20)
    centralDirectoryHeader.writeUInt32LE(file.data.length, 24)
    centralDirectoryHeader.writeUInt16LE(fileName.length, 28)
    centralDirectoryHeader.writeUInt16LE(0, 30)
    centralDirectoryHeader.writeUInt16LE(0, 32)
    centralDirectoryHeader.writeUInt16LE(0, 34)
    centralDirectoryHeader.writeUInt16LE(0, 36)
    centralDirectoryHeader.writeUInt32LE(0, 38)
    centralDirectoryHeader.writeUInt32LE(offset, 42)

    centralDirectoryParts.push(centralDirectoryHeader, fileName)
    offset += localHeader.length + fileName.length + file.data.length
  }

  const centralDirectoryOffset = offset
  const centralDirectory = Buffer.concat(centralDirectoryParts)

  if (centralDirectory.length > MAX_UINT32) {
    throw new Error("ZIP central directory is too large for standard ZIP format.")
  }

  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(files.length, 8)
  endOfCentralDirectory.writeUInt16LE(files.length, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([
    ...localFileParts,
    centralDirectory,
    endOfCentralDirectory,
  ])
}

function normalizeZipPath(path: string) {
  const normalizedPath = path.replaceAll("\\", "/")
  const pathSegments = normalizedPath.split("/")

  if (
    normalizedPath.length === 0 ||
    normalizedPath.startsWith("/") ||
    pathSegments.some(
      (pathSegment) =>
        pathSegment.length === 0 ||
        pathSegment === "." ||
        pathSegment === ".."
    )
  ) {
    throw new Error(`Invalid ZIP file path: ${path}`)
  }

  return normalizedPath
}

function getDosDateTime(date: Date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  return {
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
    dosTime: (hours << 11) | (minutes << 5) | seconds,
  }
}

function createCrc32Table() {
  const table = new Uint32Array(256)

  for (let index = 0; index < table.length; index += 1) {
    let crc = index

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }

    table[index] = crc >>> 0
  }

  return table
}

function calculateCrc32(data: Buffer) {
  let crc = 0xffffffff

  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}
