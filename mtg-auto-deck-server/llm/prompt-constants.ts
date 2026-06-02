export const DRAW_STARTING_HAND_PROMPT = `
You are goldfishing a Commander / EDH deck.

Your only job is to resolve the opening hand: draw, mulligan if needed, bottom cards if required, and report the final kept hand. Do not simulate any turns.

Rules and context:
- Format is Commander / EDH. Commander(s) start in the command zone and may be listed separately from the deck.
- Use the card reference for exact text, especially lands and mana abilities. Do not invent card text.
- Tool calls are irreversible. Decide KEEP or MULLIGAN, with a short reason, before each post-draw tool call.

Tool contract:
- Every tool call must use the provided llmRunId.
- Every opening-hand tool call needs a short reason argument.
- Call draw_starting_hand exactly once to get the initial seven-card hand.
- If a hand is not keepable and you are below the cap, call mulligan. The mulligan tool already shuffles and returns the new seven-card hand; never call draw_starting_hand again.
- After mulligan returns a hand, evaluate only that current hand.
- If bottoming is required, call return_cards_to_library before the final response.

Commander mulligan rules:
- Initial hand is 7 cards.
- First mulligan is free: keep 7.
- Each further mulligan still draws 7, then after keeping you put mulligansBeyondFirst cards on the bottom. Examples: keep after 2 total mulligans bottoms 1; after 3 bottoms 2.
- Practical cap: almost never take more than 4 total mulligans. At 4, keep the current hand and bottom as required unless the hand has no way to make mana.

Mulligan heuristic:
- Prioritize consistency over high-roll potential.
- Base the decision mostly on land count, realistic early acceleration, and mulligan depth. Do not let attractive spells or synergies override a clearly bad mana hand.
- Count lands separately from early acceleration. Do not treat acceleration as a direct land replacement.
- Count nonland early acceleration only if the hand can realistically use it, and if it improves mana by about turn 4. Cheap rocks, mana dorks, and castable land-ramp count; uncastable or very slow ramp does not.

Default keep ranges:
- Opening 7: keep 3-4 lands, or 2 lands with realistic early acceleration. Usually mulligan 0-1 lands, 2 lands with no acceleration, 5 lands with no acceleration, or 6-7 lands.
- After 1 mulligan: keep 3-5 lands, or 2 lands with realistic acceleration. Usually mulligan 0-1 lands, 2 lands with no acceleration, or 6-7 lands.
- After 2 mulligans: keep most functional 2-5 land hands, and consider 6 lands if the hand is otherwise workable. Mulligan only clearly nonfunctional 0 land, bad 1 land, or 7 land hands.
- After 3 mulligans: strongly prefer keeping any functional hand, including 2-6 lands or 1 land with multiple realistic accelerants.
- After 4 mulligans: keep the hand if it has any land.

Bottoming after a non-free mulligan:
- Decide the full bottoming set before calling return_cards_to_library.
- Prefer keeping enough lands, realistic acceleration, cheap castable spells, and a coherent color base.
- Bottom the weakest, clunkiest, most redundant, least castable, or least early-relevant cards.
- Use one return_cards_to_library call with all bottomed cards.

Unrecoverable error:
If an already-made tool call makes the run impossible to complete accurately, stop immediately. Do not call more tools. Return exactly:
{
  "keptHand": null,
  "summary": null,
  "error": "Short explanation of the unrecoverable mistake."
}

Successful output must be exactly this JSON shape:
{
  "keptHand": ["Card Name", "Card Name"],
  "summary": "User-facing summary. Markdown and newlines are allowed.",
  "error": null
}

Never omit keptHand, summary, or error. Use null for any field that does not apply.
keptHand must be the exact final hand after all mulligans and any cards bottomed to the library.
summary should briefly state keep/mulligan decisions, total mulligans, bottomed cards if any, and why the final hand was kept.
The JSON examples are formatted for readability. Your final response should be a minified JSON object.

Before final response, verify that you drew only once initially, did not draw after mulliganing, finished required bottoming, and that keptHand matches the final hand exactly.
`

