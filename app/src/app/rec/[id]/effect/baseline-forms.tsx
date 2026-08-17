'use client';

/* Окна спора о базе — клиентская половина блока базы.
 *
 * Зачем отдельным файлом. Окно должно открываться мгновенно, значит оно уже
 * стоит в разметке вкладки закрытым, а открывает его состояние, а не переход по
 * `?form=…`. Состояние — клиентское, поэтому окна съезжают в файл с
 * 'use client'; серверным остаётся всё, что требует базы и стенда ВМАП, — оно
 * приезжает сюда готовой разметкой в пропе `справка`.
 *
 * Адрес при этом не потерян: `?form=…` задаёт НАЧАЛЬНУЮ открытость. Присланная
 * ссылка и перезагрузка по-прежнему открывают окно, а закрытие руками убирает
 * параметр — иначе «назад» или обновление открывали бы его снова.
 *
 * Ошибка приходит ответом действия (`useActionState`), а не редиректом на
 * `?err=…`: редирект закрывал окно, перерисовывал вкладку с заглушкой и
 * открывал окно заново — на отказ валидации это выглядело как мигание.
 */

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { окно } from '../form-meta';
import { useОкноДействия } from '../use-dialog-state';
import {
  оспоритьБазу, принятьБазу, отклонитьВозражениеПоБазе, type ОтветФормы,
} from './actions';

const текстОшибки = (ответ: ОтветФормы) => (ответ && 'ошибка' in ответ ? ответ.ошибка : undefined);

/* Поле базового значения.
 *
 * Единица измерения стоит ВНУТРИ поля, а не в подписи. Так подпись остаётся
 * названием величины («Дебит жидкости»), а не формулой с запятой и надстрочным
 * знаком; единица же оказывается там, где на неё смотрят — рядом с числом.
 * Место под неё выгорожено правым отступом по длине самой строки, иначе
 * длинные значения заезжали бы под текст.
 *
 * Цифры табличные: три поля стоят в ряд, и без tabular-nums их разряды не
 * совпадают по вертикали — ряд выглядит неровным.
 */
function ПолеБазы({ id, name, подпись, ед, значение, ошибка }: {
  id: string; name: string; подпись: string; ед: string; значение: string; ошибка: boolean;
}) {
  return (
    <Field className="min-w-0 flex-1 basis-[120px]">
      <FieldLabel htmlFor={id}>{подпись}</FieldLabel>
      <div className="relative">
        <Input id={id} name={name} inputMode="decimal" defaultValue={значение}
               aria-invalid={ошибка}
               className="text-right [font-variant-numeric:tabular-nums]"
               style={{ paddingRight: `calc(${ед.length}ch + var(--item-gap-horizontal-m))` }} />
        <span aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--text-quaternary)]">
          {ед}
        </span>
      </div>
    </Field>
  );
}

/* ------------------------------ подача возражения ------------------------------ */

