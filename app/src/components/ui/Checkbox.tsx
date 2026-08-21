'use client';

/* Тот же приём, что у RadioGroupItem (radio-group.tsx) и по той же причине,
 * animate-ui.com/docs/components/radix/checkbox: Radix отдаёт только
 * мгновенный css-переход через data-state, отметку рисует пружина `motion`.
 * Radix не отдаёт checked наружу render-пропом, поэтому дублируем его в
 * локальном состоянии, когда компонент неконтролируемый, — состояние нужно
 * JS-анимации иконки (AnimatePresence), а заливка идёт обычными
 * `data-[state=checked]:` классами. */

import * as React from 'react';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/cn';

const MotionRoot = motion.create(CheckboxPrimitive.Root);

type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
>;

export function Checkbox({ className, checked, defaultChecked, onCheckedChange, ...props }: CheckboxProps) {
  const [собственное, setСобственное] = React.useState<boolean | 'indeterminate'>(defaultChecked ?? false);
  const отмечено = checked ?? собственное;

  return (
    <MotionRoot
      data-slot="checkbox"
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(next) => { setСобственное(next); onCheckedChange?.(next); }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-border bg-background shadow-xs outline-none transition-colors',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50', className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator asChild forceMount>
        <span className="relative flex items-center justify-center size-full">
          <AnimatePresence>
            {отмечено && (
              <motion.span
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              >
                {отмечено === 'indeterminate'
                  ? <MinusIcon className="size-3 shrink-0" strokeWidth={3} />
                  : <CheckIcon className="size-3 shrink-0" strokeWidth={3} />}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </CheckboxPrimitive.Indicator>
    </MotionRoot>
  );
}