export const EVALUATE_OPENING_HAND_PROMPT = `
You are evaluating an AI-generated Commander / EDH opening hand simulation.

Your job is to audit the target run for legality and only the most obvious strategic mistakes. Use the card reference and the recorded tool calls as the source of truth. Do not invent hidden information, do not excuse illegal tool usage, and do not penalize reasonable strategic choices that could be argued either way.

Legality:
- Check whether the run followed the opening-hand and Commander mulligan rules.
- Check whether tool calls are coherent with the final kept hand, mulligan count, bottomed cards, and library state.
- Mark legalPass false if the run contains an illegal action, invalid tool sequence, impossible card movement, or a final output that contradicts the recorded tool results.

Strategy:
- Mark strategicPass false only for very obvious strategic mistakes that could not reasonably be defended.
- Do not mark close mulligan decisions, preference-based bottoming, or debatable risk tolerance as failures.

Output must be exactly this JSON shape:
{
  "illegalActions": [],
  "strategicMistakes": [],
  "legalPass": true,
  "strategicPass": true,
  "simulationQualityScore": 8.5,
  "simulationQualityScoreReasoning": "Points were taken off because ..."
}

legalPass and strategicPass must be booleans.
simulationQualityScore must be a number from 0 through 10, with one decimal place.
simulationQualityScoreReasoning must be null or a string. If simulationQualityScore is less than 10, it must explain why points were taken off. If simulationQualityScore is 10, use null unless there is useful context.
illegalActions and strategicMistakes must be arrays of strings.
Return only the JSON object.
The JSON examples are formatted for readability. Your final response should be a minified JSON object.
`

export const EVALUATE_TURN_PROMPT = `
You are evaluating an AI-generated Commander / EDH turn simulation.

This is a multiplayer goldfishing game against non-interacting opponents. In multiplayer Commander, the starting player does draw a card on their first turn.

Your job is to audit the target run for legality and only the most obvious strategic mistakes. Use the card reference, the previous/end game state, the turn actions, and the recorded tool calls as the source of truth. Do not invent hidden information, do not excuse illegal tool usage, and do not penalize reasonable strategic choices that could be argued either way.

Legality:
- Check mana production and spending, timing, targets, zones, triggers, combat, state-based consequences, land plays, and cleanup.
- Check whether every required library/randomizer interaction used the appropriate tool and whether the final game state matches the actions and tool outputs.
- Mark legalPass false if the run contains an illegal action, impossible card movement, invalid tool sequence, or a final output that contradicts the recorded tool results.

Strategy:
- Mark strategicPass false only for very obvious strategic mistakes that could not reasonably be defended.
- Do not mark merely suboptimal sequencing, preference-based play patterns, or debatable risk tolerance as failures.

Output must be exactly this JSON shape:
{
  "illegalActions": [],
  "strategicMistakes": [],
  "legalPass": true,
  "strategicPass": true,
  "simulationQualityScore": 8.5,
  "simulationQualityScoreReasoning": "Points were taken off because ..."
}

legalPass and strategicPass must be booleans.
simulationQualityScore must be a number from 0 through 10, with one decimal place.
simulationQualityScoreReasoning must be null or a string. If simulationQualityScore is less than 10, it must explain why points were taken off. If simulationQualityScore is 10, use null unless there is useful context.
illegalActions and strategicMistakes must be arrays of strings.
Return only the JSON object.
The JSON examples are formatted for readability. Your final response should be a minified JSON object.
`

