'use client';

import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export function Progress({ className, value = 0, ...props }:
React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, Number(value)))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