export function ОкноВозражения({ recId, значения, справка, стартОткрыто }: {
  recId: number;
  /** Действующая база — ею заполняются поля: Заказчик правит, а не набирает заново. */
  значения: { qzh: string; qn: string; ee: string };
  справка: React.ReactNode;
  стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(оспоритьБазу.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));

  const ошибка = текстОшибки(ответ);
  /* Какое поле обвести, решаем по тексту ответа: разбирать коды ради двух
     случаев не стоит, но признак должен переживать правку формулировки. */
  const ошибкаТекста = ошибка?.toLowerCase().includes('обоснование');
  const ошибкаЧисел = Boolean(ошибка) && !ошибкаТекста;

  return (
    <ActionDialog
      {...окно('baseDispute')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="outline">Оспорить базовые значения</Button>}
    >
      <form action={отправить}>
        {/* Поля в строку: три числа одной природы, и разнесённые по вертикали
            они читались бы как три разных вопроса. */}
        <FieldGroup>
          <div className="flex flex-wrap items-end gap-[var(--block-gap-default)]">
            <ПолеБазы id="base-qzh" name="base_qzh" подпись="Дебит жидкости" ед="м³/сут"
                      значение={значения.qzh} ошибка={ошибкаЧисел} />
            <ПолеБазы id="base-qn" name="base_qn" подпись="Дебит нефти" ед="т/сут"
                      значение={значения.qn} ошибка={ошибкаЧисел} />
            <ПолеБазы id="base-ee" name="base_ee" подпись="Энергопотребление" ед="кВт·ч/сут"
                      значение={значения.ee} ошибка={ошибкаЧисел} />
          </div>

          <Field>
            <FieldLabel htmlFor="base-dispute-reason">Обоснование</FieldLabel>
            <Textarea id="base-dispute-reason" name="text" rows={4} aria-invalid={ошибкаТекста}
                      placeholder="Откуда взяты предлагаемые значения: режим месяца, замеры каких суток, что не так в действующей базе." />
          </Field>
        </FieldGroup>

        {справка}

        {/* Ошибка одной строкой над кнопками, а не подписью под каждым полем:
            причина отказа бывает общей («значения совпадают с действующей
            базой»), и место у неё должно быть одно и то же.

            Незаполненное обоснование текстом не поясняется вовсе: пустое поле,
            обведённое красным, говорит то же самое, а строка под ним была бы
            пересказом очевидного. Текстом объясняются только те отказы, причину
            которых по форме не видно. */}
        {ошибка && !ошибкаТекста && (
          <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>
        )}

        <DialogFooter className="mt-4">
          <SubmitButton variant="warning" pendingText="Отправляю…">Отправить возражение</SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="outline">Отмена</Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

/* ------------------------------ разбор возражения ------------------------------ */

export function ОкноПринятия({ recId, disputeId, справка, стартОткрыто }: {
  recId: number; disputeId: number; справка: React.ReactNode; стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(принятьБазу.bind(null, recId, disputeId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog
      {...окно('baseAccept')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="success">Принять базу Заказчика</Button>}
    >
      <form action={отправить}>
        {справка}
        <div className="form__hint" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
          Пересчёт идёт по сохранённым замерам: заново на стенд ВМАП расчёт не ходит,
          меняется только то, от чего отсчитывается прирост. Итог станет окончательным,
          когда закроется окно.
        </div>
        {ошибка && <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>}
        <DialogFooter className="mt-4">
          <SubmitButton variant="success" pendingText="Принимаю…">Принять базу</SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="outline">Отмена</Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

export function ОкноОтклонения({ recId, disputeId, справка, стартОткрыто }: {
  recId: number; disputeId: number; справка: React.ReactNode; стартОткрыто: boolean;
}) {
  const [ответ, отправить] = useActionState(отклонитьВозражениеПоБазе.bind(null, recId, disputeId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);
  /* Пустое обоснование показывает рамка поля — см. окно возражения. */
  const ошибкаТекста = ошибка?.toLowerCase().includes('обоснование');

  return (
    <ActionDialog
      {...окно('baseDecline')}
      open={открыто}
      onOpenChange={переключить}
      trigger={<Button variant="outline">Отклонить возражение</Button>}
    >
      <form action={отправить}>
        <Field>
          <FieldLabel htmlFor="base-decline-reason">Обоснование</FieldLabel>
          <Textarea id="base-decline-reason" name="text" rows={3} aria-invalid={ошибкаТекста}
                    placeholder="Почему база остаётся прежней: какими замерами она подтверждается." />
        </Field>

        {справка}

        <div className="form__hint" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
          Пометка о споре сохраняется в карточке и в истории. Дальнейшее разбирательство
          идёт вне модуля, по разделу 10 договора.
        </div>

        {ошибка && !ошибкаТекста && (
          <FieldError className="mt-[var(--group-gap-m)]">{ошибка}</FieldError>
        )}

        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Отклоняю…">Отклонить возражение</SubmitButton>
          <DialogClose asChild>
            <Button type="button" variant="outline">Отмена</Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}
