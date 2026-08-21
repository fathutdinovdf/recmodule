'use client';

/* Поисковый выбор собран по композиции shadcn Command + Popover, но сохраняет
 * контракт обычного поля формы. Выбранное значение лежит в скрытом input и
 * поэтому без клиентской прослойки приходит в server action через FormData.
 * Внешний вид намеренно общий с Select: пользователь не должен замечать, какой
 * из списков стал поисковым, пока не начнёт печатать запрос.
 *
 * У поискового варианта поле-переключатель — это и есть строка поиска (как в
 * макете, `combo__inp` там всегда настоящий input). Отдельной строки поиска
 * внутри раскрытого списка нет: печатать можно сразу в поле, не открывая
 * список специально. Триггер посажен на PopoverAnchor, а не PopoverTrigger —
 * Radix-триггер переключает open по каждому клику, а клик внутри уже
 * открытого поля (переставить курсор посреди набранного запроса) не должен
 * закрывать список.
 */

import * as React from 'react';
import { Check } from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';
import { Button } from './Button';
import { Icon } from '../Icons';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './Popover';
import {
  Command, CommandEmpty, CommandItem, CommandList,
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
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const value = controlledValue ?? uncontrolledValue;
  const selected = options.find((option) => option.value === value);
  const triggerRef = React.useRef<HTMLButtonElement | HTMLInputElement>(null);
  const [dialogContainer, setDialogContainer] = React.useState<HTMLElement | null>(null);

  /* Внутри окна (Dialog) список надо портализовать в само окно, а не в body —
   * иначе колесо мыши/тачпад над списком глушит блокировка фоновой прокрутки
   * Radix Dialog, которая не признаёт портал в body «своим». Ищем контейнер
   * один раз после монтирования: до него ref ещё пуст. */
  React.useEffect(() => {
    setDialogContainer(triggerRef.current?.closest('[role="dialog"]') as HTMLElement ?? null);
  }, []);

  /* Один канал на открытие и закрытие: запрос — это черновик поиска, он не
   * должен пережить закрытие списка ничем, кроме выбора. Раскрытие всегда
   * начинается с чистого поля и полного списка — так же для клика по полю,
   * как и для набора первого символа. */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    setQuery('');
  }

  function select(nextValue: string) {
    if (controlledValue === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    handleOpenChange(false);
  }

  return (
    <Command shouldFilter={searchable}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <Popover open={open} onOpenChange={handleOpenChange}>
        {searchable ? (
          <PopoverAnchor asChild>
            <span className="combo">
              <CommandPrimitive.Input
                ref={triggerRef as React.Ref<HTMLInputElement>}
                id={id}
                aria-required={required}
                aria-invalid={invalid}
                aria-describedby={ariaDescribedBy}
                disabled={disabled}
                data-state={open ? 'open' : 'closed'}
                data-placeholder={!open && !selected ? '' : undefined}
                placeholder={placeholder}
                value={open ? query : (selected?.label ?? '')}
                onValueChange={setQuery}
                onPointerDown={(event) => {
                  /* Открытому полю клик нужен только для курсора: гасим его
                   * здесь, чтобы Radix не принял его за клик вне списка и не
                   * закрыл раскрытое поле само по себе. */
                  if (open) { event.stopPropagation(); return; }
                  setOpen(true);
                }}
                className="inp combo__inp"
              />
              <span className="combo__caret"><Icon id="caret" /></span>
            </span>
          </PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>
            <Button
              ref={triggerRef as React.Ref<HTMLButtonElement>}
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
        )}

        <PopoverContent
          container={dialogContainer}
          onOpenAutoFocus={(event) => { if (searchable) event.preventDefault(); }}
          onInteractOutside={(event) => {
            /* PopoverContent сам не закрывается от клика по PopoverTrigger —
             * но это завязано на его собственный triggerRef, который
             * заполняет только Trigger. Наш триггер сидит на Anchor (см.
             * комментарий выше), поэтому исключение приходится делать
             * вручную: без него список открывался и тут же закрывался тем
             * же кликом, которым открылся. */
            if (triggerRef.current && event.target instanceof Node && triggerRef.current.contains(event.target)) {
              event.preventDefault();
            }
          }}
          className="combo__menu w-[var(--radix-popover-trigger-width)]"
        >
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
        </PopoverContent>
      </Popover>
    </Command>
  );
}
