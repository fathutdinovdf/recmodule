'use client';

/* Форма фиксации реализации.
 *
 * Клиентская ровно из-за одного: поле «что не выполнено» показывается только
 * при частичной реализации. Всё остальное — обычная форма обычного POST,
 * валидация целиком на сервере, и без JavaScript форма отправится тоже (поле
 * невыполненного тогда просто не появится, а сервер его и потребует).
 */

import * as React from 'react';
import Link from 'next/link';
import { startOfToday, subYears } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';

export function ФормаФиксации({ action, ошибка }: {
  action: (form: FormData) => void | Promise<void>;
  ошибка?: string;
}) {
  const [полнота, setПолнота] = React.useState('full');
  const сегодня = startOfToday();

  return (
    <form className="form" action={action}>
      <div className="form__h">Фиксация реализации</div>

      <FieldGroup>
        <Field orientation="horizontal" className="items-start gap-[var(--block-gap-default)]">
          <Field className="w-auto">
            <FieldLabel htmlFor="fact-date">Дата фактической реализации</FieldLabel>
            <DatePicker
              id="fact-date"
              name="fact_date"
              label="Дата фактической реализации"
              defaultValue={сегодня}
              disabled={{ after: сегодня }}
              startMonth={subYears(сегодня, 2)}
              endMonth={сегодня}
            />
          </Field>

          <Field className="w-auto">
            <FieldLabel>Полнота реализации</FieldLabel>
            <RadioGroup
              name="completeness"
              value={полнота}
              onValueChange={setПолнота}
              className="grid-flow-col justify-start gap-[var(--group-gap-m)] pt-2"
            >
              <FieldLabel htmlFor="compl-full" className="font-normal">
                <RadioGroupItem id="compl-full" value="full" />
                Полностью
              </FieldLabel>
              <FieldLabel htmlFor="compl-partial" className="font-normal">
                <RadioGroupItem id="compl-partial" value="partial" />
                Частично
              </FieldLabel>
            </RadioGroup>
          </Field>
        </Field>
      </FieldGroup>

      <div className="form__hint">
        Дата — это сутки, с которых телеметрия показывает новый режим, а не момент нажатия
        кнопки: изменение можно заметить и через день-другой. От этой даты отсчитываются
        90 суток окна.
      </div>

      {полнота === 'partial' && (
        <Field className="mt-[var(--group-gap-m)]">
          <FieldLabel htmlFor="compl-note">
            Что не выполнено <span className="text-muted-foreground">обязательно при частичной реализации</span>
          </FieldLabel>
          <Textarea id="compl-note" name="completeness_note" rows={3}
                    placeholder="Например: частота выведена не до рекомендованной, ревизия устьевой арматуры не проводилась." />
        </Field>
      )}

      <Field className="mt-[var(--group-gap-m)]">
        <FieldLabel htmlFor="fact-note">
          Комментарий <span className="text-muted-foreground">необязательно</span>
        </FieldLabel>
        <Textarea id="fact-note" name="note" rows={2}
                  placeholder="Что изменилось в режиме и почему дата именно такая." />
      </Field>

      <div className="form__hint">
        Фиксация в тот же момент открывает окно подтверждения эффекта и уведомляет Заказчика.
        Заказчик вправе оспорить дату, пока окно не закрыто.
      </div>

      {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}

      <div className="form__btns">
        <Button type="submit">Зафиксировать реализацию</Button>
        <Button variant="outline" asChild><Link href="?">Отмена</Link></Button>
      </div>
    </form>
  );
}
