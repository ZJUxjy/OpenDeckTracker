// Adapted from https://beui.dev/r/tabs and /r/button (MIT; see LICENSE).
export const SELECTION_SPRING = {
  type: 'spring',
  stiffness: 170,
  damping: 30,
  mass: 1.2,
} as const;

export const PRESS_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;
