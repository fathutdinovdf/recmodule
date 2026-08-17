'use client';

/* Окна вкладки «Реализация»: фиксация факта, досрочное закрытие окна и спор о
 * дате в обе стороны.
 *
 * Четыре из пяти несут собственную кнопку прямо на вкладке — она же `trigger`
 * своего окна, открытие мгновенное, без навигации (тот же приём, что у спора о
 * базе). Досрочное закрытие своей кнопки не имеет: его открывает только пункт
 * меню в шапке, поэтому у него нет `trigger` — окно либо уже открыто по
 * `?form=close` при заходе с меню, либо не открыто вовсе.
 *
 * `?form=…` в обоих случаях задаёт лишь НАЧАЛЬНУЮ открытость, закрытие руками
 * убирает параметр — общий приём, `useОкноДействия`. Ошибка приходит ответом
 * действия (`useActionState`), а не редиректом на `?err=…`.
 */

import { useActionState } from 'react';
import type { Card, CardDispute } from '@/db/card';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { Field, FieldError, FieldGroup, FieldLabel, Required } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { окно } from '../form-meta';
import { useОкноДействия } from '../use-dialog-state';
import { ФормаФиксации } from './fix-form';
import {
  зафиксировать, оспоритьДату, принятьДату, отклонитьВозражение, type ОтветФормы,
} from './actions';
import { закрытьОкноДосрочно } from '../lifecycle';

const текстОшибки = (ответ: ОтветФормы) => (ответ && 'ошибка' in ответ ? ответ.ошибка : undefined);

function Отмена() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">Отмена</Button>
    </DialogClose>
  );
}

/* ------------------------------ фиксация реализации ------------------------------ */

export function ОкноФиксации({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(зафиксировать.bind(null, card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));

  return (
    <ActionDialog
      {...окно('fact')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button>Зафиксировать реализацию</Button>}
    >
      <ФормаФиксации action={отправить} ошибка={текстОшибки(ответ)} />
    </ActionDialog>
  );
}

/* ------------------------------ досрочное закрытие ------------------------------ */

export function ФормаЗакрытия({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(закрытьОкноДосрочно.bind(null, card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('close')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="close-reason">
            Причина <Required />
          </FieldLabel>
          <Textarea id="close-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                    placeholder="Скважина остановлена в ремонт" />
          {ошибка && <FieldError>{ошибка}</FieldError>}
        </Field>
        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Закрываю…">Закрыть окно</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* ------------------------------ спор о дате ------------------------------ */

export function ОкноВозражения({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const impl = card.implementation!;
  const [ответ, отправить] = useActionState(оспоритьДату.bind(null, card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);
  const ошибкаДаты = ошибка && ошибка.includes('дат') && !ошибка.startsWith('Обоснование');

  return (
    <ActionDialog
      {...окно('dispute')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="outline">Оспорить дату реализации</Button>}
    >
      <form action={отправить}>
        <FieldGroup>
          <Field data-invalid={Boolean(ошибкаДаты)}>
            <FieldLabel htmlFor="proposed-date">
              Дата, которую считаете верной <Required />
            </FieldLabel>
            <DatePicker id="proposed-date" name="proposed_date" label="Дата, которую считаете верной"
                        defaultValue={impl.factDate} invalid={Boolean(ошибкаДаты)}
                        disabled={{ after: new Date() }} endMonth={new Date()} />
            {ошибкаДаты && <FieldError>{ошибка}</FieldError>}
          </Field>

          <Field data-invalid={Boolean(ошибка && !ошибкаДаты)}>
            <FieldLabel htmlFor="dispute-reason">
              Обоснование <Required />
            </FieldLabel>
            <Textarea id="dispute-reason" name="text" rows={4} aria-invalid={Boolean(ошибка && !ошибкаДаты)}
                      placeholder="Почему изменение режима в указанные сутки не связано с выполнением рекомендации." />
            {ошибка && !ошибкаДаты && <FieldError>{ошибка}</FieldError>}
          </Field>
        </FieldGroup>

        <DialogFooter className="mt-4">
          <SubmitButton variant="warning" pendingText="Отправляю…">Отправить возражение</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* Принятие даты Заказчика. Окно необратимое: оно переносит все 90 суток и
   удаляет посуточный расчёт — он посчитан по суткам старого окна. */
export function ОкноПринятияДаты({ card, спор, стартОткрыто }: {
  card: Card; спор: CardDispute; стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(принятьДату.bind(null, card.id, спор.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog
      {...окно('acceptDispute')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="success">Принять дату Заказчика</Button>}
    >
      <form action={отправить}>
        <div className="form__hint">
          Пересчёт идёт по сохранённым замерам: на стенд ВМАП расчёт не ходит заново,
          меняется только то, какие сутки попадают в окно.
        </div>
        {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}
        <DialogFooter className="mt-4">
          <SubmitButton variant="success" pendingText="Принимаю…">Принять дату</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

export function ОкноОтклонения({ card, спор, стартОткрыто }: {
  card: Card; спор: CardDispute; стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(отклонитьВозражение.bind(null, card.id, спор.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog
      {...окно('declineDispute')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="outline">Отклонить возражение</Button>}
    >
      <form action={отправить}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="decline-reason">
            Обоснование <Required />
          </FieldLabel>
          <Textarea id="decline-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                    placeholder="Почему дата остаётся прежней: что показывает телеметрия в спорные сутки." />
          {ошибка && <FieldError>{ошибка}</FieldError>}
        </Field>

        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Отклоняю…">Отклонить возражение</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}
