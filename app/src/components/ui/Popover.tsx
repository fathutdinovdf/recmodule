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
