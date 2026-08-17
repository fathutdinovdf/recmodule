'use client';

/* Radix Dialog с жизненным циклом Animate UI.
 *
 * Основа — официальный primitives-radix-dialog. Flip уменьшен с 20° и scale
 * 0.8 до 6° и 0.96: шестнадцать рабочих окон открываются часто, и движение
 * должно показывать появление слоя, а не превращать подтверждение в аттракцион.
 */

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { useControlledState } from '@/hooks/use-controlled-state';
import { getStrictContext } from '@/lib/get-strict-context';

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;
type DialogContextType = {
  isOpen: boolean;
  setIsOpen: DialogProps['onOpenChange'];
};

const [DialogProvider, useDialog] = getStrictContext<DialogContextType>('DialogContext');

function Dialog(props: DialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });
  return (
    <DialogProvider value={{ isOpen, setIsOpen }}>
      <DialogPrimitive.Root data-slot="dialog" {...props} onOpenChange={setIsOpen} />
    </DialogProvider>
  );
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;
function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogPortalProps = Omit<React.ComponentProps<typeof DialogPrimitive.Portal>, 'forceMount'>;
function DialogPortal(props: DialogPortalProps) {
  const { isOpen } = useDialog();
  return (
    <AnimatePresence>
      {isOpen && <DialogPrimitive.Portal data-slot="dialog-portal" forceMount {...props} />}
    </AnimatePresence>
  );
}

type DialogOverlayProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Overlay>, 'forceMount' | 'asChild'
> & HTMLMotionProps<'div'>;

function DialogOverlay({
  transition = { duration: 0.16, ease: [0.2, 0.8, 0.3, 1] },
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" asChild forceMount>
      <motion.div
        key="dialog-overlay"
        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        animate={{ opacity: 1, backdropFilter: 'blur(2px)' }}
        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogFlipDirection = 'top' | 'bottom' | 'left' | 'right';
type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>, 'forceMount' | 'asChild'
> & HTMLMotionProps<'div'> & { from?: DialogFlipDirection };

function DialogContent({
  from = 'top',
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  transition = { type: 'spring', stiffness: 320, damping: 30, bounce: 0 },
  ...props
}: DialogContentProps) {
  const initialRotation = from === 'bottom' || from === 'left' ? '6deg' : '-6deg';
  const rotateAxis = from === 'top' || from === 'bottom' ? 'rotateX' : 'rotateY';
  const transform = (rotation: string, scale: number) =>
    `perspective(700px) ${rotateAxis}(${rotation}) scale(${scale})`;
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
    >
      <motion.div
        key="dialog-content"
        data-slot="dialog-content"
        ref={contentRef}
        initial={{ opacity: 0, filter: 'blur(2px)', transform: transform(initialRotation, 0.96) }}
        animate={{ opacity: 1, filter: 'blur(0px)', transform: transform('0deg', 1) }}
        exit={{ opacity: 0, filter: 'blur(2px)', transform: transform(initialRotation, 0.96) }}
        transition={transition}
        /* Пружина асимптотически подходит к rotate 0/scale 1, не попадая в них
           точно: остаточные доли градуса держат слой в 3D-композиции, и текст
           с картинками внутри окна рендерятся мимо пиксельной сетки — отсюда
           смазанность после открытия. Дообнуляем transform и filter вручную,
           когда анимация открытия закончилась. */
        onAnimationComplete={() => {
          /* Срабатывает и на закрытии тоже — элемент к этому моменту либо
             виден с чистым transform, либо уже уходит из DOM, так что сброс
             безвреден в обоих случаях. */
          if (contentRef.current) {
            contentRef.current.style.transform = 'none';
            contentRef.current.style.filter = 'none';
          }
        }}
        {...props}
      />
    </DialogPrimitive.Content>
  );
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;
function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogHeaderProps = React.ComponentProps<'div'>;
function DialogHeader(props: DialogHeaderProps) {
  return <div data-slot="dialog-header" {...props} />;
}

type DialogFooterProps = React.ComponentProps<'div'>;
function DialogFooter(props: DialogFooterProps) {
  return <div data-slot="dialog-footer" {...props} />;
}

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;
function DialogTitle(props: DialogTitleProps) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

type DialogDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>;
function DialogDescription(props: DialogDescriptionProps) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent,
  DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  type DialogProps, type DialogTriggerProps, type DialogPortalProps,
  type DialogCloseProps, type DialogOverlayProps, type DialogContentProps,
  type DialogHeaderProps, type DialogFooterProps, type DialogTitleProps,
  type DialogDescriptionProps, type DialogContextType, type DialogFlipDirection,
};
