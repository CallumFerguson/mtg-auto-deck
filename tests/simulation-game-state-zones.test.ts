import assert from "node:assert/strict"
import test from "node:test"

import {
  getSimulationGameStateZoneObjectTitle,
  getSimulationGameStateZones,
} from "../src/lib/simulation-game-state-zones.js"

test("defaults missing token metadata for older game-state objects", () => {
  const zones = getSimulationGameStateZones({
    zones: {
      battlefield: [{ name: "Forest", tapped: false, notes: null }],
    },
  })

  assert.deepEqual(zones[0]?.objects, [
    {
      index: 0,
      isToken: false,
      name: "Forest",
      notes: null,
      quantity: 1,
      tapped: false,
      zoneKey: "battlefield",
    },
  ])
})

test("keeps token quantities and describes grouped tokens", () => {
  const zones = getSimulationGameStateZones({
    zones: {
      battlefield: [
        {
          name: "Treasure token",
          isToken: true,
          quantity: 3,
          tapped: false,
          notes:
            'Artifact token with "{T}, Sacrifice this artifact: Add one mana of any color."',
        },
      ],
    },
  })
  const object = zones[0]?.objects[0]

  assert.equal(object?.isToken, true)
  assert.equal(object?.quantity, 3)
  assert.equal(
    object ? getSimulationGameStateZoneObjectTitle(object) : null,
    'Treasure token (token / x3 / untapped / Artifact token with "{T}, Sacrifice this artifact: Add one mana of any color.")'
  )
})

test("keeps grouped quantity for non-token cards", () => {
  const zones = getSimulationGameStateZones({
    zones: {
      battlefield: [
        {
          name: "Forest",
          isToken: false,
          quantity: 3,
        },
      ],
    },
  })
  const object = zones[0]?.objects[0]

  assert.equal(object?.quantity, 3)
  assert.equal(
    object ? getSimulationGameStateZoneObjectTitle(object) : null,
    "Forest (x3)"
  )
})

test("keeps duplicate physical cards as separate objects", () => {
  const zones = getSimulationGameStateZones({
    zones: {
      hand: [
        { name: "Forest", isToken: false, quantity: 1 },
        { name: "Forest", isToken: false, quantity: 1 },
      ],
    },
  })

  assert.equal(zones[0]?.objects.length, 2)
  assert.deepEqual(
    zones[0]?.objects.map((object) => object.quantity),
    [1, 1]
  )
})
