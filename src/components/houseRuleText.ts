import type { HouseRules } from '../game/types'

/** Names and one-line explanations of the house rules, shared by setup, the rules sheet and the Game menu. */
export const HOUSE_RULE_TEXT: Record<keyof HouseRules, { title: string; hint: string }> = {
  rollSixesFirst: {
    title: 'Roll all your sixes first',
    hint: 'After a 6, keep rolling until you roll something else, then use all the dice in any order you like.',
  },
}
