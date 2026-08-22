'use client';

/* Переключатель полномочия.
 *
 * Тот же приём, что у Checkbox и RadioGroupItem: поведение и доступность от
 * Radix, движение — пружиной `motion`, а не css-переходом. Ползунок едет
 * layout-анимацией, поэтому расстояние не прописано числом и не разъедется,
 * если размеры переключателя однажды поменяются.
 *
 * Почему переключатель, а не флажок. Флажок — это «отметить в списке», его
 * читают пачкой и подтверждают кнопкой. Полномочие включают по одному, оно
 * применяется сразу и имеет состояние «сейчас включено» — это ровно смысл
 * переключателя. Пара «флажок + Сохранить» на экране прав означала бы, что
 * человек не знает, действует уже выданное право или ещё нет.
 */

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

type SwitchProps = Omit<
  React.ComponentProps<typeof SwitchPrimitive.Root>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent p-[2px]',
        'bg-input transition-colors outline-none',
        'data-[state=checked]:bg-primary',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn(
            'block size-[14px] rounded-full bg-background shadow-xs',
            /* Положение задаётся порядком в строке, а не сдвигом: ползунок
               прыгает от края к краю, а layout-анимация сама рисует путь. */
            'data-[state=checked]:ml-auto',
          )}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}
