import * as React from 'react';
import { cn } from '@/lib/cn';

/* Геометрия и состояния соответствуют shadcn Input, цветовые utility-классы
 * семантические — значения приходят из моста shadcn.css к токенам ВМАП.
 * Отличие от shadcn одно: числовые поля выравниваются вправо (`text-right`
 * задаётся вызывающим), потому что во всей карточке числа стоят по правому
 * краю и разнобой в форме читался бы как другой тип величины. */
export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 py-1 font-sans text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35',
        'aria-invalid:border-[var(--status-error)] aria-invalid:ring-[3px] aria-invalid:ring-[var(--status-error)]/20',
        className,
      )}
      {...props}
    />
  );
}
