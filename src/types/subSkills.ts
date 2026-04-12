/**
 * Deliberate-practice sub-skills (from Polymath Investor framework).
 *
 * Each investing decision / prediction can be tagged with one of these so that
 * calibration, Brier score, and weakness-targeting can be computed per-skill
 * rather than only in aggregate. See public/deliberate-practice-framework.md.
 */

export const SUB_SKILLS = [
  'position_sizing',
  'valuation_accuracy',
  'management_assessment',
  'competitive_dynamics',
  'catalyst_timing',
  'sell_discipline',
  'risk_identification',
  'information_edge',
  'sector_pattern_recognition',
  'behavioral_self_awareness',
  'structured_post_mortem',
] as const

export type SubSkill = (typeof SUB_SKILLS)[number]

export const SUB_SKILL_LABELS: Record<SubSkill, string> = {
  position_sizing: 'Position Sizing',
  valuation_accuracy: 'Valuation Accuracy',
  management_assessment: 'Management Assessment',
  competitive_dynamics: 'Competitive Dynamics',
  catalyst_timing: 'Catalyst Timing',
  sell_discipline: 'Sell Discipline',
  risk_identification: 'Risk Identification',
  information_edge: 'Information Edge',
  sector_pattern_recognition: 'Sector Pattern Recognition',
  behavioral_self_awareness: 'Behavioral Self-Awareness',
  structured_post_mortem: 'Structured Post-Mortem',
}

export const SUB_SKILL_DESCRIPTIONS: Record<SubSkill, string> = {
  position_sizing: 'Translating conviction into portfolio weight',
  valuation_accuracy: 'Entry-price vs fair-value discipline',
  management_assessment: 'Reading operators, capital allocators, incentives',
  competitive_dynamics: 'Moats, entrants, pricing power',
  catalyst_timing: 'Identifying what forces a repricing, and when',
  sell_discipline: 'Exiting on process, not P&L or sunk cost',
  risk_identification: 'Pre-mortem — what is the real failure mode?',
  information_edge: "What do I know that the market doesn't?",
  sector_pattern_recognition: 'Seeing the shape of setups you have studied',
  behavioral_self_awareness: 'Catching your own tilt, FOMO, anchoring',
  structured_post_mortem: 'Turning closed decisions into tagged lessons',
}

export function isSubSkill(value: unknown): value is SubSkill {
  return typeof value === 'string' && (SUB_SKILLS as readonly string[]).includes(value)
}
