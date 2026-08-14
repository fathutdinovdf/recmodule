import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const itemVariants = cva(
  'group/item flex flex-wrap items-center rounded-md border border-transparent text-sm transition-colors outline-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border-border',
        muted: 'bg-muted/50',
      },
      size: {
        default: 'gap-4 p-4',
        sm: 'gap-2.5 px-4 py-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Item({ className, variant, size, ...props }:
React.ComponentProps<'div'> & VariantProps<typeof itemVariants>) {
  return (
    <div
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="item-content" className={cn('flex flex-1 flex-col gap-1', className)} {...props} />;
}

export function ItemTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      className={cn('text-sm leading-snug font-medium', className)}
      {...props}
    />
  );
}

export function ItemDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="item-description"
      className={cn('text-sm leading-normal font-normal text-muted-foreground', className)}
      {...props}
    />
  );
}
