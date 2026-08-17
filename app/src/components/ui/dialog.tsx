'use client';

/* Dialog Animate UI поверх Radix. Анимационный жизненный цикл живёт в
 * `animate-ui/primitives/radix/dialog`, а здесь остаётся внешний вид ВМАП:
 * размеры, токены, заголовки и кнопка закрытия.
 */

import * as React from 'react';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  Dialog, DialogTrigger, DialogPortal, DialogClose,
  DialogOverlay as DialogOverlayPrimitive,
  DialogContent as DialogContentPrimitive,
  DialogHeader as DialogHeaderPrimitive,
  DialogFooter as DialogFooterPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  type DialogOverlayProps, type DialogContentProps,
  type DialogHeaderProps, type DialogFooterProps,
  type DialogTitleProps, type DialogDescriptionProps,
} from '@/components/animate-ui/primitives/radix/dialog';

function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogOverlayPrimitive className={cn('fixed inset-0 z-50 bg-black/50', className)} {...props} />
  );
}

function DialogContent({ className, children, showCloseButton = true, ...props }:
DialogContentProps & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* Центрирование — flex-контейнером, а не `translate(-50%,-50%)`: у
          процентного translate дробный физический пиксель, и при сочетании
          с transform-анимацией окна (perspective/rotate/scale) итоговый слой
          то попадает на пиксельную сетку, то нет — отсюда текст, чёткость
          которого плавает при смене масштаба страницы. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <DialogContentPrimitive
          className={cn(
            'pointer-events-auto grid w-full max-w-[480px]',
            'gap-4 rounded-xl border border-border bg-background p-6 shadow-lg',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClose
              data-slot="dialog-close"
              aria-label="Закрыть"
              /* Рамку и фон снимаем явно: в registry.css у button есть свои,
                 и без сброса крестик выглядит второй кнопкой рядом с формой. */
              className="absolute top-4 right-4 rounded-sm border-0 bg-transparent p-0 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </DialogClose>
          )}
        </DialogContentPrimitive>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <DialogHeaderPrimitive className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <DialogFooterPrimitive
      className={cn('flex flex-wrap items-center gap-[var(--item-gap-horizontal-m)]', className)}
      {...props} />
  );
}

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogTitlePrimitive className={cn('text-base leading-snug font-medium text-foreground', className)}
                          {...props} />
  );
}

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogDescriptionPrimitive className={cn('text-sm leading-relaxed text-muted-foreground', className)}
                                {...props} />
  );
}

export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
};
