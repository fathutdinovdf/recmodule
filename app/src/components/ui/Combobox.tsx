'use client';

/* Поисковый выбор собран по композиции shadcn Command + Popover, но сохраняет
 * контракт обычного поля формы. Выбранное значение лежит в скрытом input и
 * поэтому без клиентской прослойки приходит в server action через FormData.
 * Внешний вид намеренно общий с Select: пользователь не должен замечать, какой
 * из списков стал поисковым, пока не начнёт печатать запрос.
 */

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from './Button';
import { Icon } from '../Icons';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from './command';
import type { SelectOption } from './Select';

export function Combobox({
  name,
  options,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = 'Выберите значение',
  emptyText = 'Ничего не найдено',
  required,
  disabled,
  invalid,
  id,
  ariaDescribedBy,
  searchable = false,
  searchPlaceholder = 'Поиск…',
}: {
  name: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  ariaDescribedBy?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const value = controlledValue ?? uncontrolledValue;
  const selected = options.find((option) => option.value === value);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [dialogContainer, setDialogContainer] = React.useState<HTMLElement | null>(null);

  /* Внутри окна (Dialog) список надо портализовать в само окно, а не в body —
   * иначе колесо мыши/тачпад над списком глушит блокировка фоновой прокрутки
   * Radix Dialog, которая не признаёт портал в body «своим». Ищем контейнер
   * один раз после монтирования: до него ref ещё пуст. */
  React.useEffect(() => {
    setDialogContainer(triggerRef.current?.closest('[role="dialog"]') as HTMLElement ?? null);
  }, []);

  function select(nextValue: string) {
    if (controlledValue === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          aria-invalid={invalid}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          data-placeholder={selected ? undefined : ''}
          className="inp combo__inp h-auto justify-start rounded-[var(--corner-radius-component)] px-[var(--item-padding-horizontal-m)] py-[var(--item-padding-vertical-s)] font-normal shadow-none hover:bg-background"
        >
          <span className="combo__txt">{selected?.label ?? placeholder}</span>
          {selected?.note && <span className="combo__note">{selected.note}</span>}
          <span className="combo__caret"><Icon id="caret" /></span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        container={dialogContainer}
        className="combo__menu w-[var(--radix-popover-trigger-width)]"
      >
        <Command shouldFilter={searchable}>
          {searchable && <CommandInput placeholder={searchPlaceholder} autoFocus />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                keywords={[option.label, option.note].filter((keyword): keyword is string => Boolean(keyword))}
                disabled={option.disabled}
                data-current={option.value === value ? '' : undefined}
                onSelect={() => select(option.value)}
              >
                <span className="combo__txt">{option.label}</span>
                {option.note && <span className="combo__note">{option.note}</span>}
                <Check
                  aria-hidden="true"
                  className={`combo__tick ${option.value === value ? '' : 'invisible'}`}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
