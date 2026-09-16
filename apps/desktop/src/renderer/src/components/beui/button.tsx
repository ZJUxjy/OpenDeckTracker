// Adapted from https://beui.dev/r/button (MIT; see LICENSE).
// Retain native button semantics/ref forwarding for Radix asChild composition.
import { forwardRef } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { clsx } from 'clsx';
import { PRESS_SPRING } from './motion';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'plain' | 'primary' | 'secondary' | 'ghost';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'plain', disabled, children, ...props },
  ref,
) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type="button"
      {...props}
      disabled={disabled}
      whileTap={reduce || disabled ? {} : { scale: 0.97 }}
      transition={PRESS_SPRING}
      className={clsx('beui-button', `beui-button-${variant}`, className)}
    >
      {children}
    </motion.button>
  );
});
