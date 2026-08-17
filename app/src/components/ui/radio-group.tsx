'use client';

/* shadcn RadioGroup поверх radix-ui, индикатор — с пружинной анимацией
 * (появление/исчезновение точки и лёгкий отклик на клик), как у
 * animate-ui.com/docs/components/radix/radio-group. Radix даёт только
 * мгновенный css-переход через data-state, поэтому анимацией управляет
 * `motion`, а какой пункт отмечен — общий контекст группы: у RadioGroupItem
 * своего состояния нет, а Radix не отдаёт его наружу render-пропом.
 *
 * Radix сам подставляет скрытый input с именем группы, поэтому переключатель
 * приезжает в server action обычным полем формы и работает там же, где
 * работают остальные поля карточки.
 */

import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { motion, AnimatePresence } from 'motion/react';
import { CircleIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const ТекущееЗначение = React.createContext<string | undefined>(undefined);

function RadioGroup({ className, value, defaultValue, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  const [собственное, setСобственное] = React.useState(defaultValue);
  return (
    <ТекущееЗначение.Provider value={value ?? собственное}>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        className={cn('grid gap-3', className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => { setСобственное(next); props.onValueChange?.(next); }}
        {...props}
      />
    </ТекущееЗначение.Provider>
  );
}

const MotionItem = motion.create(RadioGroupPrimitive.Item);

/* `motion.create` подмешивает свои обработчики жестов (onDrag и т.п.), которые
   типами конфликтуют с одноимёнными DOM-пропами кнопки — пересечение не нужно
   ни там, ни там, поэтому просто исключаем их из входного типа. */
type RadioGroupItemProps = Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
>;

function RadioGroupItem({ className, value, ...props }: RadioGroupItemProps) {
  const отмечено = React.useContext(ТекущееЗначение) === value;

  return (
    <MotionItem
      data-slot="radio-group-item"
      value={value}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input shadow-xs outline-none',
        'transition-colors duration-200',
        'data-[state=checked]:border-primary',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" asChild forceMount>
        <span className="relative flex items-center justify-center size-full">
          <AnimatePresence>
            {отмечено && (
              <motion.span
                className="absolute top-1/2 left-1/2 flex items-center justify-center"
                style={{ translateX: '-50%', translateY: '-50%' }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              >
                <CircleIcon className="size-2 fill-primary stroke-none" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </RadioGroupPrimitive.Indicator>
    </MotionItem>
  );
}

export { RadioGroup, RadioGroupItem };
