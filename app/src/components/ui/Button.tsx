import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/* Каркас компонента — shadcn Button: cva-варианты, размеры и asChild для
 * ссылок. Success и warning добавлены предметно: три решения имеют устойчивую
 * семантику ВМАП, сводить их к одному синему primary было бы потерей смысла.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border text-sm font-medium no-underline transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-105',
        success: 'bg-success text-success-foreground hover:brightness-95',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-95',
        warning: 'bg-warning text-warning-foreground hover:brightness-95',
        outline: 'border border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:brightness-95',
        /* У ghost рамки нет по определению: с ней «Отмена» рядом с опасной
           кнопкой перетягивает внимание на себя. */
        ghost: 'border-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { buttonVariants };
