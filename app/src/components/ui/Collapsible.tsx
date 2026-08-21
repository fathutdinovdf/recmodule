'use client';

/* Прежде — голый реэкспорт Radix без анимации. Раскрытие теперь плавно
 * тянется по высоте содержимого через `useAutoHeight` (тот же приём, что
 * уже стоит в animate-ui/primitives/effects/auto-height.tsx), а не
 * появляется/исчезает мгновенно, как раньше у <details>.
 *
 * Radix даёт data-state только на DOM-узле Content, а величину анимации
 * (открыто/закрыто) нужно знать заранее в JS — поэтому Root держит открытое
 * состояние сам и раздаёт его контекстом, вместо того чтобы читать атрибут
 * из готового узла.
 */

import * as React from 'react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { motion } from 'motion/react';
import { useAutoHeight } from '@/hooks/use-auto-height';
import { cn } from '@/lib/cn';

const ОткрытоКонтекст = React.createContext(false);

function Collapsible({ open, defaultOpen, onOpenChange, ...props }:
React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [собственное, setСобственное] = React.useState(defaultOpen ?? false);
  const открыто = open ?? собственное;
  return (
    <ОткрытоКонтекст.Provider value={открыто}>
      <CollapsiblePrimitive.Root
        open={open} defaultOpen={defaultOpen}
        onOpenChange={(next) => { setСобственное(next); onOpenChange?.(next); }}
        {...props}
      />
    </ОткрытоКонтекст.Provider>
  );
}

const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

function CollapsibleContent({ className, children, ...props }:
React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  const открыто = React.useContext(ОткрытоКонтекст);
  const { ref, height } = useAutoHeight<HTMLDivElement>([открыто]);

  return (
    <CollapsiblePrimitive.Content forceMount asChild {...props}>
      <motion.div
        style={{ overflow: 'hidden' }}
        initial={false}
        animate={{ height: открыто ? height : 0, opacity: открыто ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0, restDelta: 0.01 }}
        className={cn(className)}
        aria-hidden={!открыто}
        inert={!открыто}
      >
        <div ref={ref}>{children}</div>
      </motion.div>
    </CollapsiblePrimitive.Content>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
