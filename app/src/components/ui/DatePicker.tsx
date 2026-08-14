'use client';

/* Выбор даты: кнопка shadcn + календарь в поповере, значение уезжает в форму
 * скрытым полем в ISO — обычным полем обычного POST, как и всё остальное в
 * карточке.
 *
 * Компонент общий, а не «плановая дата» и «дата реализации» по отдельности:
 * различаются они только допустимым диапазоном и подписью, а вот поведение
 * календаря должно совпадать до мелочей — две разные листалки дат в одной
 * карточке читаются как две разные системы.
 */

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Matcher } from 'react-day-picker';
import { Button } from './Button';
import { Calendar } from './Calendar';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export function DatePicker({
  name,
  defaultValue,
  label,
  placeholder = 'Выберите дату',
  disabled,
  startMonth,
  endMonth,
  invalid,
  id,
}: {
  name: string;
  defaultValue?: Date;
  /** Для чего дата: попадает в подпись кнопки для чтения с экрана. */
  label: string;
  placeholder?: string;
  disabled?: Matcher | Matcher[];
  startMonth?: Date;
  endMonth?: Date;
  invalid?: boolean;
  id?: string;
}) {
  const [selected, setSelected] = React.useState<Date | undefined>(defaultValue);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <input type="hidden" name={name} value={selected ? format(selected, 'yyyy-MM-dd') : ''} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            aria-invalid={invalid}
            className="w-[240px] justify-start text-left font-normal"
            aria-label={selected
              ? `${label}: ${format(selected, 'd MMMM yyyy', { locale: ru })}`
              : `Выбрать: ${label.toLowerCase()}`}
          >
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {selected
              ? format(selected, 'dd.MM.yyyy')
              : <span className="text-muted-foreground">{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="border-0 bg-transparent p-0 shadow-none">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => { setSelected(d); if (d) setOpen(false); }}
            defaultMonth={selected}
            disabled={disabled}
            locale={ru}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            className="rounded-lg border border-border"
            formatters={{
              formatMonthDropdown: (date) => format(date, 'LLLL', { locale: ru }),
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