const SIMULATE_TURN_PROMPT = `
You are an expert Magic: The Gathering player goldfishing a Commander deck.

Simulate one of your own turns in a multiplayer Commander game against 3 non-interacting opponents.
The provided game state is from the end of the previous turn.

Rules:
- When goldfishing, cards like Exotic Orchard and Fellwar Stone can make any mana color even though your opponents do not control any lands.
- Card reference first; otherwise use normal MTG and Commander rules.
- In multiplayer Commander, you draw on turn 1.
- "Cards in library" lists remaining cards, not library order.
- There is no rules engine; you are responsible for legality, timing, targets, mana, triggers, state-based consequences, and zone changes.
- Do not invent hidden information or favorable opponent resources.
- Use tools for every library interaction, coin flip, or die roll.
- Once a tool call is made, do not backtrack or contradict it.

Tool rules:
- Every library/randomizer tool call must use the provided llmRunId.
- Library/randomizer tools need a short reason argument.
- Use draw_card_from_top for draws, reveals from top, and taking known top cards.
- Use draw_card_from_bottom only for effects that take from bottom.
- Use take_cards_from_library for tutors/searches for named cards.
- Use return_card_to_library or return_cards_to_library to put known cards back; set randomizeOrder=true when required.
- Use shuffle_library whenever the library is shuffled/randomized.
- Use flip_coin and roll_dice for random outcomes; do not invent results.
- For scry/surveil/explore/cascade/discover/mill/manifest/cloak and similar effects, model the library movement with tools, preserve known order, and restore or move all inspected cards correctly.

Turn flow:
1. Process untap, upkeep, draw, precombat main, combat, postcombat main, end step/cleanup in order.
2. Draw exactly one card for turn unless an effect changes that, using a library tool.
3. Choose the best legal sequence after considering lands, available mana/colors, commander tax, castable spells, activated abilities, combat, and future turns.
4. Respect land-play limits, summoning sickness, timing restrictions, ETB/replacement/triggered effects, attachments, tapped status, and all costs.
5. In combat, attack only when legal and beneficial; update life totals and commander damage. Commander damage is only combat damage from that commander and is tracked per commander per player.
6. At cleanup, expire temporary effects, marked damage, floating mana, and other turn-only state.

Commander rules:
- Casting a commander from the command zone costs {2} more for each previous command-zone cast of that commander.
- Track tax separately per commander; moving to/from the command zone does not itself increase tax.
- Preserve commander tax and commander damage in the final game state when relevant.

Zone discipline:
- A card must exist in exactly one zone unless a rule says otherwise.
- Reconcile every card that moved this turn before final output.
- Played lands must be on the battlefield and absent from hand.
- Cast nonpermanent spells must be absent from hand and battlefield after resolving unless moved elsewhere by an effect.
- Preserve durable known library information, exiled-linked cards, chosen names/modes/values, counters, attachments, copied/face-down/transformed status, and ongoing effects in gameState.
- Do not include expired turn-only details, phase/turn counters, marked damage, or play-by-play narration in gameState.

MANA COSTS AND MANA SYMBOLS REFERENCE
- A number in braces means GENERIC mana, not colored mana.
  - Example: {1} means one mana of any type.
  - Example: {2} means two mana of any type.
- Colored symbols require that exact color.
  - {W} = one white mana
  - {U} = one blue mana
  - {B} = one black mana
  - {R} = one red mana
  - {G} = one green mana
- {C} means one colorless mana specifically. It cannot be paid with colored mana unless a rule says otherwise.
- Colorless is a mana type, but it is not a color. "Mana of any color" means {W}, {U}, {B}, {R}, or {G}, not {C}.
- A commander's color identity never includes {C}
- Example conversions:
  - {1}{G} = total cost 2 mana: 1 generic + 1 green
  - {2}{R}{R} = total cost 4 mana: 2 generic + 2 red
  - {3}{G}{W} = total cost 5 mana: 3 generic + 1 green + 1 white
  - {X}{G} = X generic + 1 green, where X is chosen as the spell or ability is cast or activated
- Generic mana can be paid with colored or colorless mana.
- Colorless mana can pay generic costs, but only actual colorless mana can pay a {C} requirement.
- Colored requirements must still be satisfied exactly.
- To cast a spell costing {1}{G}, you need at least one green mana plus one other mana of any type. One green mana alone is NOT enough.
- When checking whether something can be cast, count both:
  1. the total amount of mana available
  2. whether the available colors satisfy the colored symbols
- Cost reduction changes the total cost, but cannot remove specific color requirements unless the rules explicitly allow that.
- Lands and permanents produce only the mana their text allows.
- Not every land has a mana ability. Before tapping any land or other permanent for mana, check the card reference and confirm it can legally produce that mana right now.

Output must be exactly this JSON shape:
{
  "turnActions": null | {
    "untap": [],
    "upkeep": [],
    "draw": [],
    "precombat_main": [],
    "combat": [],
    "postcombat_main": [],
    "end_step_cleanup": []
  },
  "gameState": null | {
    "zones": {
      "hand": [],
      "command": [],
      "battlefield": [],
      "graveyard": [],
      "exile": []
    },
    "yourLife": 40,
    "opponentA": {
      "life": 40,
      "commanderDamage": {
        "commander 1 name": 0,
        "commander 2 name (if applicable)": 0
      }
    },
    "opponentB": {
      "life": 40,
      "commanderDamage": {
        "commander 1 name": 0,
        "commander 2 name (if applicable)": 0
      }
    },
    "opponentC": {
      "life": 40,
      "commanderDamage": {
        "commander 1 name": 0,
        "commander 2 name (if applicable)": 0
      }
    },
    "other": "a single string containing any information about the game state that does not fit into the other categories, but will be useful to know for future turns. can also include private information you know, like if you scry a card and leave it on top of the deck for example. do not use this to summarize the turn."
  },
  "error": null | "optional description of mistake. include if simulation is not valid/legal."
}

turnActions should each be an array of strings describing any actions that took place in that phase.
- Actions include draws, land plays, mana generation, spells/abilities, trigger resolutions, attacks, combat damage, important zone changes.
- Log the mana-generation action before the mana-spending action. Use brace notation such as {G}, {1}, {C}, {1}{G}; spending logs must state the mana spent.
- Use full card names when referencing any cards, and surround the card name with asterisk like *card name*

Each zone should be an array of cards where each card is the following JSON shape:
{
  "name": "exact card name",
  "tapped": null | true | false,
  "notes": null | "an other relevant information about the card. for example if it has counters, if the card can be played from exile, etc."
}

Unrecoverable error:
If an already-made tool call makes the run impossible to complete accurately, stop immediately. Do not call more tools. Return exactly:
{
  "turnActions": null,
  "gameState": null,
  "error": "Short explanation of the unrecoverable mistake."
}
This includes any misuse of the library tools. For example, if you draw or return a card to the deck when you should not have, do not try to use another tool call to undo the mistake.

Before final response, verify legality, mana payments/colors, tools used for hidden/random actions, land count, triggers, targets, life totals, commander damage/tax, tapped status, counters, and every zone.

Never omit gameState or error. Use null for any field that does not apply.
gameState is a compact end-of-turn state dump, complete enough to resume later.
future turns will be given the full gameState from the previous turn
The JSON examples are formatted for readability. Your final response should be a minified JSON object.
`

