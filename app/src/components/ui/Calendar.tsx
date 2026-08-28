'use client';

import * as React from 'react';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { DayPicker, getDefaultClassNames, type DropdownProps } from 'react-day-picker';
import { cn } from '@/lib/cn';

function CalendarDropdown({ options = [], value, onChange, disabled, 'aria-label': ariaLabel }: DropdownProps) {
  const выбранное = value === undefined ? undefined : String(value);

  return (
    <SelectPrimitive.Root
      value={выбранное}
      disabled={disabled}
      onValueChange={(next) => {
        /* DayPicker ожидает событие нативного select. Radix отдаёт значение,
           поэтому адаптер воспроизводит только используемую библиотекой часть
           события, не возвращая календарю нативный список операционной системы. */
        onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className="inline-flex h-8 items-center justify-center rounded-sm border border-transparent bg-transparent px-0.5 text-sm font-semibold capitalize text-foreground outline-none hover:bg-accent focus-visible:shadow-[var(--focus-component)]"
      >
        <SelectPrimitive.Value />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <SelectPrimitive.Viewport className="max-h-60 overflow-y-auto">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={String(option.value)}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-2 text-sm capitalize outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex size-4 items-center justify-center text-primary">
                  <CheckIcon className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** Календарная сетка shadcn поверх react-day-picker. Оформление оставлено в
 * Tailwind-классах компонента: это как раз тот изолированный элемент, на
 * котором проверяем визуальную систему shadcn, не переписывая карточку.
 */
export function Calendar({
  className, classNames, showOutsideDays = true, ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('w-fit bg-popover p-3', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col', defaults.months),
        month: cn('flex w-full flex-col gap-4', defaults.month),
        nav: cn('absolute inset-x-0 top-0 flex items-center justify-between', defaults.nav),
        button_previous: cn(
          'inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground outline-none hover:bg-accent focus-visible:shadow-[var(--focus-component)]',
          defaults.button_previous,
        ),
        button_next: cn(
          'inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground outline-none hover:bg-accent focus-visible:shadow-[var(--focus-component)]',
          defaults.button_next,
        ),
        month_caption: cn('flex h-8 items-center justify-center px-9', defaults.month_caption),
        dropdowns: cn('flex h-8 items-center justify-center gap-1', defaults.dropdowns),
        dropdown_root: cn('relative', defaults.dropdown_root),
        dropdown: cn('sr-only', defaults.dropdown),
        caption_label: cn('text-sm font-medium capitalize text-foreground', defaults.caption_label),
        month_grid: cn('w-full border-collapse', defaults.month_grid),
        weekdays: cn('flex gap-1', defaults.weekdays),
        weekday: cn('w-8 text-center text-xs font-normal text-muted-foreground', defaults.weekday),
        week: cn('mt-1 flex w-full gap-1', defaults.week),
        day: cn('relative size-8 p-0 text-center', defaults.day),
        day_button: cn(
          'inline-flex size-8 appearance-none items-center justify-center rounded-md border border-transparent bg-transparent text-sm font-normal text-foreground shadow-none outline-none hover:bg-accent focus-visible:shadow-[var(--focus-component)]',
          defaults.day_button,
        ),
        selected: cn('[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary', defaults.selected),
        today: cn('[&>button]:border-ring [&>button]:font-medium', defaults.today),
        outside: cn('[&>button]:text-muted-foreground [&>button]:opacity-50', defaults.outside),
        disabled: cn('[&>button]:cursor-not-allowed [&>button]:text-muted-foreground [&>button]:opacity-35', defaults.disabled),
        hidden: cn('invisible', defaults.hidden),
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: ({ orientation, className: iconClass, ...iconProps }) =>
          orientation === 'left'
            ? <ChevronLeftIcon className={cn('size-4', iconClass)} {...iconProps} />
            : <ChevronRightIcon className={cn('size-4', iconClass)} {...iconProps} />,
      }}
      {...props}
    />
  );
}
