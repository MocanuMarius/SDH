/**
 * Shared motion primitives.
 *
 * Tone: restrained — we borrow from the "newspaper aesthetic" of the
 * rest of the app. Animations are short (≤200ms), soft eases, small
 * physical deltas. The goal is to make the UI feel alive and
 * responsive without calling attention to the motion itself.
 *
 * Every variant respects `prefers-reduced-motion`: when the user has
 * asked their OS for less movement, the variants collapse to
 * instantaneous no-ops (opacity stays 1, no translate / scale).
 */

import type { Transition, Variants } from 'motion/react'

/** Browser check — safe on SSR (falls through to "no preference"). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Soft "out" ease used on almost every enter animation in the app. */
export const EASE_OUT: Transition['ease'] = [0.22, 1, 0.36, 1]

/** Page-to-page cross-fade. Slight downward drift so the eye tracks
 *  the page arriving rather than the route flickering. 150ms keeps
 *  navigation feeling snappy on mid-range phones. */
export const pageFade: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.15, ease: EASE_OUT } },
  exit: { opacity: 0, y: -2, transition: { duration: 0.1, ease: EASE_OUT } },
}

/** Reduced-motion version of `pageFade` — no movement, still a
 *  microscopic opacity cue so the DOM swap is visible to sighted
 *  users without triggering vestibular discomfort. */
export const pageFadeReduced: Variants = {
  initial: { opacity: 0.001 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0.999, transition: { duration: 0 } },
}

/** Hover lift for clickable cards — 1px y-translate + soft shadow. */
export const cardHover = {
  rest: { y: 0, boxShadow: '0 0 0 0 rgba(15,23,42,0)' },
  hover: { y: -1, boxShadow: '0 4px 14px rgba(15,23,42,0.06)' },
  tap: { y: 0, scale: 0.99 },
}

/** Subtle press scale for primary buttons / chips. */
export const pressScale: Variants = {
  rest: { scale: 1 },
  tap: { scale: 0.96 },
}

/** Item row enter — used inside `AnimatePresence` for list items. */
export const itemEnter: Variants = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } },
}

/** Use like: <motion.div variants={useMotionVariants(pageFade)} … />
 *  — returns the reduced variant if the user prefers reduced motion. */
export function pickVariants<T>(full: T, reduced: T): T {
  return prefersReducedMotion() ? reduced : full
}
