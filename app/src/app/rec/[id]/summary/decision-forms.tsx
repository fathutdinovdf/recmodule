'use client';

/* Окна решения Заказчика: принять / отклонить / запросить уточнение.
 *
 * Кнопка и окно — одно целое, как в споре о базе: окно стоит в разметке
 * закрытым, кнопка на вкладке — его `trigger`, открытие мгновенное. `?form=…`
 * задаёт лишь НАЧАЛЬНУЮ открытость (присланная ссылка, перезагрузка), закрытие
 * руками убирает параметр — общий приём, `useОкноДействия`.
 *
 * Ошибка приходит ответом действия (`useActionState`), а не редиректом на
 * `?err=…`: редирект закрывал окно и перерисовывал вкладку с заглушкой.
 */

import { useActionState } from 'react';
import type { Card } from '@/db/card';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { PlannedDatePicker } from '@/components/ui/PlannedDatePicker';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { окно } from '../form-meta';
import { useОкноДействия } from '../use-dialog-state';
import { решить, type ОтветФормы } from '../actions';

const текстОшибки = (ответ: ОтветФормы) => (ответ && 'ошибка' in ответ ? ответ.ошибка : undefined);

function Отмена() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">Отмена</Button>
    </DialogClose>
  );
}

export function ОкноПринятия({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(решить.bind(null, 'accept', card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog
      {...окно('accept')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="success">Принять</Button>}
    >
      <form action={отправить}>
        <FieldGroup>
          <Field>
            <FieldLabel>Плановая дата работ <span className="text-muted-foreground">необязательно</span></FieldLabel>
            <PlannedDatePicker />
          </Field>
          <Field>
            <FieldLabel htmlFor="decision-comment">Комментарий <span className="text-muted-foreground">необязательно</span></FieldLabel>
            <Textarea id="decision-comment" name="text" rows={3}
                      placeholder="Например: работы включены в план на неделю, ответственный — мастер по добыче." />
          </Field>
        </FieldGroup>
        {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}
        <DialogFooter className="mt-4">
          <SubmitButton variant="success" pendingText="Отправляю…">Подтвердить решение</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

export function ОкноОтклонения({ card, причины, стартОткрыто }: {
  card: Card; причины: { id: number; name: string }[]; стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(решить.bind(null, 'reject', card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);
  const ошибкаПричины = ошибка?.startsWith('Выберите причину') ? ошибка : undefined;
  const ошибкаТекста = ошибка && !ошибкаПричины ? ошибка : undefined;

  return (
    <ActionDialog
      {...окно('reject')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="destructive">Отклонить</Button>}
    >
      <form action={отправить}>
        <FieldGroup>
          <Field data-invalid={Boolean(ошибкаПричины)}>
            <FieldLabel htmlFor="reject-reason-kind">Причина</FieldLabel>
            <Combobox id="reject-reason-kind" name="reason" required invalid={Boolean(ошибкаПричины)}
                      placeholder="Выберите причину"
                      options={причины.map((r) => ({ value: r.name, label: r.name }))} />
            <FieldError>{ошибкаПричины}</FieldError>
          </Field>
          <Field data-invalid={Boolean(ошибкаТекста)}>
            <FieldLabel htmlFor="reject-reason">Обоснование <span className="text-muted-foreground">обязательно</span></FieldLabel>
            <Textarea id="reject-reason" name="text" rows={4}
                      aria-invalid={Boolean(ошибкаТекста)}
                      placeholder="Что сделано или планируется вместо рекомендованного, почему рекомендация не принимается." />
            <FieldError>{ошибкаТекста}</FieldError>
          </Field>
        </FieldGroup>
        <div className="form__hint">
          В реестре обоснование попадёт в колонку «Обоснование при отклонении».
        </div>
        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Отправляю…">Отклонить</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

export function ОкноУточнения({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(решить.bind(null, 'clarify', card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog
      {...окно('clarify')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="warning">Требует уточнения</Button>}
    >
      <form action={отправить}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="clarify-request">Что требуется уточнить <span className="text-muted-foreground">обязательно</span></FieldLabel>
          <Textarea id="clarify-request" name="text" rows={4}
                    aria-invalid={Boolean(ошибка)}
                    placeholder="Какого расчёта, замера или пояснения не хватает для решения." />
          <FieldError>{ошибка}</FieldError>
        </Field>
        <div className="form__hint">
          Вся цепочка кругов уточнения сохраняется в истории.
        </div>
        <DialogFooter className="mt-4">
          <SubmitButton variant="warning" pendingText="Отправляю…">Отправить запрос</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}
