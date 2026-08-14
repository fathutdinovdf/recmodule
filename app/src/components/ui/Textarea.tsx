import * as React from 'react';
import { cn } from '@/lib/cn';

/* API оставлен таким же, как у shadcn Textarea, а внешний вид берётся у
 * существующего поля ВМАП: миграция компонента не должна менять форму. */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('inp inp--area', className)}
      {...props}
    />
  );
}
