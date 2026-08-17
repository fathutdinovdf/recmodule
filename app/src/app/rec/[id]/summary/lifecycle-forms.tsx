'use client';

/* Формы действий из меню в шапке карточки.
 *
 * Открываются окном поверх карточки, а не блоком на вкладке: действие
 * необратимо, и между «нажал в меню» и «сделано» должен стоять экран, с
 * которого видно, что именно произойдёт. Окно ещё и не спорит с содержимым
 * вкладки за место — отмена рекомендации к сводке отношения не имеет, она
 * просто оттуда запускается.
 *
 * Окно несёт заголовок, поля и кнопки — и ничего больше. Пояснения и строка
 * фактов (номер, статус, остаток норматива) убраны по решению пользователя:
 * всё это стоит в самой карточке, из-под окна, и в окне читалось повтором.
 *
 * У этих пяти окон нет своей кнопки на вкладке — их открывает только пункт
 * меню в шапке, в другом поддереве компонентов. Поэтому, в отличие от окон с
 * кнопкой прямо на странице (спор о базе, решение Заказчика), здесь нет
 * `trigger`: окно либо уже открыто по `?form=…` при заходе с меню, либо не
 * смонтировано вовсе — гейт стоит на статусе, а не на клике внутри компонента.
 * `?form=…` по-прежнему задаёт лишь НАЧАЛЬНУЮ открытость, а закрытие руками
 * убирает параметр — приём общий, `useОкноДействия`.
 *
 * Ошибка приходит ответом действия (`useActionState`), а не редиректом на
 * `?err=…`: редирект закрывал окно, перерисовывал вкладку с заглушкой и
 * открывал окно заново — на отказ валидации это выглядело как мигание.
 */

import { useActionState } from 'react';
import type { Card } from '@/db/card';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { окно } from '../form-meta';
import { useОкноДействия } from '../use-dialog-state';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Textarea } from '@/components/ui/Textarea';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel, Required } from '@/components/ui/field';
import {
  зарегистрировать, удалить, отменить, передатьПовторно, создатьНаОснове, type ОтветФормы,
} from '../lifecycle';

type ЖизненнаяФорма = 'register' | 'delete' | 'cancel' | 'resend' | 'copy';

/** На каких статусах действие вообще возможно — тот же список, что в операциях. */
const СТАТУСЫ: Record<ЖизненнаяФорма, string[]> = {
  register: ['draft'],
  delete: ['draft'],
  cancel: ['registered', 'sent', 'review', 'clarify'],
  resend: ['clarify'],
  copy: ['rejected', 'cancelled'],
};

const текстОшибки = (ответ: ОтветФормы) => (ответ && 'ошибка' in ответ ? ответ.ошибка : undefined);

/** Отмена — штатное закрытие окна средствами Radix: так одинаково работают
    кнопка, Esc и клик мимо окна. */
function Отмена() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">Отмена</Button>
    </DialogClose>
  );
}

/** Все пять окон меню разом: каждое само решает, показываться ли — по статусу
    карточки, — и само знает свою начальную открытость по `форма`. */
export function ФормыДействий({ card, форма }: { card: Card; форма?: string }) {
  return (
    <>
      {СТАТУСЫ.register.includes(card.status) && (
        <ОкноРегистрации recId={card.id} стартОткрыто={форма === 'register'} />
      )}
      {СТАТУСЫ.delete.includes(card.status) && (
        <ОкноУдаления recId={card.id} стартОткрыто={форма === 'delete'} />
      )}
      {СТАТУСЫ.cancel.includes(card.status) && (
        <ОкноОтмены recId={card.id} стартОткрыто={форма === 'cancel'} />
      )}
      {СТАТУСЫ.resend.includes(card.status) && (
        <ОкноПовторнойПередачи card={card} стартОткрыто={форма === 'resend'} />
      )}
      {СТАТУСЫ.copy.includes(card.status) && (
        <ОкноКопии recId={card.id} стартОткрыто={форма === 'copy'} />
      )}
    </>
  );
}

function ОкноРегистрации({ recId, стартОткрыто }: { recId: number; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(зарегистрировать.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('register')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
        <DialogFooter>
          <SubmitButton pendingText="Регистрирую…">Зарегистрировать и передать</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

function ОкноУдаления({ recId, стартОткрыто }: { recId: number; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(удалить.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('delete')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
        <DialogFooter>
          <SubmitButton variant="destructive" pendingText="Удаляю…">Удалить черновик</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

function ОкноОтмены({ recId, стартОткрыто }: { recId: number; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(отменить.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('cancel')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="cancel-reason">
            Причина отмены <Required />
          </FieldLabel>
          <Textarea id="cancel-reason" name="text" rows={3} aria-invalid={Boolean(ошибка)}
                    placeholder="Скважина выведена в ремонт" />
          {ошибка && <FieldError>{ошибка}</FieldError>}
        </Field>
        <DialogFooter className="mt-4">
          <SubmitButton variant="destructive" pendingText="Отменяю…">Отменить рекомендацию</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

function ОкноПовторнойПередачи({ card, стартОткрыто }: { card: Card; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(передатьПовторно.bind(null, card.id), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('resend')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        <Field data-invalid={Boolean(ошибка)}>
          <FieldLabel htmlFor="resend-text">
            Уточнение <Required />
          </FieldLabel>
          <Textarea id="resend-text" name="text" rows={4} aria-invalid={Boolean(ошибка)}
                    placeholder={card.decision?.kind === 'clarify' && card.decision.comment
                      ? `Ответ на вопрос Заказчика: ${card.decision.comment}`
                      : 'Что уточнено по сравнению с первой редакцией'} />
          {ошибка && <FieldError>{ошибка}</FieldError>}
        </Field>
        <DialogFooter className="mt-4">
          <SubmitButton pendingText="Передаю…">Передать Заказчику</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

function ОкноКопии({ recId, стартОткрыто }: { recId: number; стартОткрыто: boolean }) {
  const [ответ, отправить] = useActionState(создатьНаОснове.bind(null, recId), null);
  const [открыто, переключить] = useОкноДействия(стартОткрыто, Boolean(ответ && 'готово' in ответ));
  const ошибка = текстОшибки(ответ);

  return (
    <ActionDialog {...окно('copy')} open={открыто} onOpenChange={переключить}>
      <form action={отправить}>
        {ошибка && <FieldError className="mb-3">{ошибка}</FieldError>}
        <DialogFooter>
          <SubmitButton pendingText="Создаю…">Создать черновик</SubmitButton>
          <Отмена />
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}
