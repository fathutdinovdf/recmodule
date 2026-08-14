'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { addYears, endOfYear, format, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from './Button';
import { Calendar } from './Calendar';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export function PlannedDatePicker({ name = 'planned' }: { name?: string }) {
  const [selected, setSelected] = React.useState<Date>();
  const [open, setOpen] = React.useState(false);
  const сегодня = startOfToday();

  return (
    <>
      <input type="hidden" name={name} value={selected ? format(selected, 'yyyy-MM-dd') : ''} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-[240px] justify-start text-left font-normal"
            aria-label={selected
              ? `Плановая дата работ: ${format(selected, 'd MMMM yyyy', { locale: ru })}`
              : 'Выбрать плановую дату работ'}
          >
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {selected ? format(selected, 'dd.MM.yyyy') : <span className="text-muted-foreground">Выберите дату</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="border-0 bg-transparent p-0 shadow-none">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            disabled={{ before: startOfToday() }}
            locale={ru}
            captionLayout="dropdown"
            startMonth={сегодня}
            endMonth={endOfYear(addYears(сегодня, 5))}
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
