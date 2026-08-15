'use client';

/* Форма фиксации реализации.
 *
 * Клиентская ровно из-за одного: поле «что не выполнено» показывается только
 * при частичной реализации. Всё остальное — обычная форма обычного POST,
 * валидация целиком на сервере.
 *
 * Показывается окном действия, поэтому своего заголовка и рамки у неё нет:
 * и то, и другое даёт окно. Подвал — DialogFooter, чтобы «Отмена» закрывала
 * окно средствами Radix, заодно с Esc и кликом мимо.
 */

import * as React from 'react';
import { startOfToday, subYears } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';

export function ФормаФиксации({ action, ошибка, полнота: выбранная }: {
  action: (form: FormData) => void | Promise<void>;
  ошибка?: string;
  /** Полнота, выбранная до неудачной отправки: возвращается в адресе. */
  полнота?: string;
}) {
  const [полнота, setПолнота] = React.useState(выбранная === 'partial' ? 'partial' : 'full');
  const сегодня = startOfToday();

  return (
    /* Класс `form` не нужен: форма живёт в окне действия, у которого свои
       отступы, а `form` добавляет собственную рамку и фон. */
    <form action={action}>
      <FieldGroup>
        {/* Строка из двух равных полей, как `.form__row` в макете: поля делят
            ширину поровну и переносятся на узком экране. */}
        <Field orientation="horizontal" className="flex-wrap items-start gap-[var(--block-gap-default)]">
          <Field className="flex-1 basis-[220px]">
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

          <Field className="flex-1 basis-[220px]">
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
        <div className="form__hint">
          Дата — это сутки, с которых телеметрия показывает новый режим, а не момент нажатия
          кнопки: изменение можно заметить и через день-другой. От этой даты отсчитываются
          90 суток окна.
        </div>

        {полнота === 'partial' && (
          <Field>
            <FieldLabel htmlFor="compl-note">
              Что не выполнено <span className="text-muted-foreground">обязательно при частичной реализации</span>
            </FieldLabel>
            <Textarea id="compl-note" name="completeness_note" rows={3}
                      placeholder="Например: частота выведена не до рекомендованной, ревизия устьевой арматуры не проводилась." />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="fact-note">
            Комментарий <span className="text-muted-foreground">необязательно</span>
          </FieldLabel>
          <Textarea id="fact-note" name="note" rows={2}
                    placeholder="Что изменилось в режиме и почему дата именно такая." />
        </Field>
      </FieldGroup>

      {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}

      <DialogFooter className="mt-4">
        <SubmitButton pendingText="Фиксирую…">Зафиксировать реализацию</SubmitButton>
        <DialogClose asChild>
          <Button type="button" variant="outline">Отмена</Button>
        </DialogClose>
      </DialogFooter>
    </form>
  );
}
