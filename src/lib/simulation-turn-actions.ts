export const TURN_PHASE_CHANGES = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "combat",
  "postcombat_main",
  "end_step_cleanup",
] as const

export type TurnPhaseChange = (typeof TURN_PHASE_CHANGES)[number]

export type LoggedTurnAction = {
  action: string
  phaseChange: TurnPhaseChange | null
}
