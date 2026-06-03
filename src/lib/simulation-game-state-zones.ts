export type SimulationGameStateZoneObject = {
  index: number
  isToken: boolean
  name: string
  notes: string | null
  quantity: number
  tapped: boolean | null
  zoneKey: string
}

export type SimulationGameStateZone = {
  key: string
  label: string
  objects: SimulationGameStateZoneObject[]
}

export const GAME_STATE_ZONE_ORDER = [
  "battlefield",
  "hand",
  "command",
  "graveyard",
  "exile",
] as const

const GAME_STATE_ZONE_LABELS: Record<string, string> = {
  battlefield: "Battlefield",
  command: "Command",
  exile: "Exile",
  graveyard: "Graveyard",
  hand: "Hand",
}

export function getSimulationGameStateZones(
  gameState: unknown
): SimulationGameStateZone[] {
  const gameStateRecord = getSimulationUnknownRecord(gameState)
  const zonesRecord = getSimulationUnknownRecord(gameStateRecord?.zones)

  if (!zonesRecord) {
    return []
  }

  const zoneKeys = Object.keys(zonesRecord).filter(
    (zoneKey) => zoneKey !== "library" && Array.isArray(zonesRecord[zoneKey])
  )
  const zoneKeySet = new Set(zoneKeys)
  const orderedZoneKeys = [
    ...GAME_STATE_ZONE_ORDER.filter((zoneKey) => zoneKeySet.has(zoneKey)),
    ...zoneKeys.filter(
      (zoneKey) =>
        !GAME_STATE_ZONE_ORDER.includes(
          zoneKey as (typeof GAME_STATE_ZONE_ORDER)[number]
        )
    ),
  ]

  return orderedZoneKeys.map((zoneKey) => ({
    key: zoneKey,
    label: getSimulationGameStateZoneLabel(zoneKey),
    objects: getSimulationGameStateZoneObjects(zonesRecord[zoneKey], zoneKey),
  }))
}

export function getSimulationGameStateZoneObjectTitle(
  object: SimulationGameStateZoneObject
) {
  const details = [
    object.isToken ? "token" : null,
    object.quantity > 1 ? `x${object.quantity}` : null,
    object.tapped === true
      ? "tapped"
      : object.tapped === false
        ? "untapped"
        : null,
    object.notes,
  ].filter(Boolean)

  return details.length > 0
    ? `${object.name} (${details.join(" / ")})`
    : object.name
}

function getSimulationGameStateZoneObjects(
  value: unknown,
  zoneKey: string
): SimulationGameStateZoneObject[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((object, index) => {
    const objectRecord = getSimulationUnknownRecord(object)

    if (!objectRecord) {
      return []
    }

    const name = objectRecord.name

    if (typeof name !== "string" || !name.trim()) {
      return []
    }

    const notes = objectRecord.notes
    const isToken = objectRecord.isToken === true

    return [
      {
        index,
        isToken,
        name: name.trim(),
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        quantity: getSimulationGameStateZoneObjectQuantity(
          objectRecord.quantity,
          isToken
        ),
        tapped:
          typeof objectRecord.tapped === "boolean" ? objectRecord.tapped : null,
        zoneKey,
      },
    ]
  })
}

function getSimulationGameStateZoneObjectQuantity(
  value: unknown,
  isToken: boolean
) {
  if (!isToken) {
    return 1
  }

  return typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : 1
}

function getSimulationUnknownRecord(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function getSimulationGameStateZoneLabel(zoneKey: string) {
  const knownLabel = GAME_STATE_ZONE_LABELS[zoneKey]

  if (knownLabel) {
    return knownLabel
  }

  return zoneKey
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
