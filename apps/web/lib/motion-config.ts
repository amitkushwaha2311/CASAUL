/**
 * CAUSAL — Motion configuration.
 *
 * Centralised animation variants + timing constants that mirror the
 * CSS design-token values in globals.css. Import these in any component
 * that uses the `motion` package so timings stay consistent.
 *
 * All variants respect `prefers-reduced-motion` — callers must pass
 * `initial={false}` when the `REDUCED_MOTION` flag is true, which
 * collapses entrance animations to an instant render.
 */

/** True when the user has requested reduced motion in their OS settings. */
export function getReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Duration constants (match CSS tokens) ─────────────────────────────────────
export const DURATION = {
  fast: 0.12,   // --duration-fast:   120ms
  normal: 0.22, // --duration-normal: 220ms
  slow: 0.4,    // --duration-slow:   400ms
} as const;

// ── Easing (matches --ease-default: cubic-bezier(0.16, 1, 0.3, 1)) ───────────
export const EASE_DEFAULT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ── Reusable Variants ─────────────────────────────────────────────────────────

/**
 * Fade + translate-up entrance. Use as:
 *   <motion.div variants={fadeUp} initial="hidden" animate="visible" />
 */
export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE_DEFAULT },
  },
};

/**
 * Fade + translate-right entrance (left-to-right slide).
 */
export const fadeRight = {
  hidden: { opacity: 0, x: -14 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.slow, ease: EASE_DEFAULT },
  },
};

/**
 * Fade + translate-left entrance (right-to-left slide).
 */
export const fadeLeft = {
  hidden: { opacity: 0, x: 14 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.slow, ease: EASE_DEFAULT },
  },
};

/**
 * Pure fade entrance (no translate).
 */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION.normal, ease: EASE_DEFAULT },
  },
};

/**
 * Container variant that staggers child animations.
 * Child elements must use `staggerItem` (or any variant).
 *
 * @param staggerSecs - delay between each child (default 0.07s)
 * @param delayBeforeStart - optional initial delay before first child
 */
export function staggerContainer(staggerSecs = 0.07, delayBeforeStart = 0) {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerSecs,
        delayChildren: delayBeforeStart,
      },
    },
  };
}

/**
 * Standard stagger child item — fade + up. Pair with `staggerContainer`.
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE_DEFAULT },
  },
};

/**
 * Slide-down from above (for banners / toasts that appear at the top).
 */
export const slideDown = {
  hidden: { opacity: 0, y: -12, scaleY: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    transition: { duration: DURATION.normal, ease: EASE_DEFAULT },
  },
  exit: {
    opacity: 0,
    y: -8,
    scaleY: 0.96,
    transition: { duration: DURATION.fast, ease: EASE_DEFAULT },
  },
};

/**
 * Reduced-motion safe transition — zero duration, no translate.
 * Use when `getReducedMotion()` is true.
 */
export const instantVariant = {
  hidden: { opacity: 1, x: 0, y: 0, scaleY: 1, scaleX: 1 },
  visible: { opacity: 1, x: 0, y: 0, scaleY: 1, scaleX: 1 },
  exit: { opacity: 1 },
};
