// Adapted from https://beui.dev/r/switch (MIT; see LICENSE).
import { forwardRef, useState } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { clsx } from 'clsx';

interface SwitchProps extends Omit<HTMLMotionProps<'button'>, 'onChange' | 'children'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const THUMB_SPRING = { type: 'spring', stiffness: 800, damping: 80, mass: 4 } as const;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, disabled, className, ...props },
  ref,
) {
  const reduce = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  return (
    <motion.button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      className={clsx('beui-switch', className)}
      onClick={() => !disabled && onCheckedChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onBlur={() => setPressed(false)}
    >
      <motion.span
        aria-hidden="true"
        className="beui-switch-thumb"
        initial={false}
        animate={{ x: checked ? 20 : 0, scale: pressed && !disabled && !reduce ? 0.9 : 1 }}
        transition={reduce ? { duration: 0 } : THUMB_SPRING}
      />
    </motion.button>
  );
});
