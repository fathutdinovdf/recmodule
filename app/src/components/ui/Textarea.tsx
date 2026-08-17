import * as React from 'react';
import { cn } from '@/lib/cn';

/* Геометрия и состояния соответствуют shadcn Textarea. Цветовые utility-классы
 * семантические: их значения приходят из моста shadcn.css к токенам ВМАП. */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-sans text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35',
        'aria-invalid:border-[var(--status-error)] aria-invalid:ring-[3px] aria-invalid:ring-[var(--status-error)]/20',
        className,
      )}
      {...props}
    />
  );
}
