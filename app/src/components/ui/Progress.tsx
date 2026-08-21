'use client';

/* Заполнение — пружиной `motion`, как у остальных Radix-обёрток в проекте
 * (RadioGroupItem, Checkbox), а не CSS-переходом: см.
 * animate-ui.com/docs/components/radix/progress. */

import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

export function Progress({ className, value = 0, ...props }:
React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const процент = Math.max(0, Math.min(100, Number(value)));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <motion.div
          data-slot="progress-indicator"
          className="h-full w-full flex-1 bg-primary"
          initial={false}
          animate={{ x: `-${100 - процент}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30, bounce: 0, restDelta: 0.01 }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}
