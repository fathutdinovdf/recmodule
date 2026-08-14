'use client';

/* Плановая дата работ при принятии рекомендации: только вперёд — назначить
 * работы на прошедший день нельзя. Всё остальное — общий DatePicker.
 */

import { addYears, endOfYear, startOfToday } from 'date-fns';
import { DatePicker } from './DatePicker';

export function PlannedDatePicker({ name = 'planned' }: { name?: string }) {
  const сегодня = startOfToday();

  return (
    <DatePicker
      name={name}
      label="Плановая дата работ"
      disabled={{ before: сегодня }}
      startMonth={сегодня}
      endMonth={endOfYear(addYears(сегодня, 5))}
    />
  );
}
