// beUI Tabs shared-layout indicator, adapted for navigation and filter buttons.
// https://beui.dev/r/tabs — MIT; see LICENSE.
import { useId, type ReactNode } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { SELECTION_SPRING } from './motion';

/** Isolate shared-layout IDs between independent controls and overlay panels. */
export function SelectionScope({ children }: { children: ReactNode }) {
  const id = useId();
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

export function SelectionIndicator({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  if (!active) return null;
  return (
    <motion.span
      aria-hidden="true"
      className="beui-selection-indicator"
      {...(reduce ? {} : { layoutId: 'selection' })}
      initial={false}
      transition={reduce ? { duration: 0 } : SELECTION_SPRING}
    />
  );
}
