"use client"

/* Тот же приём Radix + Framer, что у Dialog (animate-ui/primitives/radix/dialog.tsx):
 * контент остаётся смонтированным (forceMount), а появление/исчезновение ведёт
 * AnimatePresence, а не CSS-классы tw-animate-css — движение пружиной вместо
 * линейного зума. */

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { AnimatePresence, motion, type Transition } from "motion/react"

import { cn } from "@/lib/cn"
import { useControlledState } from "@/hooks/use-controlled-state"
import { getStrictContext } from "@/lib/get-strict-context"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root>
type TooltipContextType = { isOpen: boolean; setIsOpen: TooltipProps['onOpenChange'] };
const [TooltipContextProvider, useTooltip] = getStrictContext<TooltipContextType>('TooltipContext');

function Tooltip(props: TooltipProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open, defaultValue: props.defaultOpen, onChange: props.onOpenChange,
  });
  return (
    <TooltipContextProvider value={{ isOpen, setIsOpen }}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} onOpenChange={setIsOpen} />
    </TooltipContextProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipContentProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Content>, 'asChild' | 'forceMount'
> & { transition?: Transition };

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  transition = { type: 'spring', stiffness: 300, damping: 25, bounce: 0 },
  ...props
}: TooltipContentProps) {
  const { isOpen } = useTooltip();
  return (
    <AnimatePresence>
      {isOpen && (
        <TooltipPrimitive.Portal forceMount data-slot="tooltip-portal">
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            asChild
            forceMount
            sideOffset={sideOffset}
            {...props}
          >
            <motion.div
              key="tooltip-content"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={transition}
              className={cn(
                "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background",
                className
              )}
            >
              {children}
              <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