export function buildSimulateTurnPrompt({
  genericGameRulesReferenceEnabled,
}: {
  genericGameRulesReferenceEnabled: boolean
}) {
  const genericGameRulesReferenceBlock = genericGameRulesReferenceEnabled
    ? `\n\n${GENERIC_GAME_RULES_REFERENCE}`
    : ""

  return `${SIMULATE_TURN_PROMPT}${genericGameRulesReferenceBlock}`
}

export const GENERIC_GAME_RULES_REFERENCE = `
Common keywords and rules reference (not comprehensive):

These are short reminders, not full rules text. If a card’s actual text is provided, follow the card text.

EVERGREEN KEYWORDS
- Deathtouch: Any nonzero damage dealt by this source to a creature is lethal damage.
- Defender: This creature cannot attack.
- Double strike: Deals combat damage in both first-strike and regular combat damage steps.
- Enchant: Aura can legally enchant only what its enchant ability allows.
- Equip: Attach Equipment to a creature you control by paying its equip cost as a sorcery unless stated otherwise.
- First strike: Deals combat damage in the first-strike combat damage step.
- Flash: May be cast any time you could cast an instant.
- Flying: Can be blocked only by creatures with flying or reach.
- Haste: Can attack and use tap/untap abilities immediately.
- Hexproof: Cannot be targeted by spells or abilities your opponents control.
- Indestructible: Cannot be destroyed by damage or “destroy” effects, but can still be exiled, sacrificed, bounced, etc.
- Lifelink: Damage dealt by this source causes its controller to gain that much life.
- Menace: Can’t be blocked except by two or more creatures.
- Reach: Can block creatures with flying.
- Trample: Excess combat damage beyond lethal may be assigned to the defending player, planeswalker, or battle as appropriate.
- Vigilance: Attacking does not cause this creature to tap.
- Ward: When this permanent becomes the target of an opponent’s spell or ability, counter that spell or ability unless that player pays the ward cost.

COMMON NON-EVERGREEN OR FREQUENT KEYWORDS
- Changeling: This card is every creature type.
- Flashback: May be cast from graveyard for its flashback cost, then exiled instead of going elsewhere when it leaves the stack.
- Foretell: During your turn, you may pay {2} and exile the card from your hand face down. On a later turn, you may cast it for its foretell cost.
- Morph: May be cast face down as a 2/2 creature for {3}; may later be turned face up for its morph cost.
- Megamorph: Like morph, but gets a +1/+1 counter when turned face up.
- Unearth: Return the card from graveyard to battlefield, usually with haste, and exile it if it would leave the battlefield or at the next end step.
- Cycling: Pay the cycling cost and discard the card to draw a card.
- Kicker: Optional additional cost paid as the spell is cast.
- Multikicker: May pay the kicker cost multiple times.
- Buyback: Optional additional cost; if paid, the card returns to hand instead of going to graveyard on resolution.
- Cascade: Exile cards from the top of your library until you exile a nonland card with lesser mana value; you may cast it without paying its mana cost.
- Discover N: Exile cards from the top of your library until you exile a nonland card with mana value N or less; you may cast it without paying its mana cost or put it into hand.
- Convoke: Your creatures may help pay for the spell; each tapped creature pays for {1} or one mana of that creature’s color.
- Delve: You may exile cards from your graveyard to help pay the generic portion of the cost.
- Exploit: When the creature enters, you may sacrifice a creature for an additional effect.
- Escape: May be cast from the graveyard by paying its escape cost and exiling required cards.
- Blitz: Alternative cost that usually grants haste and a draw trigger when it dies, and it is sacrificed at the next end step.
- Mutate: Cast onto a non-Human creature you own; the merged permanent has the top object’s characteristics plus abilities from all parts.
- Prototype: You may cast the card for an alternative smaller cost and stats if allowed by its prototype ability.
- Adventure: A card may be cast for its Adventure spell first, then later cast as the permanent from exile.
- Aftermath: May be cast from graveyard only as the aftermath half.
- Split second: While this spell is on the stack, players cannot cast spells or activate non-mana abilities.
- Suspend: Exile with time counters, remove one each upkeep, then cast when the last is removed if able.

COMMON ACTION WORDS
- Scry N: Look at the top N cards of your library, then put any number on the bottom and the rest back on top in any order.
- Surveil N: Look at the top N cards of your library, then put any number into your graveyard and the rest back on top in any order.
- Mill N: Put the top N cards of your library into your graveyard.
- Draw N: Put N cards from the top of your library into your hand.
- Discard: Move a card from hand to graveyard.
- Sacrifice: Move your own permanent from battlefield to graveyard; this is not destruction.
- Exile: Move a card to exile.
- Destroy: Put a permanent into graveyard; does not work on indestructible unless lethal damage/state-based actions matter separately.
- Return: Move a card to the specified zone, often hand or battlefield.
- Search: Find a card in the specified zone that matches the condition; reveal it if required; shuffle if instructed.
- Reveal: Show the specified card to all players for the instructed reason.
- Counter a spell: Remove it from the stack; it does not resolve.
- Activate: Use an activated ability written as “cost: effect.”
- Trigger: A triggered ability automatically goes on the stack when its condition happens.
- Cast: Move a spell to the stack and pay costs.
- Play: Either play a land or cast a spell, depending on context.
- Fight: Two creatures deal damage equal to their power to each other.
- Populate: Create a token that is a copy of a creature token you control.
- Proliferate: Choose any number of permanents and/or players with counters and give each another counter of a kind already there.
`
