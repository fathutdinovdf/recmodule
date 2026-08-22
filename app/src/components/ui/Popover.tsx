'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/* Заголовочная тройка shadcn. У Radix её нет — там Popover без собственной
 * структуры, — но окно с полями без заголовка не объясняет, что именно
 * правишь. Title/Description связаны с содержимым через aria-* вручную:
 * Radix, в отличие от Dialog, сам их не подхватывает. */
export function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-header"
               className={cn('flex flex-col gap-1 border-b border-border px-4 py-3', className)}
               {...props} />;
}

export function PopoverTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-title"
               className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="popover-description"
             className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function PopoverContent({
  className, align = 'start', sideOffset = 6, container, ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Куда портализовать содержимое. По умолчанию — document.body (как раньше).
   * Комбобоксы внутри Dialog передают сюда контейнер самого диалога: колёсико
   * мыши/тачпад над списком, портализованным в body, глушится блокировкой
   * фоновой прокрутки Radix Dialog (react-remove-scroll не считает список
   * своим, раз тот физически не внутри DOM-поддерева диалога) — работали
   * только клавиатура и программная прокрутка. Портал внутри диалога решает
   * это без выключения самой блокировки. */
  container?: HTMLElement | null;
}) {
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-auto origin-[var(--radix-popover-content-transform-origin)] rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
